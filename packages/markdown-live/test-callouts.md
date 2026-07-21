# Callouts

← [Back to test suite](test.md)

Built-in types follow Obsidian's taxonomy: each **primary** owns an icon + color; aliases render identically.

---

## Types (13 primaries)

> [!note]
> General information and context.

> [!abstract]
> A summary or overview. Aliases: summary, tldr.

> [!info]
> Informational content.

> [!todo]
> Something that needs to be done.

> [!tip]
> A helpful hint or best practice. Aliases: hint, important.

> [!success]
> Operation completed successfully. Aliases: check, done.

> [!question]
> A question or something uncertain. Aliases: help, faq.

> [!warning]
> Proceed with caution. Aliases: caution, attention.

> [!failure]
> Something failed. Aliases: fail, missing.

> [!danger]
> Something could go very wrong. Alias: error.

> [!bug]
> Something is broken.

> [!example]
> An example or demonstration.

> [!quote]
> A quotation or citation. Alias: cite.
> — Someone famous

---

## Default title (untitled → type name)

With no title after the tag, the heading shows the capitalized type name (Obsidian behavior).
Toggle with the `markdownLive.calloutDefaultTitle` setting.

> [!warning]
> Heading reads "Warning" above this line.

## Custom title

> [!tip] Pro tip
> Text after the type tag becomes the title.

## Aliases resolve to their primary

> [!hint]
> Renders exactly like tip — green lightbulb, heading "Hint".

> [!error]
> Renders exactly like danger — red flame, heading "Error".

## Foldable markers (Obsidian +/−)

Add `+` (expanded) or `-` (collapsed) after the type to make a callout foldable. Click the chevron to toggle —
it flips the marker in the source, so the fold state is saved in the document.

> [!note]- Collapsed by default
> This content is hidden until you expand it. Click the chevron on the header.

> [!note]+ Expanded but foldable
> This content shows; click the chevron to collapse it.

## Inline markdown in content

> [!info]
> Content supports **bold**, _italic_, `code`, and [links](test.md).

## Unknown type (neutral fallback)

> [!custom]
> An unrecognized type gets the default icon and a neutral gray accent.

## Block content inside callouts

Lists, task lists, headings, and code blocks all render inside a callout now (and in plain blockquotes too) —
because rendering reads the syntax tree, which already understands the nesting.

> [!tip] Lists (bullet + ordered)
> - First bullet
> - Second bullet
>   - Nested bullet
>
> 1. Ordered one
> 2. Ordered two

> [!todo] Task lists
> - [x] Done item
> - [ ] Pending item

> [!note] Headings
> ## A heading inside a callout
> Regular text below it, with **bold** and `code`.

> [!example] Code blocks
>
> This is a codeblock below
> 
> ```ts
> const greet = (name: string) => `Hello, ${name}!` + 'hi world asdfa'
> console.log(greet('world'))
> ```


## Nested callouts

Nest with extra `>` markers — each level gets its own indent, color, border, icon, and title.

> [!note] Outer
> Outer content.
>
> > [!warning] Inner
> > Nested one level deep.
> > More inner content.
>
> Back to outer content.
