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

> [!note]- Collapsed by default
> The `-` marker no longer leaks into the title. (Click-to-collapse is coming next.)

> [!note]+ Expanded but foldable
> The `+` marker is stripped from the title too.

## Inline markdown in content

> [!info]
> Content supports **bold**, _italic_, `code`, and [links](test.md).

## Unknown type (neutral fallback)

> [!custom]
> An unrecognized type gets the default icon and a neutral gray accent.
