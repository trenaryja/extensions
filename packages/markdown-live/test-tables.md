# Tables

← [Back to test suite](test.md)

Tables are a live data grid. **Click any cell** to edit it in place; **Tab / Shift-Tab / Enter** move between
cells and **Esc** cancels. **Right-click** a cell for the full menu — insert/delete rows and columns, set
alignment, **Copy as Markdown**, or **Edit source**. Drag a column's **top grip** or a row's **left grip** to
reorder; the **edge "+" bars** add a column or row, and the **corner** deletes the table. A plain click never
flips the table into raw mode — the markdown stays one right-click away ("Edit source", or select across it).

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
