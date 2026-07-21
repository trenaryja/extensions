# Markdown Isn't One Language

_A living reference for **Markdown Live** — and a primer on why "just render markdown" is deceptively deep._
_(Kept up to date as we close gaps; also drafted with an eventual blog post in mind.)_

---

## There is no single "Markdown"

John Gruber published Markdown in 2004 as a simple text-to-HTML tool. He wrote a description and a Perl
script (`Markdown.pl`) — but never a rigorous spec. The moment other people reimplemented it, they
disagreed on edge cases. That ambiguity is why "Markdown" is really a _family_ of dialects, called **flavors**.

The closest thing to a standard is **CommonMark**: a precise specification with a 600+ case conformance
suite. When engineers say "core markdown" today, they almost always mean CommonMark. Everything else is
**CommonMark + extensions**.

---

## The layers

| Layer                      | What it adds                                                                                       | Spec status                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **CommonMark**             | headings, emphasis, lists, blockquotes, links, images, inline & fenced code, thematic breaks, HTML | Formal spec + conformance suite                |
| **GFM** (GitHub Flavored)  | tables, task lists, `~~strikethrough~~`, autolinks, raw-HTML filtering                             | Formal spec — a strict superset of CommonMark  |
| **GitHub Alerts**          | `> [!NOTE]` callout blockquotes (5 types)                                                          | **Not** in the GFM spec — a github.com feature |
| **Obsidian**               | callouts, `[[wikilinks]]`, `![[embeds]]`, `#tags`, `^block-refs`, `$math$`, `%%comments%%`         | App-specific                                   |
| **Pandoc / MDX / RST / …** | footnotes, definition lists, citations / JSX / directives                                          | Tool-specific                                  |

The mental model: **CommonMark is the trunk; every flavor is a branch that adds — and occasionally
redefines — syntax.**

---

## Case study: callouts (a.k.a. admonitions)

Callouts show how flavors diverge on the _same_ surface syntax. Both GitHub and Obsidian spell one as a
blockquote with a `[!TYPE]` tag:

```md
> [!WARNING]
> Proceed with caution.
```

…but they're different features:

|              | GitHub Alerts                              | Obsidian Callouts            |
| ------------ | ------------------------------------------ | ---------------------------- |
| Types        | 5 (note, tip, important, warning, caution) | 13 primaries + aliases       |
| Custom title | ❌                                         | ✅ `> [!tip] My title`       |
| Foldable     | ❌                                         | ✅ `> [!tip]-` / `> [!tip]+` |
| Custom types | ❌                                         | ✅ (via CSS)                 |
| Spec'd?      | ❌ github.com feature                      | ❌ app feature               |

And they **conflict**:

- `[!IMPORTANT]` — GitHub renders it **purple** (its own type); Obsidian treats it as an alias for **tip** (green).
- `[!CAUTION]` — GitHub renders it **red** (its own type); Obsidian treats it as an alias for **warning** (yellow).

The `+`/`-` **fold markers are Obsidian-only** — not CommonMark, not GFM, not GitHub Alerts.

Markdown Live follows **Obsidian's taxonomy** (our migration target) and makes the divergent types
user-overridable via the `markdownLive.callouts` setting.

---

## Parity scorecard

Legend: ✅ done · 🟡 partial · 🔜 queued · ❌ not yet · ⛔ not planned

### CommonMark (core)

| Feature                          | Status                          |
| -------------------------------- | ------------------------------- |
| Headings (ATX `#`)               | ✅                              |
| Bold / italic / inline code      | ✅                              |
| Blockquotes                      | ✅                              |
| Lists (ordered/unordered/nested) | ✅                              |
| Fenced code blocks               | ✅ (+ Shiki, theme-matched)     |
| Links & images                   | ✅ (inline-editable, clickable) |
| Thematic break (`---`)           | ✅                              |
| Setext headings (`===`/`---`)    | ❌                              |
| Reference links `[x][id]`        | ❌                              |
| Bare-URL autolinks               | ❌                              |
| Raw HTML                         | 🟡                              |

### GFM

| Feature          | Status                                                    |
| ---------------- | --------------------------------------------------------- |
| Tables           | 🟡 (inline-edit, live preview, row/col tools; more below) |
| Strikethrough    | ✅                                                        |
| Task lists       | ✅                                                        |
| Alerts (5 types) | ✅ (covered by the callouts superset)                     |

### Obsidian

| Feature                                    | Status                                           |
| ------------------------------------------ | ------------------------------------------------ |
| Callouts (13 + aliases)                    | ✅                                               |
| Callout default + custom title             | ✅                                               |
| Callout fold (`+`/`-`, collapsible)        | ✅                                               |
| Callout custom types/colors/icons (config) | ✅                                               |
| Frontmatter (YAML)                         | ✅ (dimmed)                                      |
| Block markdown inside callouts             | ✅ (lists/tasks/headings/code/nested; tables & diagrams pending) |
| Nested callouts                            | ✅ (indented, per-level color/icon/title)       |
| Math `$…$` / `$$…$$` / ` ```math `         | ✅ (MathJax→SVG, copy/export as SVG)             |
| Wikilinks `[[…]]`                          | ❌ (v1.1 PKM)                                    |
| Embeds `![[…]]`                            | ❌ (v1.1 PKM)                                    |
| Tags `#tag`                                | ❌ (v1.1 PKM)                                    |
| Block refs `^id`                           | ❌ (v1.1 PKM)                                    |
| Comments `%%…%%`                           | ❌ (v1.1 PKM)                                    |

### Diagrams / rich

| Feature | Status                                                   |
| ------- | -------------------------------------------------------- |
| Mermaid | ✅ (theme-bridged, live preview, code-block edit chrome) |

---

## Strategy

1. **CommonMark first** — the trunk. Close the remaining edge cases (setext, reference links, autolinks).
2. **GFM next** — tables/tasks/strikethrough done; alerts covered.
3. **Obsidian** — callouts done; **math** is the highest-ROI remaining (shared with GitHub _and_ Pandoc).
   PKM features (wikilinks/tags/embeds) are v1.1.
4. **On conflicts, prefer Obsidian semantics** with config overrides.
5. **Skip** Pandoc/MDX/RST-specific syntax unless a concrete need appears — diminishing returns.

The realistic target for "render any real-world `.md`" is **CommonMark + GFM + Obsidian** — together they
cover essentially every note you'll open.

---

## Architecture note

Markdown Live renders in CodeMirror 6 via decorations. **Inline** styling reads CM's CommonMark syntax
tree; **block** features (tables, task lists, callouts, mermaid) are hand-rolled per-plugin. That's why
some "block-in-block" cases (a list _inside_ a callout) are still gaps — the block plugins match at line
start and don't yet see past a `>` prefix.

---

## Sources

- CommonMark spec — <https://spec.commonmark.org/>
- GitHub Flavored Markdown spec — <https://github.github.com/gfm/>
- GitHub alerts (community discussion) — <https://github.com/orgs/community/discussions/16925>
- Obsidian callouts — <https://help.obsidian.md/callouts>
