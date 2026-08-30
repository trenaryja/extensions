# narrate

Reads AI agent responses aloud, locally and for free. `narrate` is an engine with a CLI on top: it
resolves text from a source (a Claude Code transcript message, a file, the clipboard, stdin),
normalizes the markdown for speech, splits it into sentence chunks, synthesizes each one with a
speech backend, concatenates each paragraph into one contiguous wav, and plays those in order while
publishing a sentence and word timestamp map to a state directory. Every
command speaks JSON, and `play` detaches by default, so a UI — the Raycast view is the first one —
drives the whole thing by shelling out and polling.

## Build

```sh
bun run build   # compiles to ../narrate/assets/narrate, where the Raycast extension loads it
bun cli.ts      # or run it straight from source
```

`worker/` (the kokoro Python worker and its `pyproject.toml`) is embedded in the binary as text and
written to the state dir when it differs from what is on disk, so the compiled engine carries its
own worker.

## Commands

Sources are shared by `play`, `summarize`, `normalize`, and `chunks`: `--message <id>`,
`--file <path>`, `--clipboard`, or piped stdin (the default). Every command takes `--json` and
`--help`; errors go to stderr with exit 1, as `{ "error": "..." }` under `--json`.

| Command     | Example                                                       |
| ----------- | ------------------------------------------------------------- |
| `play`      | `echo "hello there" \| narrate play --backend say`            |
| `stop`      | `narrate stop --json`                                         |
| `pause`     | `narrate pause --json`                                        |
| `resume`    | `narrate resume --json`                                       |
| `status`    | `narrate status --json`                                       |
| `seek`      | `narrate seek 4` · `narrate seek --time 12.5`                 |
| `rate`      | `narrate rate 1.5`                                            |
| `list`      | `narrate list --project ~/Git/bin --limit 10 --json`          |
| `history`   | `narrate history --limit 10 --json`                           |
| `summarize` | `narrate summarize --message <id> --summarizer claude --play` |
| `voices`    | `narrate voices --backend say`                                |
| `worker`    | `narrate worker status` · `narrate worker stop`               |
| `normalize` | `narrate normalize --file notes.md`                           |
| `chunks`    | `narrate chunks --file notes.md`                              |

`play` prints `{ pid, label, sentenceTotal }` and returns before any audio starts: it writes the
resolved text to a handoff file in the state dir and re-spawns itself detached with
`--foreground --raw --file <handoff>`, which the child deletes once read. `--foreground` skips the
re-spawn and narrates in the calling process, printing the final state.

## State directory

`~/.local/state/narrate/`, or `$NARRATE_STATE_DIR`. A view reads and writes these files directly —
they are the control protocol, not an implementation detail.

| Path            | Role                                                                      |
| --------------- | ------------------------------------------------------------------------- |
| `state.json`    | current playback state, rewritten on every phase change and every 250 ms  |
| `pid`           | pid of the `afplay` process playing the current paragraph                 |
| `stop`          | sentinel: create it (empty) to stop; the runner consumes it within 100 ms |
| `pause`         | sentinel: create it (empty) to silence playback and park the runner       |
| `resume`        | sentinel: create it (empty) to play on from where `pause` left off        |
| `seek`          | sentinel: `{"sentence":n}` or `{"seconds":n}`; consumed the same way      |
| `rate`          | sentinel: write a playback rate; the current sentence replays at it       |
| `seek.wav`      | the tail of a paragraph, sliced so `afplay` can start mid-paragraph       |
| `audio/`        | synthesized wav files, each with a `.json` sidecar of word timestamps     |
| `segments/`     | one concatenated wav per paragraph of the running narration               |
| `scratch/`      | working dir for summarizer CLIs, excluded from `narrate list`             |
| `worker/`       | the kokoro Python worker and the `uv` environment built from it           |
| `worker.sock`   | where the running kokoro worker listens; its absence means none is up     |
| `worker.log`    | the kokoro worker's own output, across every runner that used it          |
| `runner.log`    | one line per sentence that failed to synthesize and was skipped           |
| `history.jsonl` | one JSON line per finished narration, oldest first                        |

`audio/` is a cache keyed by backend + voice + text; nothing else trims it, and 24 kHz mono speech
runs about 2.9 MB per minute. After each narration the oldest clips are deleted until the directory
fits `$NARRATE_CACHE_MB` (default 200; `0` keeps everything). A deleted clip is re-synthesized the
next time that exact text is played.

`history.jsonl` gets one line each time a narration comes to rest, in any phase — `done`, `stopped` and
`error` alike, since a narration cut short is the one you most want to hear again. A line holds
`finishedAt`, `phase`, `label`, `origin`, `backend`, `voiceId`, `speed`, and the speech-normalized
`text`, which is everything `narrate play --raw` needs to repeat it. The newest
`$NARRATE_HISTORY_ENTRIES` (default 200; `0` keeps everything) survive each narration. Entries outlive
their audio — the wav cache is capped separately — so a replay may re-synthesize.

`state.json` fields: `phase` (`synthesizing` | `playing` | `paused` | `stopped` | `done` | `error`), `pid` of
the runner, `label`, `origin`, `backend`, `voiceId`, `speed`, `sentences` (`{ text, start, end }` per
sentence, seconds from the start of the narration, `-1` until that sentence has been rendered),
`words` (the same shape, empty for backends without timestamps), `duration` (seconds rendered so
far), `position` (seconds, where playback is now), `sentenceIndex` (derived from `position`),
`skipped` (indices whose synthesis failed, heard as 0.3 s of silence), optional `error`, and
`updatedAt`. A consumer can import the type instead of restating it:
`import type { PlaybackState } from '@repo/narrate-engine/types'`.
`narrate status` reports `{ "phase": "idle" }` when there is no state file, and when an active phase
is left behind by a runner that is no longer alive.

## Requirements

- macOS: `afplay` and `say` ship with the system.
- `say` backend: premium voices are an opt-in download in System Settings → Accessibility → Spoken
  Content → System Voice → Manage Voices. `Ava (Premium)` is preferred when installed.
- `kokoro` backend (the default): `brew install uv`. The engine writes its Python worker into the
  state dir and `uv` builds the environment (torch, `kokoro`, `misaki[en]`) on first run.
  The worker stays up between narrations — reloading the model each time costs about 6 s — and exits
  after `$NARRATE_WORKER_IDLE` seconds idle (default 300). `narrate worker status` shows it.
- `summarize`: `claude` or `opencode` on PATH.

## Design

[`CONTEXT.md`](CONTEXT.md) for the architecture principles and glossary; [`docs/adr/`](docs/adr) for
the decisions behind the backends, summarizers, engine/view split, normalization, sources, and where
the engine lives.
