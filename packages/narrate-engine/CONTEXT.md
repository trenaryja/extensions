# narrate

`narrate` reads AI agent responses aloud, on demand, locally and for free.

## Architecture principles

These outrank feature work. Every one of them was an explicit decision, not a default.

1. **Engine is a library; every UI is a consumer.** The engine owns transcript reading, text
   normalization, chunking, synthesis, playback, and state. Raycast is the first consumer.
   A TUI or a Tauri app must be able to sit on the same engine with no engine changes.
2. **No hard dependency on any one LLM.** Claude is the summarizer _we_ ship with, because
   it's the subscription on hand. OpenCode, Codex, Gemini, and LM Studio must be reachable
   by writing an adapter, not by forking. Same for a user with no LLM at all — summaries
   degrade to unavailable, narration still works.
3. **No hard dependency on any one speech engine.** `say -v "Ava (Premium)"` is a
   first-class backend, not a fallback. Kokoro sounds better and is the only backend that
   returns word timestamps, but it costs a `uv`-managed Python environment; `say` costs
   nothing in RAM or disk and is always present. The user picks.
4. **Nothing runs without being asked.** No background daemon, no auto-speak, no polling
   of transcripts when the UI is closed. The one process that outlives its request is the
   kokoro worker, and only because reloading the model per narration costs 6 s a time — a
   synthesis is still the only thing that starts it, and it exits when idle ([ADR-0009](docs/adr/0009-persistent-kokoro-worker.md)).
5. **Text in, audio out — the engine never asks where the text came from.** A transcript
   message, the current selection, the clipboard, and a file are all just sources. This is
   what keeps the tool useful outside an LLM session.

## Glossary

- **source** — anything that resolves to text the engine can speak: a transcript message,
  the current selection, the clipboard, a file. The engine treats them identically.
- **response** — what renders on screen in the agent UI. Markdown, possibly with tables and
  code blocks. One kind of source, not the only kind.
- **spoken summary** — a short generated script written to be _heard_, produced on demand by
  a summarizer adapter. A different object from the response. Conflating the two is the
  mistake most prior art in this space makes.
- **narration** — the full response, normalized for speech and read start to finish.
- **chunk** — one sentence. The unit of synthesis, of caching, and of seeking.
- **segment** — one paragraph, whose sentences are synthesized separately and then concatenated into a
  single wav. The unit of playback: `afplay` is only respawned at a segment boundary, and every
  sentence and word timestamp is measured against the concatenated audio.
- **engine** — the library: transcript reading, normalization, chunking, synthesis,
  playback, state. Owns no UI.
- **view** — any consumer of the engine. Raycast first; TUI and desktop app are the reason
  the seam exists.

Decisions: see `docs/adr/`.
