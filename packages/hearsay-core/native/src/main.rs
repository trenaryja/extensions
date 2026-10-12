mod audio_toolkit;
mod chime;
mod dictionary;
mod punctuation;

use std::env;
use std::fmt::Display;
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::Arc;
use std::thread::{self, sleep};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use chime::Chime;
use dictionary::Dictionary;

use audio_toolkit::constants::WHISPER_SAMPLE_RATE;
use audio_toolkit::vad::{
    frames_for_duration_ms, VAD_OFFLINE_HANGOVER_MS, VAD_ONSET_MS, VAD_PREFILL_MS,
    VAD_STREAMING_HANGOVER_MS,
};
use audio_toolkit::{
    is_microphone_access_denied, is_no_input_device_error, list_input_devices, read_wav_samples,
    save_wav_file, AudioRecorder, EarshotVad, SmoothedVad, VadPolicy, VoiceActivityDetector,
};
use whisper_rs::{
    install_logging_hooks, FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters,
    WhisperState,
};

const USAGE: &str = "usage: hearsay-native <verb> [flags]
  devices
  listen [--device NAME] [--seconds N] [--out PATH] [--vad off|offline|streaming]
  transcribe --model PATH --wav PATH [--language LANG] [--prompt TEXT] [--threads N]
             [--dictionary JSON]
  dictate --model PATH [--device NAME] [--seconds N] [--out PATH] [--language LANG]
          [--threads N] [--partial-ms N|0] [--silence-ms N] [--max-seconds N]
          [--dictionary JSON] [--chime on|off]
  correct --dictionary JSON --text TEXT [--text TEXT]...

  JSON is {\"vocabulary\": [\"CLAUDE.md\"], \"replacements\": {\"clawed\": \"Claude\"}}";

const POLL: Duration = Duration::from_millis(50);

fn message(error: impl Display) -> String {
    error.to_string()
}

/// One JSON object per line, flushed immediately — the consumer reads this as a stream.
fn emit(event: &Value) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{event}");
    let _ = out.flush();
}

fn devices() -> Result<Value, String> {
    let found = list_input_devices().map_err(message)?;
    let listed: Vec<Value> = found
        .iter()
        .map(|device| json!({ "index": device.index, "name": device.name, "isDefault": device.is_default }))
        .collect();
    Ok(json!({ "devices": listed }))
}

/// Every flag takes a value, so a dangling last arg is a user error rather than a positional.
fn flags(args: &[String]) -> Result<Vec<(&str, &str)>, String> {
    let mut pairs = Vec::new();
    for pair in args.chunks(2) {
        let [flag, value] = pair else {
            return Err(format!("{} needs a value\n{USAGE}", pair[0]));
        };
        pairs.push((flag.as_str(), value.as_str()));
    }
    Ok(pairs)
}

struct Options {
    device: Option<String>,
    seconds: Option<f64>,
    out: PathBuf,
    vad: VadPolicy,
}

fn options(args: &[String]) -> Result<Options, String> {
    let mut options = Options {
        device: None,
        seconds: None,
        out: env::temp_dir().join("hearsay-listen.wav"),
        vad: VadPolicy::Offline,
    };
    for (flag, value) in flags(args)? {
        match flag {
            "--device" => options.device = Some(value.to_string()),
            "--seconds" => {
                options.seconds = Some(value.parse().map_err(|_| format!("Bad seconds {value}"))?)
            }
            "--out" => options.out = PathBuf::from(value),
            "--vad" => {
                options.vad = match value {
                    "off" => VadPolicy::Disabled,
                    "offline" => VadPolicy::Offline,
                    "streaming" => VadPolicy::Streaming,
                    _ => return Err(format!("Bad vad {value}\n{USAGE}")),
                }
            }
            _ => return Err(format!("Unknown flag {flag}\n{USAGE}")),
        }
    }
    Ok(options)
}

/// Lines arriving on stdin, forwarded off the main thread so the record loop can also watch a deadline.
fn stdin_commands() -> mpsc::Receiver<String> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines().map_while(Result::ok) {
            if tx.send(line).is_err() {
                return;
            }
        }
    });
    rx
}

/// A recorder opened on the requested device, plus the flag that gates its level events.
struct Capture {
    recorder: AudioRecorder,
    ready: Arc<AtomicBool>,
}

/// Device lookup, Handy's smoothing profile and the level meter — every verb that records wants all
/// three. `frames` opts into the live feed; `listen` has no use for it and leaves it off.
fn capture(
    device: Option<&str>,
    frames: Option<mpsc::Sender<Vec<f32>>>,
) -> Result<Capture, String> {
    let device = match device {
        Some(name) => Some(
            list_input_devices()
                .map_err(message)?
                .into_iter()
                .find(|found| found.name == name)
                .ok_or_else(|| format!("No input device named {name}"))?
                .device,
        ),
        None => None,
    };

    let detector = Box::new(EarshotVad::new(0.5).map_err(message)?);
    let frame_samples = detector.frame_samples();
    let offline_hangover_frames = frames_for_duration_ms(VAD_OFFLINE_HANGOVER_MS, frame_samples);
    let smoothed = SmoothedVad::new(
        detector,
        frames_for_duration_ms(VAD_PREFILL_MS, frame_samples),
        offline_hangover_frames,
        frames_for_duration_ms(VAD_ONSET_MS, frame_samples),
    );

    // Levels are gated on `ready` so the first line out is always the ready event.
    let ready = Arc::new(AtomicBool::new(false));
    let level_ready = ready.clone();
    let mut recorder = AudioRecorder::new()
        .map_err(message)?
        .with_vad(
            Box::new(smoothed),
            offline_hangover_frames,
            frames_for_duration_ms(VAD_STREAMING_HANGOVER_MS, frame_samples),
        )
        .with_level_callback(move |bands| {
            if level_ready.load(Ordering::Relaxed) {
                emit(&json!({ "event": "level", "bands": bands }));
            }
        });
    if let Some(frames) = frames {
        // Runs on the recorder's consumer thread, where anything slower than a send stalls capture.
        recorder = recorder.with_audio_callback(move |frame| {
            let _ = frames.send(frame.to_vec());
        });
    }

    recorder.open(device).map_err(|error| {
        let error = message(error);
        if is_microphone_access_denied(&error) {
            format!(
                "Microphone access is denied for this app — grant it in the OS settings ({error})"
            )
        } else if is_no_input_device_error(&error) {
            format!("No microphone is available ({error})")
        } else {
            error
        }
    })?;
    Ok(Capture { recorder, ready })
}

fn listen(args: &[String]) -> Result<Value, String> {
    let options = options(args)?;
    let mut capture = capture(options.device.as_deref(), None)?;
    capture
        .recorder
        .start(options.vad)
        .map_err(message)?
        .recv()
        .map_err(message)?;
    capture.ready.store(true, Ordering::Relaxed);
    emit(&json!({ "event": "ready" }));

    let commands = stdin_commands();
    let deadline = options
        .seconds
        .map(|seconds| Instant::now() + Duration::from_secs_f64(seconds));
    let mut cancelled = false;
    let mut closed = false;
    loop {
        if deadline.is_some_and(|at| Instant::now() >= at) {
            break;
        }
        if closed {
            sleep(POLL);
            continue;
        }
        match commands.recv_timeout(POLL) {
            Ok(line) => {
                cancelled = line.trim() == "cancel";
                break;
            }
            Err(RecvTimeoutError::Timeout) => {}
            // stdin closed: harmless under `--seconds`, but without one nobody is left to stop us.
            Err(RecvTimeoutError::Disconnected) => {
                if deadline.is_none() {
                    break;
                }
                closed = true;
            }
        }
    }

    let samples = capture.recorder.stop().map_err(message)?;
    capture.recorder.close().map_err(message)?;
    if cancelled {
        return Ok(json!({ "event": "cancelled" }));
    }

    save_wav_file(&options.out, &samples).map_err(message)?;
    Ok(json!({
        "event": "done",
        "wav": options.out.to_string_lossy(),
        "samples": samples.len(),
        "seconds": samples.len() as f64 / f64::from(WHISPER_SAMPLE_RATE),
    }))
}

/// whisper.cpp saturates every core it is given; leaving one keeps the editor responsive during a take.
fn default_threads() -> i32 {
    std::thread::available_parallelism().map_or(4, |cores| (cores.get() as i32 - 1).clamp(1, 8))
}

struct Job {
    model: PathBuf,
    wav: PathBuf,
    language: String,
    prompt: Option<String>,
    threads: i32,
    dictionary: Dictionary,
}

fn job(args: &[String]) -> Result<Job, String> {
    let mut model = None;
    let mut wav = None;
    // The default model is `base.en`; anything multilingual is reached by passing `--language`.
    let mut language = "en".to_string();
    let mut prompt = None;
    let mut threads = default_threads();
    let mut dictionary = Dictionary::default();
    for (flag, value) in flags(args)? {
        match flag {
            "--model" => model = Some(PathBuf::from(value)),
            "--wav" => wav = Some(PathBuf::from(value)),
            "--language" => language = value.to_string(),
            "--prompt" => prompt = Some(value.to_string()),
            "--threads" => threads = value.parse().map_err(|_| format!("Bad threads {value}"))?,
            "--dictionary" => dictionary = Dictionary::parse(value)?,
            _ => return Err(format!("Unknown flag {flag}\n{USAGE}")),
        }
    }
    Ok(Job {
        model: model.ok_or("transcribe needs --model")?,
        wav: wav.ok_or("transcribe needs --wav")?,
        language,
        prompt,
        threads,
        dictionary,
    })
}

/// Whisper's every-call setup. The prompt biases decoding — the dictionary and the text already
/// committed this session both arrive through it.
fn params<'a>(language: &'a str, threads: i32, prompt: Option<&str>) -> FullParams<'a, 'a> {
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 0 });
    params.set_n_threads(threads);
    params.set_language(Some(language));
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    if let Some(prompt) = prompt {
        params.set_initial_prompt(prompt);
    }
    params
}

fn transcribe(args: &[String]) -> Result<Value, String> {
    let job = job(args)?;
    let samples = read_wav_samples(&job.wav)
        .map_err(|error| format!("Could not read {}: {error}", job.wav.display()))?;

    // Neither log_backend nor tracing_backend is on, so this drops whisper.cpp's chatter entirely —
    // it writes to our stderr otherwise, which is the helper's error channel.
    install_logging_hooks();

    let started = Instant::now();
    let context = WhisperContext::new_with_params(&job.model, WhisperContextParameters::default())
        .map_err(|error| format!("Could not load model {}: {error}", job.model.display()))?;
    let mut state = context.create_state().map_err(message)?;
    let loaded = started.elapsed();

    let ran = Instant::now();
    state
        .full(
            params(
                &job.language,
                job.threads,
                job.dictionary
                    .prompt(job.prompt.as_deref().unwrap_or_default())
                    .as_deref(),
            ),
            &samples,
        )
        .map_err(message)?;

    let mut text = String::new();
    let mut segments = Vec::new();
    for segment in state.as_iter() {
        let said = segment.to_str_lossy().map_err(message)?;
        text.push_str(&said);
        segments.push(json!({
            // whisper timestamps are centiseconds; everything else in the protocol is seconds.
            "start": segment.start_timestamp() as f64 / 100.0,
            "end": segment.end_timestamp() as f64 / 100.0,
            "text": said.trim(),
        }));
    }

    let raw = text.trim();
    Ok(json!({
        "text": job.dictionary.correct(raw),
        "raw": raw,
        "segments": segments,
        "seconds": samples.len() as f64 / f64::from(WHISPER_SAMPLE_RATE),
        "loadMs": loaded.as_millis(),
        "ms": ran.elapsed().as_millis(),
    }))
}

/// How much of the session's committed text is fed back as whisper's prompt. Long enough to carry a
/// sentence of context, short enough that a long session never grows the prompt without bound.
const PROMPT_CHARS: usize = 200;

/// Byte-slicing a `String` tail can land mid-character, so the cut is found by character.
fn tail(text: &str) -> &str {
    let skip = text.chars().count().saturating_sub(PROMPT_CHARS);
    text.char_indices()
        .nth(skip)
        .map_or(text, |(at, _)| &text[at..])
}

struct Dictation {
    model: PathBuf,
    device: Option<String>,
    seconds: Option<f64>,
    out: PathBuf,
    language: String,
    threads: i32,
    /// Zero means no partials: nobody is watching, so the CPU goes to the commits instead.
    partial: Duration,
    silence: Duration,
    max_seconds: f64,
    dictionary: Dictionary,
    chime: bool,
}

fn dictation(args: &[String]) -> Result<Dictation, String> {
    let mut model = None;
    let mut options = Dictation {
        model: PathBuf::new(),
        device: None,
        seconds: None,
        out: env::temp_dir().join("hearsay-dictate.wav"),
        language: "en".to_string(),
        threads: default_threads(),
        partial: Duration::from_millis(500),
        silence: Duration::from_millis(500),
        max_seconds: 30.0,
        dictionary: Dictionary::default(),
        chime: false,
    };
    let number = |flag: &str, value: &str| -> Result<u64, String> {
        value.parse().map_err(|_| format!("Bad {flag} {value}"))
    };
    for (flag, value) in flags(args)? {
        match flag {
            "--model" => model = Some(PathBuf::from(value)),
            "--device" => options.device = Some(value.to_string()),
            "--seconds" => {
                options.seconds = Some(value.parse().map_err(|_| format!("Bad seconds {value}"))?)
            }
            "--out" => options.out = PathBuf::from(value),
            "--language" => options.language = value.to_string(),
            "--threads" => {
                options.threads = value.parse().map_err(|_| format!("Bad threads {value}"))?
            }
            "--partial-ms" => options.partial = Duration::from_millis(number(flag, value)?),
            "--silence-ms" => options.silence = Duration::from_millis(number(flag, value)?),
            "--max-seconds" => {
                options.max_seconds = value
                    .parse()
                    .map_err(|_| format!("Bad max-seconds {value}"))?
            }
            "--dictionary" => options.dictionary = Dictionary::parse(value)?,
            "--chime" => {
                options.chime = match value {
                    "on" => true,
                    "off" => false,
                    _ => return Err(format!("Bad chime {value}")),
                }
            }
            _ => return Err(format!("Unknown flag {flag}\n{USAGE}")),
        }
    }
    options.model = model.ok_or("dictate needs --model")?;
    Ok(options)
}

/// One whisper pass over a buffer. A partial and a finished utterance differ only in what the caller
/// does with the text, so they share this.
fn decode(
    state: &mut WhisperState,
    samples: &[f32],
    job: &Dictation,
    said: &str,
) -> Result<String, String> {
    state
        .full(
            params(
                &job.language,
                job.threads,
                job.dictionary.prompt(tail(said)).as_deref(),
            ),
            samples,
        )
        .map_err(message)?;
    let mut text = String::new();
    for segment in state.as_iter() {
        text.push_str(&segment.to_str_lossy().map_err(message)?);
    }
    Ok(text.trim().to_string())
}

/// Report a decoded utterance, and fold it into the context the next one is prompted with. `ended`
/// is false only for a cut at `--max-seconds`, which can land mid-sentence.
/// The preview's text when it already covered every sample, which saves a whole decode per commit.
fn redecode(
    previewed: Option<(usize, String)>,
    state: &mut WhisperState,
    samples: &[f32],
    job: &Dictation,
    said: &str,
) -> Result<String, String> {
    match previewed {
        Some((covered, raw)) if covered == samples.len() => Ok(raw),
        _ => decode(state, samples, job, said),
    }
}

fn commit(raw: String, current: &mut Vec<f32>, job: &Dictation, said: &mut String, ended: bool) {
    let text = punctuation::smooth(&job.dictionary.correct(&raw));
    let text = if ended {
        punctuation::close(&text)
    } else {
        text
    };
    let seconds = current.len() as f64 / f64::from(WHISPER_SAMPLE_RATE);
    current.clear();
    emit(&json!({ "event": "utterance", "text": text, "raw": raw, "seconds": seconds }));
    if !text.is_empty() {
        if !said.is_empty() {
            said.push(' ');
        }
        said.push_str(&text);
    }
}

/// Record and transcribe in one process, so the model is loaded once and every utterance is decoded
/// the moment the speaker pauses. `listen` plus `transcribe` cannot do this: they pay the model load
/// per take and cannot see a boundary until the take is over.
fn dictate(args: &[String]) -> Result<Value, String> {
    let job = dictation(args)?;

    // Neither log_backend nor tracing_backend is on, so this drops whisper.cpp's chatter entirely.
    install_logging_hooks();
    let loading = Instant::now();
    let context = WhisperContext::new_with_params(&job.model, WhisperContextParameters::default())
        .map_err(|error| format!("Could not load model {}: {error}", job.model.display()))?;
    let mut state = context.create_state().map_err(message)?;
    emit(&json!({ "event": "loaded", "loadMs": loading.elapsed().as_millis() }));

    // Before the mic opens, or the chime is the first thing transcribed.
    if job.chime {
        chime::play(Chime::Start);
    }
    let (sender, frames) = mpsc::channel();
    let mut capture = capture(job.device.as_deref(), Some(sender))?;
    // The offline hangover, not the streaming one: whisper decodes each utterance whole, so the extra
    // 1.2s of tail the streaming profile withholds would delay every commit for context nothing reads.
    capture
        .recorder
        .start(VadPolicy::Offline)
        .map_err(message)?
        .recv()
        .map_err(message)?;
    capture.ready.store(true, Ordering::Relaxed);
    emit(&json!({ "event": "ready" }));

    let commands = stdin_commands();
    let deadline = job
        .seconds
        .map(|seconds| Instant::now() + Duration::from_secs_f64(seconds));
    let cap = (job.max_seconds * f64::from(WHISPER_SAMPLE_RATE)) as usize;
    // Below about a word, whisper answers a partial with punctuation or an outright hallucination.
    let floor = (0.6 * f64::from(WHISPER_SAMPLE_RATE)) as usize;

    let mut current: Vec<f32> = Vec::new();
    let mut said = String::new();
    let mut shown = String::new();
    let mut heard = Instant::now();
    let mut drawn = Instant::now();
    let mut cancelled = false;
    let mut closed = false;
    // How much audio was held back at a trail-off, so the same silence does not decode it again.
    let mut held = 0;
    // The last preview's decode and how much audio it covered: a pause right after one would decode it again.
    let mut previewed: Option<(usize, String)> = None;

    loop {
        if deadline.is_some_and(|at| Instant::now() >= at) {
            break;
        }
        if !closed {
            match commands.try_recv() {
                Ok(line) => {
                    cancelled = line.trim() == "cancel";
                    break;
                }
                Err(mpsc::TryRecvError::Empty) => {}
                // stdin closed: harmless under `--seconds`, but without one nobody is left to stop us.
                Err(mpsc::TryRecvError::Disconnected) => {
                    if deadline.is_none() {
                        break;
                    }
                    closed = true;
                }
            }
        }

        let before = current.len();
        while let Ok(frame) = frames.try_recv() {
            current.extend_from_slice(&frame);
        }
        let grew = current.len() > before;
        if grew {
            heard = Instant::now();
        }

        // The VAD holds its hangover tail back, so silence here is already that tail plus this wait.
        let paused = heard.elapsed() >= job.silence;
        let full = current.len() >= cap;
        if !current.is_empty() && current.len() != held && (full || paused) {
            let raw = redecode(previewed.take(), &mut state, &current, &job, &said)?;
            // Held, not committed: the speaker is finding the next word, and decoding the whole
            // sentence once they go on punctuates it as one instead of as two fragments.
            if !full && !punctuation::finished(&raw) {
                held = current.len();
                shown = punctuation::smooth(&job.dictionary.correct(&raw));
                emit(&json!({ "event": "partial", "text": shown }));
                continue;
            }
            commit(raw, &mut current, &job, &mut said, !full);
            held = 0;
            shown.clear();
            drawn = Instant::now();
            continue;
        }

        let covered = previewed
            .as_ref()
            .is_some_and(|(covered, _)| *covered == current.len());
        let due = !job.partial.is_zero() && drawn.elapsed() >= job.partial;
        // The VAD sends nothing once the hangover ends, so the audio a pause will commit is already
        // complete: decoding it now overlaps the silence wait instead of following it.
        if current.len() >= floor && current.len() != held && !covered && (due || !grew) {
            let raw = decode(&mut state, &current, &job, &said)?;
            let text = punctuation::smooth(&job.dictionary.correct(&raw));
            previewed = Some((current.len(), raw));
            // Stamped after the decode, not before: on a machine where a pass costs more than the
            // interval this is what throttles partials to whatever it can actually sustain.
            drawn = Instant::now();
            if job.partial.is_zero() {
                continue;
            }
            if text != shown {
                shown = text;
                emit(&json!({ "event": "partial", "text": shown }));
            }
            continue;
        }

        sleep(POLL);
    }

    let samples = capture.recorder.stop().map_err(message)?;
    capture.recorder.close().map_err(message)?;
    // On its own thread so the last utterance decodes while it plays.
    let chiming = job
        .chime
        .then(|| thread::spawn(|| chime::play(Chime::Stop)));
    let chimed = || chiming.map(|handle| handle.join());
    if cancelled {
        chimed();
        return Ok(json!({ "event": "cancelled" }));
    }

    // Only after `stop`, which flushes the resampler tail through the same callback.
    while let Ok(frame) = frames.try_recv() {
        current.extend_from_slice(&frame);
    }
    if !current.is_empty() {
        let raw = redecode(previewed, &mut state, &current, &job, &said)?;
        commit(raw, &mut current, &job, &mut said, true);
    }

    save_wav_file(&job.out, &samples).map_err(message)?;
    chimed();
    Ok(json!({
        "event": "done",
        "wav": job.out.to_string_lossy(),
        "text": said,
        "samples": samples.len(),
        "seconds": samples.len() as f64 / f64::from(WHISPER_SAMPLE_RATE),
    }))
}

/// What the dictionary alone makes of each text, with no audio — how an import finds the replacements
/// its vocabulary already covers.
fn correct(args: &[String]) -> Result<Value, String> {
    let mut dictionary = Dictionary::default();
    let mut texts = Vec::new();
    for (flag, value) in flags(args)? {
        match flag {
            "--dictionary" => dictionary = Dictionary::parse(value)?,
            "--text" => texts.push(value),
            _ => return Err(format!("Unknown flag {flag}\n{USAGE}")),
        }
    }
    let corrected: Vec<String> = texts.iter().map(|text| dictionary.correct(text)).collect();
    Ok(json!({ "texts": corrected }))
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    let Some((verb, rest)) = args.split_first() else {
        eprintln!("{USAGE}");
        return ExitCode::FAILURE;
    };
    let result = match verb.as_str() {
        "devices" => devices(),
        "listen" => listen(rest),
        "transcribe" => transcribe(rest),
        "dictate" => dictate(rest),
        "correct" => correct(rest),
        _ => Err(USAGE.into()),
    };
    match result {
        Ok(value) => {
            emit(&value);
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
