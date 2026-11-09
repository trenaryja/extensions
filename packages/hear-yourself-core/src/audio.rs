use std::sync::Arc;
use std::sync::atomic::{AtomicU32, AtomicU64, AtomicUsize, Ordering::Relaxed};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread::sleep;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{BufferSize, Device, ErrorKind, InputCallbackInfo, OutputCallbackInfo, Stream, StreamConfig};
use ringbuf::HeapRb;
use ringbuf::traits::{Consumer, Observer, Producer, Split};
use serde_json::{Value, json};

use crate::message;

pub struct Options {
	pub input: Option<String>,
	pub output: Option<String>,
	pub blocksize: u32,
	pub volume: f32,
}

#[derive(Default)]
struct Meters {
	peak: AtomicU32,
	starved: AtomicU64,
	discarded: AtomicU64,
	buffered: AtomicUsize,
}

struct Monitor {
	_streams: [Stream; 2],
	lost: Receiver<()>,
	out_channels: usize,
	input_rate: u32,
	output_rate: u32,
}

/// Stays on the devices resolved at start: following macOS to its next default could route the mic into speakers.
pub struct Session {
	options: Options,
	input: String,
	output: String,
	meters: Arc<Meters>,
	monitor: Option<Monitor>,
	missing: Vec<String>,
	switch_input: Option<String>,
	switch_output: Option<String>,
}

fn find(mut devices: impl Iterator<Item = Device>, name: &str) -> Result<Device, String> {
	devices
		.find(|device| device.to_string() == name)
		.ok_or_else(|| format!("No device named {name}"))
}

fn is_present(devices: Result<impl Iterator<Item = Device>, cpal::Error>, name: &str) -> bool {
	devices.is_ok_and(|devices| find(devices, name).is_ok())
}

pub fn devices() -> Result<Value, String> {
	let host = cpal::default_host();
	let inputs: Vec<String> = host.input_devices().map_err(message)?.map(|x| x.to_string()).collect();
	let outputs: Vec<String> = host.output_devices().map_err(message)?.map(|x| x.to_string()).collect();
	Ok(json!({
		"inputs": inputs,
		"outputs": outputs,
		"defaultInput": host.default_input_device().map(|x| x.to_string()),
		"defaultOutput": host.default_output_device().map(|x| x.to_string()),
	}))
}

impl Monitor {
	fn start(input: &str, output: &str, options: &Options, meters: &Arc<Meters>) -> Result<Self, String> {
		let host = cpal::default_host();
		let input = find(host.input_devices().map_err(message)?, input)?;
		let output = find(host.output_devices().map_err(message)?, output)?;
		// Each device runs at its current format: opening at any other rate would change it system-wide.
		let current = |config: cpal::SupportedStreamConfig| StreamConfig {
			channels: config.channels(),
			sample_rate: config.sample_rate(),
			buffer_size: BufferSize::Fixed(options.blocksize),
		};
		let in_config = current(input.default_input_config().map_err(message)?);
		let out_config = current(output.default_output_config().map_err(message)?);
		let (in_channels, out_channels) = (in_config.channels, out_config.channels);
		let (input_rate, output_rate) = (in_config.sample_rate, out_config.sample_rate);
		let (lost_sender, lost) = mpsc::channel();
		let on_error = |label: &'static str| {
			let lost_sender = lost_sender.clone();
			move |error: cpal::Error| {
				eprintln!("{label} stream: {error}");
				// cpal pauses the stream for both of these; anything else (an xrun, say) leaves audio flowing.
				if matches!(
					error.kind(),
					ErrorKind::DeviceNotAvailable | ErrorKind::StreamInvalidated
				) {
					let _ = lost_sender.send(());
				}
			}
		};

		let cushion = options.blocksize as usize * usize::from(out_channels);
		// Bluetooth outputs ignore the requested blocksize (QC35 pulls 256 frames); the backlog trim, not capacity, bounds latency.
		let (mut producer, mut consumer) = HeapRb::<f32>::new(output_rate as usize * usize::from(out_channels)).split();
		producer.push_slice(&vec![0.0; cushion]);

		let input_meters = Arc::clone(meters);
		let volume = options.volume;
		let step = f64::from(input_rate) / f64::from(output_rate);
		// Linear interpolation between consecutive input samples; at equal rates it emits each sample unchanged.
		let (mut phase, mut previous) = (0.0_f64, 0.0_f32);
		let input_stream = input
			.build_input_stream(
				in_config,
				move |data: &[f32], _: &InputCallbackInfo| {
					let mut peak = 0.0_f32;
					let mut dropped = false;
					for frame in data.chunks(usize::from(in_channels)) {
						peak = peak.max(frame[0].abs());
						let sample = frame[0] * volume;
						while phase < 1.0 {
							let interpolated = previous + (sample - previous) * phase as f32;
							for _ in 0..out_channels {
								dropped |= producer.try_push(interpolated).is_err();
							}
							phase += step;
						}
						phase -= 1.0;
						previous = sample;
					}
					input_meters.peak.fetch_max(peak.to_bits(), Relaxed);
					if dropped {
						input_meters.discarded.fetch_add(1, Relaxed);
					}
				},
				on_error("input"),
				None,
			)
			.map_err(message)?;

		let output_meters = Arc::clone(meters);
		let output_stream = output
			.build_output_stream(
				out_config,
				move |data: &mut [f32], _: &OutputCallbackInfo| {
					// Whatever sits past one cushion is latency: startup backlog, or the input clock running fast.
					let backlog = consumer.occupied_len().saturating_sub(data.len() + cushion);
					if backlog > 0 {
						consumer.skip(backlog);
						output_meters.discarded.fetch_add(1, Relaxed);
					}
					if consumer.pop_slice(data) < data.len() {
						output_meters.starved.fetch_add(1, Relaxed);
					}
					output_meters.buffered.store(consumer.occupied_len(), Relaxed);
				},
				on_error("output"),
				None,
			)
			.map_err(message)?;

		input_stream.play().map_err(message)?;
		output_stream.play().map_err(message)?;

		Ok(Self {
			_streams: [input_stream, output_stream],
			lost,
			out_channels: usize::from(out_channels),
			input_rate,
			output_rate,
		})
	}
}

impl Session {
	pub fn start(options: Options) -> Result<Self, String> {
		let host = cpal::default_host();
		let input = match &options.input {
			Some(name) => name.clone(),
			None => host
				.default_input_device()
				.ok_or("No default input device")?
				.to_string(),
		};
		let output = match &options.output {
			Some(name) => name.clone(),
			None => host
				.default_output_device()
				.ok_or("No default output device")?
				.to_string(),
		};
		let meters = Arc::new(Meters::default());
		let monitor = Monitor::start(&input, &output, &options, &meters)?;
		Ok(Self {
			options,
			input,
			output,
			meters,
			monitor: Some(monitor),
			missing: Vec::new(),
			switch_input: None,
			switch_output: None,
		})
	}

	/// Waits up to `timeout` for a lost device, retries a paused session, and reports whether anything a user sees changed.
	pub fn tick(&mut self, timeout: Duration) -> bool {
		let before = (
			self.monitor.is_some(),
			self.missing.clone(),
			self.switch_input.clone(),
			self.switch_output.clone(),
		);
		let host = cpal::default_host();
		match &self.monitor {
			Some(monitor) => {
				if monitor.lost.recv_timeout(timeout) != Err(RecvTimeoutError::Timeout) {
					self.monitor = None;
				}
			}
			None => {
				sleep(timeout);
				self.monitor = Monitor::start(&self.input, &self.output, &self.options, &self.meters).ok();
			}
		}
		self.missing.clear();
		if self.monitor.is_none() {
			if !is_present(host.input_devices(), &self.input) {
				self.missing.push(self.input.clone());
			}
			if !is_present(host.output_devices(), &self.output) {
				self.missing.push(self.output.clone());
			}
		}
		// Only offered on System Default, and only while audio flows: a paused session resumes on its own devices.
		let offer = |chosen: &Option<String>, default: Option<Device>, current: &str| {
			let name = default
				.filter(|_| chosen.is_none() && self.monitor.is_some())?
				.to_string();
			(name != current).then_some(name)
		};
		self.switch_input = offer(&self.options.input, host.default_input_device(), &self.input);
		self.switch_output = offer(&self.options.output, host.default_output_device(), &self.output);
		before
			!= (
				self.monitor.is_some(),
				self.missing.clone(),
				self.switch_input.clone(),
				self.switch_output.clone(),
			)
	}

	/// Peak level covers the interval since the previous snapshot.
	pub fn snapshot(&self) -> Value {
		let peak = f32::from_bits(self.meters.peak.swap(0, Relaxed));
		let buffered_ms = self.monitor.as_ref().map(|monitor| {
			let frames = self.meters.buffered.load(Relaxed) / monitor.out_channels;
			frames as f64 * 1000.0 / f64::from(monitor.output_rate)
		});
		json!({
			"running": true,
			"pid": std::process::id(),
			"input": self.input,
			"output": self.output,
			"inputRate": self.monitor.as_ref().map(|monitor| monitor.input_rate),
			"outputRate": self.monitor.as_ref().map(|monitor| monitor.output_rate),
			"blocksize": self.options.blocksize,
			"volume": self.options.volume,
			"waitingFor": self.monitor.is_none().then_some(&self.missing),
			"switchInput": self.switch_input,
			"switchOutput": self.switch_output,
			"inputPeakDb": (peak > 0.0).then(|| 20.0 * peak.log10()),
			"starved": self.meters.starved.load(Relaxed),
			"discarded": self.meters.discarded.load(Relaxed),
			"bufferedMs": buffered_ms,
		})
	}
}
