# ADR-0007: Kokoro runtime

Status: accepted 2026-08-28

Supersedes the runtime half of [ADR-0001](0001-speech-backend.md). The model is unchanged:
Kokoro-82M is still the default voice. The worker's lifetime below is superseded by
[ADR-0009](0009-persistent-kokoro-worker.md).

## Context

`speech kokoro` (soniqo/speech-swift) was measured against its own output, round-tripped
through `speech transcribe`:

- It hardcodes `kokoro_5s.mlmodelc`, so every wav is exactly 5.00 s. A 204-character sentence
  lost its second half; a three-word one was padded with silence. Upstream ships 10 s and 15 s
  buckets that the CLI never loads.
- Its G2P has no number expansion: every digit is spoken as "X". "TODO" comes out "toedoe".

Neither is a chunking problem, and neither is fixable without patching the Swift CLI. The
reference implementation, `hexgrad/kokoro` (torch), has no length limit, speaks numbers
correctly, and returns per-token `start_ts`/`end_ts` alongside the audio — which is what
highlighting the text as it is heard needs.

## Decision

| Runtime                              | Length limit                 | Numbers         | Timestamps                                        | Startup                             | Verdict                           |
| ------------------------------------ | ---------------------------- | --------------- | ------------------------------------------------- | ----------------------------------- | --------------------------------- |
| **`hexgrad/kokoro` (torch, worker)** | ✅ none                      | ✅ "forty-two"  | ✅ per token, with the audio                      | ⚠️ 3.7 s warm spawn, then 0.5 s/req | ✅ **default**                    |
| `mlx-audio` Kokoro                   | ✅ none                      | ✅ "forty-two"  | ❌ none — needs `speech align` (~40 s model load) | ✅ 0.56 s load, 0.54 s/req          | ➖ faster, wrong shape            |
| `speech kokoro` (status quo)         | ❌ 5.00 s, silent truncation | ❌ digits → "X" | ❌ none                                           | ✅ no runtime to manage             | ❌ rejected                       |
| `say`                                | ✅ none                      | ✅              | ❌ none                                           | ✅ instant                          | ✅ kept as the no-Python fallback |

**Decision: `hexgrad/kokoro` in a persistent Python worker.** `uv` owns the environment
(`worker/pyproject.toml`, Python 3.12); the engine embeds `kokoro_worker.py` and the
`pyproject.toml` as text, writes them to `~/.local/state/narrate/worker/` when they differ from
what is on disk, and runs `uv run --project` there. One JSON line in, one JSON line out; the
worker lives for one narration and the runner kills it when the narration ends.

Runner-up: mlx-audio, on speed alone. It loses because word timestamps arrive free with the
torch pipeline and cost a second 40 s model load anywhere else.

## Consequences

- The kokoro backend is no longer a `spawn`-per-chunk of a CLI: it is a process the engine
  owns, so `SpeechBackend` grew an optional `stop()`.
- Synthesis returns `{ wavPath, duration, words }`. The wav cache grew a `<hash>.json` sidecar
  for the words; the sidecar's presence is what makes a wav cacheable, so a half-written wav
  from an abandoned request is never served.
- The `voices` list is static (there is no CLI to ask any more). Japanese and Mandarin voices
  are left out: their G2P needs `misaki[ja]` / `misaki[zh]`, which the worker doesn't install.
- Kokoro now needs `uv` on PATH and ~2.5 GB of torch in a managed venv. `say` stays the
  backend for anyone who doesn't want that.
