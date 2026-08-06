# Marksmith — brand anatomy

_The M§ seal, defined so it can be rebuilt from this file alone. Exploration happens in
[identity-lab.html](identity-lab.html), which implements this spec exactly._

## The unit

**M** — the cap height of the M. Every dimension below is a ratio of M.

## Anatomy

| Element     | Value                                                            |
| ----------- | ---------------------------------------------------------------- |
| Tile        | square, side **2.5 M**, corner radius **0.6 M**                  |
| Solid ring  | radius **1.1 M**, stroke **M/16**                                |
| Dashed ring | radius **0.95 M**, stroke **M/16**, dash M/20 on an M/5 period, round caps |
| Ink band    | height **M**, centered on the tile                               |
| Glyphs      | `M` and `§`, one face and weight, each scaled so its measured ink height equals M, sharing the band |
| Glyph gap   | **g** between ink boxes — open, ≈ −M/40                          |
| Clearance   | pair bounding circle radius ≤ **0.85 M** (0.1 M inside the dashed ring) |

## Construction

1. Position glyphs by measured ink box (canvas `actualBoundingBoxAscent/Descent`), never by font
   metrics. The pair is centered on the tile, horizontally and vertically.
2. The pair's bounding circle radius is `hypot(pairWidth, M) / 2`. If it exceeds 0.85 M, either
   uniformly scale the pair down until it fits (**fixed** rings), or grow both rings to wrap it —
   keeping the 0.1 M clearance and the 0.15 M ring separation, outer ring capped 0.1 M inside the
   tile (**hug**).

## Color

Tailwind v4 tokens only, at their exact oklch values (source of truth: `tailwindcss/theme.css`).
One neutral family carries the whole mark:

| Role  | Light  | Dark   |
| ----- | ------ | ------ |
| Disc  | `-100` | `-950` |
| Glyph | `-950` | `-50`  |
| Ring  | `-400` | `-600` |

## Open parameters

typeface · weight · case · gap g · ring set (both / solid / dashed / none) · palette family

## Deliverables

- `assets/icon.png` — 512 px, transparent corners, dark ground
- `galleryBanner.color` — the family's `-950` as hex
- Floor: the mark must stay legible at 16 px
