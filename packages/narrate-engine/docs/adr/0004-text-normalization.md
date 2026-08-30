# ADR-0004: Text normalization

Status: accepted 2026-08-26

## Context

Narration has to read markdown responses aloud without sounding like it's reading markup.
Fenced code, tables, inline code, and bare URLs each need a spoken-language substitute
rather than literal punctuation.

## Decision

**Decision: deterministic only for v1.** `strip-markdown` with per-node handlers — fenced
code becomes "a TypeScript snippet, 20 lines, on screen"; tables flatten to `Header: value.`
lines (the same rule Claude Code's own `--ax-screen-reader` mode chose); inline backticks
keep their text; bare URLs become "a link".

## Consequences

Rejected for v1: an LLM cleanup pass on every narration. It fixes a problem not yet
confirmed to exist, at the cost of a round-trip before the first word. Escalation path if
flattened tables sound bad: route only responses containing tables or code through the
summarizer's LLM.

Order matters: redact secrets **before** stripping bold/italic, or the `**`/`_` pass
destroys tokens like `ghp_…`.
