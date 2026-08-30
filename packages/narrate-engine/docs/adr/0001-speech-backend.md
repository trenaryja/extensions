# ADR-0001: Speech backend

Status: accepted 2026-08-26

## Context

Criteria: voice quality (measured by ear, not leaderboard); RAM/disk cost; license
permitting eventual redistribution; number of distinct voices (for future per-repo voices);
works offline with no key.

## Decision

| Backend                        | Quality                     | Cost                                                       | License                          | Voices             | Verdict               |
| ------------------------------ | --------------------------- | ---------------------------------------------------------- | -------------------------------- | ------------------ | --------------------- |
| **Kokoro-82M (CoreML/ANE)**    | ✅ best of those auditioned | ⚠️ 325 MB model, ANE                                       | ✅ Apache-2.0                    | ✅ ~54             | ✅ **default**        |
| **`say -v "Ava (Premium)"`**   | ⚠️ ~3/10 vs Kokoro          | ✅ 479 MB one-time, no runtime cost                        | ✅ system                        | ✅ 41 downloadable | ✅ **ship as option** |
| Magpie-TTS 357M CoreML         | ⚠️ below Kokoro by ear      | ✅ 342 MB                                                  | ✅ NVIDIA Open Model             | ❌ 5 fixed         | ➖ optional later     |
| Qwen3-TTS 1.7B                 | ⚠️ untested by ear          | ❌ 3.4 GB on a 16 GB machine                               | ✅ Apache-2.0                    | ✅ cloning         | ➖ optional later     |
| Google Chirp 3: HD             | ✅ ~7/10                    | ❌ needs card; 1M chars/mo = **4 days** at measured volume | ✅                               | ✅                 | ❌ rejected           |
| `edge-tts`                     | ✅ Azure neural voices      | ❌ ~3s TTFB, 503s, not local                               | ❌ Microsoft ToS violation       | ✅                 | ❌ rejected           |
| ElevenLabs                     | ✅ ~8/10                    | ❌ 10 min/month free                                       | ⚠️ attribution on free           | ✅                 | ❌ rejected           |
| Piper                          | ⚠️                          | ✅ 20–110 MB                                               | ❌ GPL-3.0 blocks redistribution | ✅                 | ❌ rejected           |
| F5-TTS / Voxtral / XTTS-v2     | —                           | —                                                          | ❌ CC-BY-NC                      | —                  | ❌ rejected           |
| `say -v Samantha` (status quo) | ❌ 1/10 baseline            | ✅ free                                                    | ✅                               | ✅                 | ❌ rejected           |

**Decision: Kokoro default, `say` as a first-class alternative, backend selection is a
user preference.** Runner-up: Magpie (only true streaming synthesis measured, 355 ms to
first audio — matters if TTFB ever becomes the constraint; it isn't at sentence chunking).

## Consequences

What would flip it: Kokoro's upstream weights are 16 months stale. A materially better
Apache-2.0 model with a CoreML port replaces it — the pluggable backend makes that a
one-file change. The runtime under the Kokoro weights already changed once, from the
`speech` CLI to a Python worker: [ADR-0007](0007-kokoro-runtime.md).

Rejected-for-cause, permanently: Google (volume math), ElevenLabs (off by 50×), Piper and
the CC-BY-NC models (license vs. the engine's redistribution goal).
