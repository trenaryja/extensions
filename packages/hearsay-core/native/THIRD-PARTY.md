# Third-party code

## Handy

`src/audio_toolkit/` is vendored from [Handy](https://github.com/cjpais/Handy) — MIT,
copyright (c) 2025 CJ Pais. Handy's full licence text is reproduced in `src/audio_toolkit/LICENSE`.

Vendored rather than depended on: Handy publishes no crate, and `audio_toolkit` is a subtree of a
Tauri application. It carries no Tauri dependency, so it lifts cleanly.

Divergences from upstream are marked `// hearsay:` in place:

- `vad/silero.rs` dropped. It needs the `vad_rs` git dependency and an ONNX model file on disk;
  `EarshotVad` is pure Rust from crates.io and needs no model, which is what "self-contained" requires.
- `audio/recorder/tests.rs` not vendored.
- `audio_toolkit/mod.rs` is hearsay's own: it re-exports only what `main.rs` uses, and blanket-allows
  the lints a vendored subtree trips in a binary crate (`dead_code`, `unused_imports`, `collapsible_if`).
- `text.rs` not vendored. Its fuzzy `apply_custom_words` deleted words, cut paths and rewrote real
  English on 197 real recordings; `src/dictionary.rs` is hearsay's own stricter matcher instead.
- `lang_id.rs` not vendored.

This crate keeps rustfmt's defaults and Handy's 2021 style edition (not the repo's `hard_tabs`) so the
subtree stays byte-identical to upstream. See `rustfmt.toml`. Verify a re-sync with:

```sh
for f in $(cd src/audio_toolkit && find . -name '*.rs'); do
  diff "src/audio_toolkit/$f" "<handy>/src-tauri/src/audio_toolkit/$f"
done
```
