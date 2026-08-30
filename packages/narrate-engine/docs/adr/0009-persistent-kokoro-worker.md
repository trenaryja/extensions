# ADR-0009: Persistent kokoro worker

Status: accepted 2026-08-29

Supersedes the worker-lifetime half of [ADR-0007](0007-kokoro-runtime.md). The runtime is
unchanged: `hexgrad/kokoro` under `uv`, one JSON request in, one JSON reply out.

## Context

ADR-0007 gave the worker the lifetime of one narration: the runner spawned it on the first
chunk and killed it in `SpeechBackend.stop()` when the narration ended. Measured on this
machine, that made every narration and every voice preview pay the whole startup again —
3.7 s of spawn, 1.7 s of it loading the model, plus G2P init on first use of a language:

| Path                             | Time to first audio |
| -------------------------------- | ------------------- |
| `say`                            | 0.50 s              |
| kokoro, wav already in the cache | 0.27 s              |
| kokoro, a voice not yet cached   | 6.11 s              |

6 s is past the point where the Voices command's ⌘P preview reads as broken, and the first
narration of a session cost ~12 s for the same reason.

Prerendering a fixed sample for all 41 voices was rejected: the preview line should be
configurable, which makes a prerendered cache dead weight.

## Decision

**The worker outlives the runner and exits on its own after `$NARRATE_WORKER_IDLE` seconds
(default 300) with nothing to do.** It serves a Unix socket at `~/.local/state/narrate/worker.sock`
instead of stdin/stdout, one request per connection, synthesis serialized behind a lock.

Exclusivity is the socket itself, not a lock file: the worker binds before it loads the model,
so a caller that arrives during the load connects and waits in the backlog rather than
concluding nothing is running. A worker that loses the bind exits immediately. A lock file was
rejected because it has the same crash-staleness problem it was meant to solve, and one wasted
`uv` that exits in under a second is a cheaper failure than a stale lock nobody can clear.

A socket file left behind by a `SIGKILL`ed worker is stale only if nothing answers on it, so
the worker probe-connects before unlinking and rebinding.

Measured after the change:

| Path                                             | Time to first audio |
| ------------------------------------------------ | ------------------- |
| worker up, voice used before                     | 1.2 s               |
| worker up, first ever use of a voice             | 3.3–5.5 s           |
| worker down (spawn, model load, then synthesize) | 5.2 s               |

The remaining cost of a voice's first use is Hugging Face fetching that voice's `.pt`; it is
paid once per voice per machine, not once per session.

## Consequences

- `SpeechBackend.stop()` is gone, along with the runner's call to it. It had one implementor
  and its only job was killing the worker.
- Two runners no longer race a spawn, and neither do twenty. A narration renders every segment
  at once, so the backend memoizes the in-flight spawn: without that, the first request to find
  no worker was joined by twenty more, each starting a `uv` that starved the one that won the
  socket — measured at 12.6 s to load a model that takes 1.9 s alone.
- A killed runner strands its queued requests on the worker. Each one checks whether its caller
  is still connected once it has the lock, so an abandoned queue drains at once instead of
  synthesizing ~17 s apiece for nobody.
- `narrate worker status | stop` exists for the process nobody else can see. `status` answers
  null rather than starting a worker to ask.
- This is the one thing in narrate that outlives the request that asked for it, against the
  "nothing runs without being asked" principle in `CONTEXT.md`. It is bounded two ways: nothing
  starts it but a synthesis, and it exits by itself when idle.
