---
title: Markdown Live — Test Suite
date: 2026-06-09
tags: [test, markdown, vscode]
---

# Markdown Live Test Suite

Feature-specific tests:

- [Callouts](test-callouts.md)
- [Mermaid Diagrams](test-mermaid.md)
- [Tables](test-tables.md)
- [Math](test-math.md)

---

## Headings

# H1 Heading

## H2 Heading

### H3 Heading

#### H4 Heading

##### H5 Heading

###### H6 Heading

---

## Inline Formatting

**bold** and **also bold**

_italic_ and _also italic_

**_bold italic_**

~~strikethrough~~

A sentence with some `inline code` right in the middle

**bold with _nested italic_ inside**

[Link to example](https://example.com)

---

## Lists

### Unordered

- Item one
- Item two
  - Nested A
  - Nested B
- Item three

### Ordered

1. First item
2. Second item
   1. Nested A
   2. Nested B
3. Third item

### Task List

- [x] Completed task
- [ ] Incomplete task
- [x] Another done
- [ ] Another pending

---

## Blockquote

> This is a blockquote.
> It can span multiple lines.
>
> And multiple paragraphs.

---

## Code Blocks

```typescript
const greet = (name: string) => `Hello, ${name}!`
console.log(greet('world'))
```

```json
{
	"name": "markdown-live",
	"version": "0.0.1"
}
```

```bash
bun install && bun run build
```

---

## Images

![VS Code Logo](https://code.visualstudio.com/assets/favicon.ico)
