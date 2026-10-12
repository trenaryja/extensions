use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, SampleFormat, SizedSample, Stream, StreamConfig};
use std::f32::consts::{PI, TAU};
use std::sync::mpsc::{self, Sender};
use std::thread::sleep;
use std::time::Duration;

pub enum Chime {
    Start,
    Stop,
}

const NOTE_SECONDS: f32 = 0.07;
const VOLUME: f32 = 0.15;
/// The callback runs ahead of the speaker by a buffer, so dropping the stream the moment the last sample
/// is written would clip the tail.
const DRAIN: Duration = Duration::from_millis(100);

impl Chime {
    fn notes(&self) -> [f32; 2] {
        match self {
            Chime::Start => [660.0, 880.0],
            Chime::Stop => [880.0, 660.0],
        }
    }
}

/// Plays on the default output and returns once it is heard. A machine with no output, or one that
/// refuses the stream, dictates in silence rather than failing.
pub fn play(chime: Chime) {
    let Some(device) = cpal::default_host().default_output_device() else {
        return;
    };
    let Ok(supported) = device.default_output_config() else {
        return;
    };
    let config = supported.config();
    let (done, finished) = mpsc::channel();
    let notes = chime.notes();
    let stream = match supported.sample_format() {
        SampleFormat::F32 => build::<f32>(&device, &config, notes, done),
        SampleFormat::I16 => build::<i16>(&device, &config, notes, done),
        SampleFormat::U16 => build::<u16>(&device, &config, notes, done),
        _ => None,
    };
    let Some(stream) = stream.filter(|stream| stream.play().is_ok()) else {
        return;
    };
    if finished.recv_timeout(Duration::from_secs(1)).is_ok() {
        sleep(DRAIN);
    }
    drop(stream);
}

fn build<T: SizedSample + FromSample<f32>>(
    device: &Device,
    config: &StreamConfig,
    notes: [f32; 2],
    done: Sender<()>,
) -> Option<Stream> {
    let rate = config.sample_rate.0 as f32;
    let channels = usize::from(config.channels);
    let per_note = (NOTE_SECONDS * rate) as usize;
    let mut index = 0;
    device
        .build_output_stream(
            config,
            move |data: &mut [T], _| {
                for frame in data.chunks_mut(channels) {
                    let sample = match notes.get(index / per_note) {
                        Some(frequency) => {
                            // A half-sine envelope per note: without it each note starts and ends on a click.
                            let within = (index % per_note) as f32 / per_note as f32;
                            VOLUME
                                * (within * PI).sin()
                                * (TAU * frequency * index as f32 / rate).sin()
                        }
                        None => {
                            if index == per_note * notes.len() {
                                let _ = done.send(());
                            }
                            0.0
                        }
                    };
                    frame.fill(T::from_sample(sample));
                    index += 1;
                }
            },
            |_| {},
            None,
        )
        .ok()
}
