# Tables

← [Back to test suite](test.md)

Tables are an Excel/Sheets-style data grid, driven by a small state machine (`document ↔ selected ↔ editing`).

- **Select**: click a cell, or arrow into the table from the line above/below. **Arrow keys** move the
  selection; at an edge they hand back to the document. **Shift+arrows** or **click-drag** select a range;
  **Ctrl/Cmd+A** selects the whole grid.
- **Edit**: **double-click**, press **Enter/F2**, or just **start typing** (type-to-replace). While editing,
  **Enter/Tab** commit and move to the next cell, **Esc** cancels back to the selection.
- **Clipboard**: **Copy/Cut/Paste** operate on the selected range as markdown; pasting a block bigger than the
  grid **grows the table** to fit. **Delete/Backspace** clears the selection.
- **Structure**: drag a column's **top grip** or a row's **left grip** to reorder; the **edge "+" bars** add a
  column/row; the **corner** deletes the table. **Right-click** for the full menu.
- **Raw markdown**: a plain click never flips the table into raw mode — select across it in the document (or
  right-click → "Edit source") to see the source.

---

## Extension Settings

| Setting             | Default  | Type     | Description                       |
| ------------------- | -------- | -------- | --------------------------------- |
| `mermaidRenderMode` | `inline` | `string` | How Mermaid diagrams are rendered |

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
| apple |    banana    |                 cherry |
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
