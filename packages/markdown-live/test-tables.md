# Tables

← [Back to test suite](test.md)

Tables render as a live grid with full grid lines. **Click any cell** to edit it in place (Enter or click
away to commit). Each column has a **grip on its top edge** and each row a **grip on its left edge**: drag a
grip to reorder, or click it for a menu (insert left/right or above/below, set alignment, delete). The
**edge "+" bars** add a column on the right or a row below; the **corner** deletes the table. Put the cursor
on the table to reveal its raw source below, with the grid kept as a live preview.

---

## Extension Settings

| Setting             | Type     | Default  | Description                       |
| ------------------- | -------- | -------- | --------------------------------- |
| `mermaidRenderMode` | `string` | `inline` | How Mermaid diagrams are rendered |

---

## Callout Types

| Type     | Aliases            | Color  |
| -------- | ------------------ | ------ |
| NOTE     | INFO, TODO         | Blue   |
| TIP      | HINT, IMPORTANT    | Green  |
| SUCCESS  | CHECK, DONE        | Green  |
| WARNING  | CAUTION, ATTENTION | Yellow |
| FAILURE  | FAIL, MISSING      | Red    |
| DANGER   | ERROR              | Red    |
| BUG      |                    | Red    |
| QUESTION | HELP, FAQ          | Purple |
| ABSTRACT | SUMMARY, TLDR      | Teal   |
| EXAMPLE  |                    | Purple |
| QUOTE    | CITE               | Gray   |

---

## Alignment (GFM)

| Left  |    Center    |                       Right |
| :---- | :----------: | --------------------------: |
| apple |    banana    |                      cherry |
| 1     |      2       |                           3 |
| short | a bit longer | the longest cell value here |

---

## Empty Cells

| A   | B   | C   |
| --- | --- | --- |
| 1   |     | 3   |
|     | 5   | 6   |
| 7   | 8   |     |

---

## Inline Formatting in Cells

| Feature       | Syntax                         | Status              |
| ------------- | ------------------------------ | ------------------- |
| Inline code   | `const x = 1`                  | **shipped**         |
| Bold & italic | **bold**, _italic_             | **shipped**         |
| Strikethrough | ~~old approach~~               | _deprecated_        |
| Link          | [example](https://example.com) | see [docs](test.md) |
