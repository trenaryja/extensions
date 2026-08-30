# ADR-0005: Input sources

Status: accepted 2026-08-26

## Context

Agent transcripts are the motivating source, but selected text is what makes narration
useful outside an LLM session. Both need to reach the engine as the same shape so nothing
downstream cares which one produced the text.

## Decision

**Decision: a `Source` interface, with transcript-message and selected-text both shipping
in v1.** A source resolves to `{ text, label, origin }` and nothing downstream cares which
one produced it.

| Source                 | Why                                                                                                           | v1?           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | ------------- |
| **Transcript message** | The motivating case. Needs `isSidechain` filtering and project scoping                                        | ✅            |
| **Selected text**      | Makes the tool useful in a browser, a PDF, an email — anywhere. Cheap: Raycast exposes the selection natively | ✅            |
| Clipboard              | Near-free once selection works; different enough to be worth its own command                                  | ✅ if trivial |
| File / stdin           | Enables the CLI and any future TUI                                                                            | ➖ later      |

## Consequences

Selected text is not a bolt-on — it's the thing that stops this from being an LLM
accessory. It also cuts the engine's dependency on transcript-format assumptions, since a
second source proves nothing downstream is coupled to the first.

Prior art in `~/Git/bin/sayx/lib/text-sources.ts` (read 2026-08-26) is three loose functions
(`fetchWikipediaSummary`, `getRandomQuote`, `getDeterministicPhrase`) that each return a
string, with no shared interface to copy — precedent for "text from anywhere," not a seam.
`Source` is designed fresh.
