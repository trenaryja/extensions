# ADR-0008: Contiguous playback with a sentence and word timestamp map

Status: accepted 2026-08-28

## Context

The runner synthesized one wav per sentence and handed each to its own `afplay`. Every sentence
boundary therefore cost a process spawn — an audible gap — and, worse, restarted the speech engine's
prosody: each sentence opened at the same pitch and pace, which reads as jaunty rather than as
someone reading a paragraph.

The kokoro backend now returns `{ wavPath, duration, words }`, with word timestamps relative to the
wav it just wrote, so the engine can say when a word is heard rather than only which sentence is
playing. `say` returns `words: []` and always will.

## Decision

**Decision: sentences are synthesized separately and concatenated into one wav per paragraph;
playback seeks by slicing PCM.**

- Chunking stays sentence-level — it is what makes the audio cache reusable and lets the first
  paragraph start before the rest of the message is synthesized. `Chunk` carries the paragraph it
  came from (`line`).
- The runner renders paragraph 0, starts playing it, and renders the following paragraphs while it
  plays. A paragraph boundary is the only place `afplay` respawns.
- All backends write 16-bit PCM mono at one sample rate each (kokoro 24 kHz, `say` 22.05 kHz), so
  concatenation is appending payloads and writing one RIFF header (`lib/wav.ts`).
- Timestamps fall out of the concatenation: sentence _k_ starts at the summed duration of the
  sentences before it in its paragraph, plus the summed duration of the paragraphs before that;
  word timestamps are offset by their sentence's start. `state.json` publishes both maps, plus
  `duration`, `position` (written at least every 250 ms) and the `sentenceIndex` derived from it.
- `afplay` cannot start at an offset, so seeking writes `seek.wav` — the paragraph from the target
  sample to its end — and plays that. Rate changes keep using `afplay -r` and replay the current
  sentence through the same slice.
- A sentence whose synthesis fails is concatenated as 0.3 s of silence rather than dropped, so every
  later timestamp still matches the audio.

## Consequences

Time to first audio is now the synthesis of a whole paragraph rather than of one sentence. That is
the price of contiguity, and it is bounded: a long paragraph is still split at sentence level for
synthesis, and the first sentence of the message keeps its lead-clause carve.

A seek forward past what has been rendered has to render the paragraphs in between, because a
paragraph's offset is only knowable once every earlier one has been measured. Sentences before
`--start` are never rendered and keep `start: -1`; a seek backwards clamps to the first rendered
sentence.

### Rejected

- **One wav for the whole message** — the simplest timestamp story, but nothing plays until the last
  sentence is synthesized. Unacceptable for a 20-paragraph response.
- **`ffplay -ss` (or `sox`, `ffmpeg`) to start at an offset** — removes the slicing code, adds a
  Homebrew dependency to a tool whose entire pitch is that it runs on what macOS already ships.
- **Keeping per-sentence wavs and cross-fading** — no way to fade between two `afplay` processes
  without a mixer; the gap is a process spawn, not a missing fade.
