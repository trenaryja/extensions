# ADR-0006: Engine lives with the extension

Status: accepted 2026-08-28

## Context

The engine started in `~/Git/bin`, where `build.json` compiled it to `.bin/narrate` and the Raycast
extension shelled out to that path through a required `binaryPath` preference. That made the
extension unusable on any machine without the `bin` repo checked out and built, and split one
feature across two repos: a change to the JSON boundary needed a commit in each.

## Decision

**Decision: the engine is a workspace package in the extensions monorepo, compiled into the
extension's `assets/`.**

`packages/narrate-engine` is `@repo/narrate-engine`; its `build` script is
`bun build --compile --minify --outfile ../narrate/assets/narrate cli.ts`. `packages/narrate` depends
on it, so turbo's `^build` compiles the binary before the extension's `dev`, `build`, or `check`.
Raycast copies `assets/` into the built extension, so the view resolves the engine at
`join(environment.assetsPath, 'narrate')`.

## Consequences

The `binaryPath` preference stays, now optional and empty by default: an override for running a
locally built engine, not the normal path. The bundled binary is chmod'd to 0o755 on first use —
Raycast copies assets without the exec bit.

The compiled binary (~60 MB) is gitignored and rebuilt from source, so a clean checkout must run a
build before `ray develop`. The engine's `build` task sets `cache: false`, because its output lands
outside its own package where turbo cannot track it — a cache hit would otherwise leave the
extension with no engine.

The engine remains a standalone CLI with its own tests and no Raycast imports (ADR-0003), so a TUI
or desktop consumer can still build against it.
