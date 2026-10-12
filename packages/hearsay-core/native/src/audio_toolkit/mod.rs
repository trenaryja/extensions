//! Vendored from Handy (https://github.com/cjpais/Handy), MIT, (c) 2025 CJ Pais.
//! See native/THIRD-PARTY.md. Divergences from upstream are marked `// hearsay:`.

// hearsay: vendored verbatim — the whole surface is kept for later phases, and upstream's style is not ours to relint.
#![allow(dead_code, unused_imports, clippy::collapsible_if)]

pub mod audio;
pub mod constants;
pub mod utils;
pub mod vad;

// hearsay: only the surface `main.rs` reaches for — an unused re-export is a warning in a bin crate.
pub use audio::{
    is_microphone_access_denied, is_no_input_device_error, list_input_devices, read_wav_samples,
    save_wav_file, AudioRecorder, VadPolicy,
};
pub use utils::get_cpal_host;
pub use vad::{EarshotVad, SmoothedVad, VoiceActivityDetector};
