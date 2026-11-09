mod audio;

use std::env;
use std::fmt::Display;
use std::fs::{self, File};
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, ExitCode, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

const USAGE: &str = "usage: hear-yourself-core <start|stop|toggle|status|devices> [--input NAME] [--output NAME] [--blocksize FRAMES] [--volume GAIN] [--notify-url URL]";

fn message(error: impl Display) -> String {
	error.to_string()
}

fn state_dir() -> PathBuf {
	env::home_dir()
		.expect("home directory")
		.join(".local/state/hear-yourself")
}

fn is_alive(pid: i32) -> bool {
	unsafe { libc::kill(pid, 0) == 0 }
}

fn pid_of(state: &Value) -> Option<i32> {
	i32::try_from(state["pid"].as_i64()?).ok()
}

fn running_state() -> Option<Value> {
	let state: Value = serde_json::from_str(&fs::read_to_string(state_dir().join("state.json")).ok()?).ok()?;
	is_alive(pid_of(&state)?).then_some(state)
}

/// Refreshes the menu bar, which otherwise shows its last render until clicked.
fn notify(url: &str) {
	let _ = Command::new("/usr/bin/open").args(["-g", url]).status();
}

fn status() -> Value {
	running_state().unwrap_or_else(|| json!({ "running": false }))
}

/// The notify URL is opened whenever the session pauses, resumes, or starts offering a switch.
fn options(args: &[String]) -> Result<(audio::Options, Option<String>), String> {
	let mut notify_url = None;
	let mut options = audio::Options {
		input: None,
		output: None,
		blocksize: 32,
		volume: 1.0,
	};
	for pair in args.chunks(2) {
		let [flag, value] = pair else {
			return Err(format!("{} needs a value", pair[0]));
		};
		match flag.as_str() {
			"--input" => options.input = Some(value.clone()),
			"--output" => options.output = Some(value.clone()),
			"--blocksize" => options.blocksize = value.parse().map_err(|_| format!("Bad blocksize {value}"))?,
			"--volume" => options.volume = value.parse().map_err(|_| format!("Bad volume {value}"))?,
			"--notify-url" => notify_url = Some(value.clone()),
			_ => return Err(format!("Unknown flag {flag}\n{USAGE}")),
		}
	}
	Ok((options, notify_url))
}

fn start(args: &[String]) -> Result<Value, String> {
	options(args)?;
	if let Some(state) = running_state() {
		return Ok(state);
	}
	let dir = state_dir();
	fs::create_dir_all(&dir).map_err(message)?;
	let log = dir.join("engine.log");
	let mut child = Command::new(env::current_exe().map_err(message)?)
		.arg("run")
		.args(args)
		.stdin(Stdio::null())
		.stdout(Stdio::null())
		.stderr(File::create(&log).map_err(message)?)
		.process_group(0)
		.spawn()
		.map_err(message)?;

	let deadline = Instant::now() + Duration::from_secs(3);
	while Instant::now() < deadline {
		if let Some(state) = running_state() {
			return Ok(state);
		}
		if let Some(code) = child.try_wait().map_err(message)? {
			let logged = fs::read_to_string(&log).unwrap_or_default();
			return Err(if logged.trim().is_empty() {
				format!("Engine exited with {code}")
			} else {
				logged.trim().into()
			});
		}
		sleep(Duration::from_millis(20));
	}
	Err("Engine did not start within 3s".into())
}

fn stop() -> Value {
	let Some(pid) = running_state().as_ref().and_then(pid_of) else {
		return json!({ "stopped": false });
	};
	unsafe { libc::kill(pid, libc::SIGTERM) };
	let deadline = Instant::now() + Duration::from_secs(1);
	while is_alive(pid) && Instant::now() < deadline {
		sleep(Duration::from_millis(10));
	}
	// No notify: a menu bar launch while the clicked menu unloads is dropped, so the menu action refreshes it after a wait.
	let _ = fs::remove_file(state_dir().join("state.json"));
	json!({ "stopped": true })
}

fn toggle(args: &[String]) -> Result<Value, String> {
	if running_state().is_none() {
		return start(args);
	}
	stop();
	Ok(status())
}

fn run(args: &[String]) -> Result<Value, String> {
	let (options, notify_url) = options(args)?;
	let mut session = audio::Session::start(options)?;
	let dir = state_dir();
	// Also fired at launch, so Raycast's one-time link approval appears as the user presses Start, not mid-unplug.
	let mut changed = true;
	let failure = loop {
		// Written whole then renamed: a status poll must never read half a file.
		let written = fs::write(dir.join("state.tmp"), session.snapshot().to_string())
			.and_then(|()| fs::rename(dir.join("state.tmp"), dir.join("state.json")));
		if let Err(error) = written {
			break message(error);
		}
		if changed && let Some(url) = &notify_url {
			notify(url);
		}
		changed = session.tick(Duration::from_secs(1));
	};
	let _ = fs::remove_file(dir.join("state.json"));
	if let Some(url) = &notify_url {
		notify(url);
	}
	Err(failure)
}

fn main() -> ExitCode {
	let args: Vec<String> = env::args().skip(1).collect();
	let Some((verb, rest)) = args.split_first() else {
		eprintln!("{USAGE}");
		return ExitCode::FAILURE;
	};
	let result = match verb.as_str() {
		"start" => start(rest),
		"stop" => Ok(stop()),
		"toggle" => toggle(rest),
		"status" => Ok(status()),
		"devices" => audio::devices(),
		"run" => run(rest),
		_ => Err(USAGE.into()),
	};
	match result {
		Ok(value) => {
			println!("{value}");
			ExitCode::SUCCESS
		}
		Err(error) => {
			eprintln!("{error}");
			ExitCode::FAILURE
		}
	}
}
