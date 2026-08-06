# MarkSlate

A beautiful live-preview markdown editor for VS Code — write without ever leaving your editor.

MarkSlate renders markdown live and in place, Obsidian-style: headings render large, tables become editable grids, callouts get their icons, math and diagrams draw themselves. Your file stays plain markdown on disk — MarkSlate is an editor, not a format.

![Live editing in MarkSlate](https://raw.githubusercontent.com/trenaryja/vscode-extensions/main/packages/markslate/media/editing.gif)

## Features

### Live preview, in place

- Headings, emphasis, lists, task lists, blockquotes, links, and images render as you type
- The active line reveals its raw markdown for precise edits, then re-renders when you leave it
- YAML frontmatter stays visible but dimmed
- Find & replace with `Cmd+F` / `Cmd+Alt+F` (`Ctrl+F` / `Ctrl+Alt+F`) — match count, case/word/regex toggles, in a VS Code-style widget

![Find in MarkSlate](https://raw.githubusercontent.com/trenaryja/vscode-extensions/main/packages/markslate/media/find.gif)

### Tables

Excel-style grid editing on plain GFM tables:

- Click to select, double-click to edit; keyboard navigation between cells
- Range selection, markdown-aware copy/paste
- Drag to reorder rows and columns
- Auto-formats a table's source when you finish editing it (like format-on-save, scoped to the table — `markslate.formatTablesOnEdit`)

![Editing a table like a spreadsheet](https://raw.githubusercontent.com/trenaryja/vscode-extensions/main/packages/markslate/media/tables.gif)

### Callouts

Obsidian's full callout taxonomy — 13 types plus aliases:

- Custom titles: `> [!tip] My title`
- Foldable callouts: `> [!tip]-` / `> [!tip]+`
- Nested callouts, with per-level color, icon, and title
- Override icons/colors or add your own types via `markslate.callouts` — emoji, `$(codicon)`, or raw SVG
- GitHub Alert syntax (`> [!NOTE]`, `> [!IMPORTANT]`, …) renders too, styled the Obsidian way

![Folding and unfolding callouts](https://raw.githubusercontent.com/trenaryja/vscode-extensions/main/packages/markslate/media/callouts.gif)

### Math

- Inline `$…$`, block `$$…$$`, and ` ```math ` fences
- Rendered by MathJax to crisp SVG in your theme's colors
- A **Copy SVG** button on every block equation exports it for slides, docs, anywhere (`markslate.mathExportColor` controls the baked-in color)

![Math rendering live, with Copy SVG](https://raw.githubusercontent.com/trenaryja/vscode-extensions/main/packages/markslate/media/math.gif)

### Mermaid diagrams

- ` ```mermaid ` blocks render live, theme-matched
- Render `inline` (diagram replaces the block), `below` (diagram under the source), or `disabled` (`markslate.mermaidRenderMode`)

![Mermaid rendering and re-theming live](https://raw.githubusercontent.com/trenaryja/vscode-extensions/main/packages/markslate/media/mermaid.gif)

### Code blocks

- Syntax-highlighted with [Shiki](https://shiki.style/), matched to your editor theme
- Copy and delete tools on hover; fences dim away while you read

![Shiki following the editor theme](https://raw.githubusercontent.com/trenaryja/vscode-extensions/main/packages/markslate/media/code.gif)

## Usage

MarkSlate registers as the default editor for `.md` files — just open one.

- **Toggle raw markdown**: `Cmd+Shift+M` (`Ctrl+Shift+M`), or the book icon in the editor title bar, switches between live preview and plain text, and back
- **Playground**: run **MarkSlate: Open Playground** from the Command Palette for a scratch file that tours every feature
- **One-off raw open**: right-click a file → **Open With…** → your text editor
- **Opt out as default**: set `workbench.editorAssociations` → `"*.md": "default"`

## Commands

| Command                           | Notes                          |
| --------------------------------- | ------------------------------ |
| MarkSlate: Toggle Raw/Preview     | `Cmd+Shift+M` / `Ctrl+Shift+M` |
| MarkSlate: Open Playground        | Editable tour of every feature |
| MarkSlate: Insert Code Block      | Language picker included       |
| MarkSlate: Insert Callout         | Type picker included           |
| MarkSlate: Insert Mermaid Diagram |                                |

Every command except **Open Playground** appears in the Command Palette only while a `.md` file is focused.

## Settings

| Setting                          | Default        | What it does                                              |
| -------------------------------- | -------------- | --------------------------------------------------------- |
| `markslate.mermaidRenderMode`    | `inline`       | `inline`, `below`, or `disabled`                          |
| `markslate.callouts`             | `{}`           | Override callout icons/colors, add custom types           |
| `markslate.calloutDefaultTitle`  | `true`         | Show the callout type as a title when none is given       |
| `markslate.mathExportColor`      | `currentColor` | Color baked into copied/exported math SVGs — `currentColor`, `theme`, or any CSS color |
| `markslate.formatTablesOnEdit`   | `true`         | Pretty-align a table's source after editing it            |

## License

[MIT](https://github.com/trenaryja/vscode-extensions/blob/main/packages/markslate/LICENSE)
