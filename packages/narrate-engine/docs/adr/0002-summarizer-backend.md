# ADR-0002: Summarizer backend

Status: accepted 2026-08-26

## Context

Criteria: no context pollution of the live thread; capability; zero incremental cost; no
new key or account; pluggable per the no-hard-LLM-dependency principle.

## Decision

| Backend                          | Context cost                 | Capability                     | Setup                                                                  | Verdict                                |
| -------------------------------- | ---------------------------- | ------------------------------ | ---------------------------------------------------------------------- | -------------------------------------- |
| **`claude -p`, scratch cwd**     | ✅ separate session, zero    | ✅ highest available           | ✅ already installed                                                   | ✅ **default adapter**                 |
| **OpenCode (Zen, `big-pickle`)** | ✅ separate process          | ✅ ~Sonnet-4.5-class on coding | ✅ already configured here                                             | ✅ **second adapter, proves the seam** |
| LM Studio / ollama               | ✅                           | ⚠️ small local models          | ❌ multi-GB download; ollama currently has 0 models                    | ➖ adapter, unshipped                  |
| Codex / Gemini CLI               | ✅                           | ✅                             | ⚠️ needs their key                                                     | ➖ adapter, unshipped                  |
| Sidecar in every agent turn      | ❌ **junks up every thread** | ✅                             | ✅                                                                     | ❌ rejected                            |
| OpenRouter / HuggingFace         | ✅                           | ⚠️                             | ❌ HF free credit ≈ $0.10/mo; OpenRouter has no TTS but works for text | ➖ adapter, unshipped                  |

**Decision: a `Summarizer` interface with `claude -p` as the shipped default and OpenCode
as the second implementation.** Writing two adapters before shipping is what keeps the seam
honest — one adapter is an interface nobody has tested.

## Consequences

OpenCode's `big-pickle` is worth capturing specifically, because it argues the seam better
than any principle does. It's a stealth model on the OpenCode Zen endpoint — 200k context,
32k max output, reasoning and tool calls and structured output, roughly Sonnet-4.5-class on
coding, and currently **$0 for input, output, and cache reads**. Widely believed to be
GLM-4.6 underneath. But OpenCode says plainly that the free period ends and **the model
behind the name can be swapped without notice**. A free, capable, deliberately unstable
backend is exactly the case a pluggable interface exists for: when it changes or goes paid,
that's a config edit, not a migration.

Rejected: the sidecar approach (model emits a spoken summary inside every turn). It's what
most prior art does and it's free, but it pollutes every thread's context with output you
mostly don't want. Explicitly vetoed.
