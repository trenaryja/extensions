# ADR-0003: Engine / view split

Status: accepted 2026-08-26

## Context

Raycast unloads a view command after a configurable grace period (down to "Immediately").
A spawned `afplay` survives that; the loop that would start sentence N+1 does not.
Narration must survive dismissing the window, so the loop cannot live in the view.

## Decision

**Decision: `no-view` Raycast command owns the playback loop; the transcript view is a pure
reader.**

State channel: `LocalStorage` holding `{phase, chunkIndex, chunkTotal, speed, voiceId,
updatedAt}`, written at each chunk boundary. View polls ~1 Hz. Seek fires `launchCommand`
with the target index in `context`.

## Consequences

Longevity is assumed, not yet addressed by measurement. In prior art
(`raycast/extensions/main/extensions/gemini-tts`), the loop lives inside the `no-view`
command (`quick-read.tsx:43` awaits the whole reading) with no `detached`/`unref` anywhere —
the only comment on the risk is `session-lock.ts:16`, "Raycast commands die quickly after
their async work completes." A spike (plan doc open item 1) is pending one manual Raycast
launch to confirm the loop survives 12 minutes with the window dismissed. If the log stops
early, the engine becomes a detached helper (`detached: true` + `unref()` + PID registry in
`environment.supportPath`, the moodist / `dont-sleep-bro` pattern) — a materially bigger
build that this ADR would need to revisit.
