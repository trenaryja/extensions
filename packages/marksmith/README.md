# Marksmith

A beautiful live-preview markdown editor for VS Code — write without ever leaving your editor.

Marksmith renders markdown live and in place, Obsidian-style: headings render large, tables become editable grids, callouts get their icons, math and diagrams draw themselves. Your file stays plain markdown on disk — Marksmith is an editor, not a format.

<!-- TODO: hero GIF once branding/media lands -->

## Features

### Live preview, in place

- Headings, emphasis, lists, task lists, blockquotes, links, and images render as you type
- The active line reveals its raw markdown for precise edits, then re-renders when you leave it
- YAML frontmatter stays visible but dimmed
- Code blocks are syntax-highlighted with [Shiki](https://shiki.style/), matched to your editor theme

### Tables

Excel-style grid editing on plain GFM tables:

- Click to select, double-click to edit; keyboard navigation between cells
- Range selection, markdown-aware copy/paste
- Drag to reorder rows and columns
- Auto-formats a table's source when you finish editing it (like format-on-save, scoped to the table — `marksmith.formatTablesOnEdit`)

### Callouts

Obsidian's full callout taxonomy — 13 types plus aliases:

- Custom titles: `> [!tip] My title`
- Foldable callouts: `> [!tip]-` / `> [!tip]+`
- Nested callouts, with per-level color, icon, and title
- Override icons/colors or add your own types via `marksmith.callouts` — emoji, `$(codicon)`, or raw SVG
- Covers GitHub Alerts (`> [!NOTE]` etc.) as a subset

### Math

- Inline `$…$`, block `$$…$$`, and ` ```math ` fences
- Rendered by MathJax to crisp SVG in your theme's colors
- A **Copy SVG** button on every block equation exports it for slides, docs, anywhere (`marksmith.mathExportColor` controls the baked-in color)

### Mermaid diagrams

- ` ```mermaid ` blocks render live, theme-matched
- Render inline, below the source, or not at all (`marksmith.mermaidRenderMode`)

## Usage

Marksmith registers as the default editor for `.md` files — just open one.

- **Toggle raw markdown**: `Cmd+Shift+M` (`Ctrl+Shift+M`) switches between live preview and plain text, and back
- **Playground**: run **Marksmith: Open Playground** from the Command Palette for a scratch file that tours every feature
- **One-off raw open**: right-click a file → **Open With…** → your text editor
- **Opt out as default**: set `workbench.editorAssociations` → `"*.md": "default"`

## Commands

| Command                         | Notes                                    |
| ------------------------------- | ---------------------------------------- |
| Marksmith: Toggle Raw/Preview   | `Cmd+Shift+M` / `Ctrl+Shift+M`           |
| Marksmith: Open Playground      | Editable tour of every feature           |
| Marksmith: Insert Code Block    | Language picker included                 |
| Marksmith: Insert Callout       | Type picker included                     |
| Marksmith: Insert Mermaid Diagram |                                        |

## Settings

| Setting                          | Default        | What it does                                              |
| -------------------------------- | -------------- | --------------------------------------------------------- |
| `marksmith.mermaidRenderMode`    | `inline`       | Diagram replaces the code block, renders below it, or off |
| `marksmith.callouts`             | `{}`           | Override callout icons/colors, add custom types           |
| `marksmith.calloutDefaultTitle`  | `true`         | Show the callout type as a title when none is given       |
| `marksmith.mathExportColor`      | `currentColor` | Color baked into copied/exported math SVGs                |
| `marksmith.formatTablesOnEdit`   | `true`         | Pretty-align a table's source after editing it            |

## License

[MIT](LICENSE)
