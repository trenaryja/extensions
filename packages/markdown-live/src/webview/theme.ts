import { EditorView } from '@codemirror/view'

export const markdownLiveTheme = EditorView.theme(
	{
		'&': {
			height: '100%',
			background: 'transparent',
			color: 'var(--vscode-editor-foreground)',
		},
		'&.cm-focused': {
			outline: 'none',
		},
		'.cm-scroller': {
			fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif",
			fontSize: '16px',
			lineHeight: '1.7',
			overflow: 'auto',
		},
		'.cm-content': {
			maxWidth: '800px',
			margin: '0 auto',
			padding: '2rem 3rem',
			caretColor: 'var(--vscode-editorCursor-foreground, var(--vscode-editor-foreground))',
			whiteSpace: 'pre-wrap',
			wordBreak: 'break-word',
		},
		'.cm-line': {
			padding: '0',
		},
		'.cm-cursor': {
			borderLeftColor: 'var(--vscode-editorCursor-foreground, var(--vscode-editor-foreground))',
		},
		'.cm-selectionBackground': {
			background: 'var(--vscode-editor-selectionBackground, rgba(100,100,200,0.3))',
		},
		'&.cm-focused .cm-selectionBackground': {
			background: 'var(--vscode-editor-selectionBackground, rgba(100,100,200,0.3))',
		},
		'.cm-gutters': {
			display: 'none',
		},

		// Heading styles
		'.md-h1': {
			fontSize: '2em',
			fontWeight: '700',
			lineHeight: '1.3',
			color: 'var(--vscode-editor-foreground)',
		},
		'.md-h2': {
			fontSize: '1.6em',
			fontWeight: '700',
			lineHeight: '1.3',
		},
		'.md-h3': {
			fontSize: '1.3em',
			fontWeight: '600',
			lineHeight: '1.3',
		},
		'.md-h4': {
			fontSize: '1.1em',
			fontWeight: '600',
			lineHeight: '1.3',
		},
		'.md-h5': {
			fontSize: '1em',
			fontWeight: '600',
		},
		'.md-h6': {
			fontSize: '0.95em',
			fontWeight: '600',
			opacity: '0.85',
		},
		'.md-heading-marker': {
			display: 'none',
		},

		// Bold / italic / strikethrough / inline code
		'.md-bold': {
			fontWeight: '700',
		},
		'.md-italic': {
			fontStyle: 'italic',
		},
		'.md-strikethrough': {
			textDecoration: 'line-through',
		},
		'.md-code-inline': {
			fontFamily: "var(--vscode-editor-font-family, 'SF Mono', Menlo, Consolas, monospace)",
			fontSize: '0.88em',
			background: 'var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15))',
			borderRadius: '3px',
			padding: '0.1em 0.35em',
		},

		// Code blocks (model C+): the fenced block stays editable text; these paint the container,
		// dim the ``` fence lines, and place the copy/delete tools. Shiki colors come from inline styles.
		'.md-cb': {
			background: 'var(--vscode-textCodeBlock-background, rgba(128,128,128,0.1))',
			fontFamily: "var(--vscode-editor-font-family, 'SF Mono', Menlo, Consolas, monospace)",
			fontSize: '0.9em',
			padding: '0 1rem',
		},
		'.md-cb-open': {
			position: 'relative',
			paddingTop: '0.4rem',
			borderTopLeftRadius: '6px',
			borderTopRightRadius: '6px',
		},
		'.md-cb-close': {
			paddingBottom: '0.4rem',
			borderBottomLeftRadius: '6px',
			borderBottomRightRadius: '6px',
		},
		'.md-cb-open, .md-cb-close': {
			color: 'var(--vscode-descriptionForeground, rgba(128,128,128,0.6))',
			fontSize: '0.72em',
		},
		'.md-cb-tools': {
			float: 'right',
			display: 'inline-flex',
			gap: '0.3rem',
			userSelect: 'none',
			// Hidden until the pointer is over the block (codeHoverTools tags the fence line with md-cb-hovered).
			opacity: '0',
			transition: 'opacity 0.12s',
			pointerEvents: 'none',
		},
		'.md-cb-hovered .md-cb-tools': {
			opacity: '1',
			pointerEvents: 'auto',
		},
		'.md-cb-btn': {
			fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
			fontSize: '0.72rem',
			lineHeight: '1',
			padding: '0.2em 0.55em',
			background: 'var(--vscode-button-secondaryBackground, rgba(128,128,128,0.2))',
			color: 'var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground))',
			border: '1px solid var(--vscode-button-border, rgba(128,128,128,0.3))',
			borderRadius: '3px',
			cursor: 'pointer',
		},
		'.md-cb-btn:hover': {
			background: 'var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,0.3))',
		},

		// Links
		'.md-link-text': {
			color: 'var(--vscode-textLink-foreground, #4fc1ff)',
			textDecoration: 'underline',
			// Text cursor by default (a plain click edits); the pointer appears only while ⌘/Ctrl is held,
			// via the `html.md-mod-held` rule in styles.css.
			cursor: 'text',
		},

		// Blockquote — Decoration.line adds to .cm-line so border-left and padding work
		'.md-blockquote-line': {
			borderLeft: '3px solid var(--vscode-activityBarBadge-background, #4fc1ff)',
			paddingLeft: '1em',
			opacity: '0.85',
		},
		// Dim the raw `>` marker character
		'.md-blockquote-marker': {
			fontSize: '0',
		},

		// Lists — bullet glyph widget replaces raw `-`/`*`/`+`
		'.md-list-bullet-glyph': {
			color: 'var(--vscode-editor-foreground)',
			fontWeight: '600',
		},

		// Front matter — applied via Decoration.line so it sits on .cm-line
		'.md-frontmatter': {
			opacity: '0.45',
			fontFamily: "var(--vscode-editor-font-family, 'SF Mono', Menlo, Consolas, monospace)",
			fontSize: '0.85em',
		},

		// Widgets
		'.md-widget': {
			display: 'block',
		},
		// Inline-block + vertical-align keeps the rule's line at its natural height (no extra vertical space).
		'.md-hr': {
			display: 'inline-block',
			width: '100%',
			verticalAlign: 'middle',
			border: 'none',
			borderTop: '1px solid color-mix(in srgb, var(--vscode-editor-foreground, #888) 25%, transparent)',
		},
		'.md-img': {
			maxWidth: '100%',
			height: 'auto',
			borderRadius: '4px',
			display: 'block',
		},
		'.md-task-checkbox': {
			marginRight: '0.4em',
			cursor: 'pointer',
			accentColor: 'var(--vscode-textLink-foreground, #4fc1ff)',
		},

		// Table widget
		'.md-table-wrap': {
			display: 'block',
			// Visible overflow so the add "+" bars (absolute, just outside the frame) aren't clipped. The table
			// itself scrolls inside .md-table-scroll, so wide tables stay contained.
			overflow: 'visible',
			padding: '2px 0',
		},
		// Content-sized frame around the table; the add bars are positioned just outside it so they add no
		// resting height/width. position: relative anchors the selection box + drop indicator.
		'.md-table-frame': {
			display: 'inline-block',
			position: 'relative',
			maxWidth: '100%',
			verticalAlign: 'top',
		},
		'.md-table-scroll': {
			overflowX: 'auto',
			maxWidth: '100%',
		},
		// Source revealed while editing — a monospace container like a code block, so the pipes line up.
		// white-space: pre overrides the editor's line wrapping so a wide table's row keeps its column
		// alignment and scrolls horizontally (like a code block) instead of wrapping into an unreadable mess.
		'.md-table-src': {
			fontFamily: "var(--vscode-editor-font-family, 'SF Mono', Menlo, Consolas, monospace)",
			fontSize: '0.9em',
			background: 'var(--vscode-textCodeBlock-background, rgba(128,128,128,0.1))',
			padding: '0 1rem',
			whiteSpace: 'pre',
			// Grow to the line's content width so the box background covers the whole (overflowing) row.
			width: 'max-content',
			minWidth: '100%',
		},
		'.md-table-src-top': {
			paddingTop: '0.4rem',
			borderTopLeftRadius: '6px',
			borderTopRightRadius: '6px',
		},
		'.md-table-src-bottom': {
			paddingBottom: '0.4rem',
			borderBottomLeftRadius: '6px',
			borderBottomRightRadius: '6px',
		},
		'.md-table': {
			borderCollapse: 'collapse',
			fontSize: '0.875em',
			textAlign: 'left',
		},
		// Full grid lines in both directions. Padding lives on the content span (below) so the whole cell — not
		// just the text — is a click-to-edit target.
		'.md-table th, .md-table td': {
			border: '1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.22))',
			padding: '0',
			minWidth: '2.5rem',
			verticalAlign: 'middle',
			position: 'relative',
		},
		'.md-table thead th': {
			fontWeight: '600',
			whiteSpace: 'nowrap',
			background: 'color-mix(in srgb, var(--vscode-editor-foreground, #888) 7%, transparent)',
		},
		// Cell content fills the cell so the whole cell is a click target. Inert until the machine edits it.
		'.md-td-content': {
			display: 'block',
			padding: '0.45rem 0.8rem',
			minHeight: '1.5em',
			outline: 'none',
			cursor: 'cell',
			boxSizing: 'border-box',
		},
		// The cell currently being edited (contenteditable) shows a caret + a focus ring above the selection box.
		'.md-td-content[contenteditable="true"]': {
			cursor: 'text',
			boxShadow: 'inset 0 0 0 2px var(--vscode-focusBorder, #007fd4)',
		},
		// Hidden per-table sink that holds keyboard focus while a range is selected (and catches copy/cut/paste).
		'.md-grid-sink': {
			position: 'absolute',
			top: '0',
			left: '0',
			width: '1px',
			height: '1px',
			padding: '0',
			margin: '0',
			border: '0',
			opacity: '0',
			resize: 'none',
			overflow: 'hidden',
			whiteSpace: 'pre',
			pointerEvents: 'none',
		},
		// The selection box: one overlay over the selected cell-range's bounding rect.
		'.md-grid-selbox': {
			position: 'absolute',
			display: 'none',
			pointerEvents: 'none',
			zIndex: '3',
			border: '2px solid var(--vscode-focusBorder, #007fd4)',
			borderRadius: '2px',
			background: 'color-mix(in srgb, var(--vscode-focusBorder, #007fd4) 12%, transparent)',
		},
		// Drag handles: a slim grip on the top edge of each header (columns) / left edge of each row. Grab to
		// reorder; click for the options menu. Faint on row/column hover, solid when hovered directly.
		'.md-col-handle': {
			position: 'absolute',
			top: '-1px',
			left: '0',
			right: '0',
			height: '5px',
			borderRadius: '3px 3px 0 0',
			background: 'var(--vscode-editorWidget-border, rgba(128,128,128,0.5))',
			opacity: '0',
			cursor: 'grab',
			transition: 'opacity 0.12s',
			zIndex: '2',
		},
		'.md-row-handle': {
			position: 'absolute',
			top: '0',
			bottom: '0',
			left: '-1px',
			width: '5px',
			borderRadius: '3px 0 0 3px',
			background: 'var(--vscode-editorWidget-border, rgba(128,128,128,0.5))',
			opacity: '0',
			cursor: 'grab',
			transition: 'opacity 0.12s',
			zIndex: '2',
		},
		'.md-table th:hover .md-col-handle, .md-table tbody tr:hover .md-row-handle': {
			opacity: '0.6',
		},
		'.md-col-handle:hover, .md-row-handle:hover': {
			opacity: '1',
			background: 'var(--vscode-focusBorder, #007fd4)',
		},
		// While a column/row is being dragged: grabbing cursor everywhere, no text selection, keep the grip lit.
		'.md-dragging-col, .md-dragging-row, .md-dragging-col *, .md-dragging-row *': {
			cursor: 'grabbing !important',
			userSelect: 'none',
		},
		'.md-dragging-col .md-col-handle, .md-dragging-row .md-row-handle': {
			opacity: '1',
			background: 'var(--vscode-focusBorder, #007fd4)',
		},
		// The grabbed column/row: lifted above the sliding others, tinted so you can see what you're moving.
		'.md-drag-lift': {
			position: 'relative',
			zIndex: '6',
			background:
				'color-mix(in srgb, var(--vscode-focusBorder, #007fd4) 16%, var(--vscode-editor-background, #1e1e1e))',
			boxShadow: '0 6px 18px rgba(0, 0, 0, 0.45)',
		},
		// Edge "+" bars: add a column on the right, a row below. Revealed on hover of the frame.
		'.md-table-add': {
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			background: 'transparent',
			border: '1px dashed var(--vscode-editorWidget-border, rgba(128,128,128,0.35))',
			borderRadius: '4px',
			color: 'var(--vscode-descriptionForeground, #9aa0aa)',
			cursor: 'pointer',
			fontSize: '0.85rem',
			opacity: '0',
			transition: 'opacity 0.12s',
		},
		'.md-table-add-col': {
			position: 'absolute',
			top: '0',
			bottom: '0',
			left: '100%',
			marginLeft: '4px',
			width: '1.4rem',
		},
		'.md-table-add-row': {
			position: 'absolute',
			top: '100%',
			left: '0',
			right: '0',
			marginTop: '4px',
			height: '1.4rem',
		},
		'.md-table-frame:hover .md-table-add': {
			opacity: '1',
		},
		'.md-table-add:hover': {
			borderStyle: 'solid',
			background: 'var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2))',
			color: 'var(--vscode-editor-foreground)',
		},
		// Corner button (just past the bottom-right of the table): delete the whole table.
		'.md-table-corner': {
			position: 'absolute',
			top: '100%',
			left: '100%',
			margin: '4px 0 0 4px',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			width: '1.4rem',
			height: '1.4rem',
			background: 'transparent',
			border: 'none',
			borderRadius: '4px',
			color: 'var(--vscode-descriptionForeground, #9aa0aa)',
			cursor: 'pointer',
			fontSize: '0.8rem',
			opacity: '0',
			transition: 'opacity 0.12s',
		},
		'.md-table-frame:hover .md-table-corner': {
			opacity: '0.55',
		},
		'.md-table-corner:hover': {
			opacity: '1',
			color: 'var(--vscode-errorForeground, #f14c4c)',
			background: 'var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2))',
		},
		// Context menu opened from a column/row handle (insert / align / delete).
		'.md-table-menu': {
			position: 'fixed',
			zIndex: '1000',
			minWidth: '168px',
			padding: '4px',
			background: 'var(--vscode-menu-background, var(--vscode-editorWidget-background, #252526))',
			color: 'var(--vscode-menu-foreground, var(--vscode-editor-foreground, #ccc))',
			border: '1px solid var(--vscode-menu-border, var(--vscode-editorWidget-border, rgba(128,128,128,0.3)))',
			borderRadius: '6px',
			boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
			fontSize: '0.85rem',
		},
		'.md-menu-item': {
			display: 'flex',
			alignItems: 'center',
			gap: '0.55rem',
			width: '100%',
			padding: '0.35rem 0.6rem',
			background: 'transparent',
			border: 'none',
			borderRadius: '4px',
			color: 'inherit',
			cursor: 'pointer',
			textAlign: 'left',
			fontSize: 'inherit',
		},
		'.md-menu-item .codicon': {
			fontSize: '0.9rem',
			opacity: '0.85',
		},
		'.md-menu-item:hover': {
			background: 'var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground, rgba(128,128,128,0.2)))',
			color: 'var(--vscode-menu-selectionForeground, inherit)',
		},
		'.md-menu-danger:hover': {
			background: 'var(--vscode-errorForeground, #f14c4c)',
			color: '#fff',
		},
		'.md-menu-sep': {
			height: '1px',
			margin: '4px 6px',
			background: 'var(--vscode-menu-separatorBackground, rgba(128,128,128,0.25))',
		},

		// Callout widget
		// Callouts are styled in place — the `>` lines stay editable text. Each callout line gets a
		// container look derived from --callout-color (neutral fallback); per-type rules / config set it.
		'.md-callout-line': {
			background: 'color-mix(in srgb, var(--callout-color, rgba(140,140,160,0.85)) 6%, transparent)',
			borderLeft: '1px solid color-mix(in srgb, var(--callout-color, rgba(140,140,160,0.85)) 40%, transparent)',
			borderRight: '1px solid color-mix(in srgb, var(--callout-color, rgba(140,140,160,0.85)) 40%, transparent)',
			paddingLeft: '0.85em',
			paddingRight: '0.85em',
		},
		// NOTE: no margins here — margins are excluded from a line's offsetHeight, which desyncs CodeMirror's
		// height model and makes clicks land off (worse further down). Use padding (measured) for spacing;
		// the blank markdown lines between callouts provide the external separation.
		'.md-callout-line-head': {
			paddingTop: '0.5em',
			// Match padding-bottom so the header is vertically centered even when it's not also the last line
			// (expanded callouts) — and it gives the title→content breathing room.
			paddingBottom: '0.5em',
			borderTop: '1px solid color-mix(in srgb, var(--callout-color, rgba(140,140,160,0.85)) 40%, transparent)',
			borderTopLeftRadius: '6px',
			borderTopRightRadius: '6px',
			background: 'color-mix(in srgb, var(--callout-color, rgba(140,140,160,0.85)) 14%, transparent)',
			fontWeight: '600',
			color: 'var(--callout-color, inherit)',
		},
		'.md-callout-line-last': {
			paddingBottom: '0.5em',
			borderBottom: '1px solid color-mix(in srgb, var(--callout-color, rgba(140,140,160,0.85)) 40%, transparent)',
			borderBottomLeftRadius: '6px',
			borderBottomRightRadius: '6px',
		},
		'.md-callout-icon': {
			marginRight: '0.45em',
			color: 'var(--callout-color, inherit)',
			// The codicon is an inline-block that defaults to baseline alignment (sits high next to the title);
			// middle-align it to the text so the icon and heading are vertically centered.
			verticalAlign: 'middle',
		},
		'.md-callout-title': {
			verticalAlign: 'middle',
		},
		// Fold chevron (only on `+`/`-` callouts) — click toggles collapse.
		'.md-callout-fold': {
			marginRight: '0.3em',
			verticalAlign: 'middle',
			fontSize: '0.9em',
			cursor: 'pointer',
			opacity: '0.65',
		},
		'.md-callout-fold:hover': {
			opacity: '1',
		},
		// A code block inside a callout: both are line decorations on the same line, and the callout rule is
		// defined later (so its tint would win). Force the code background back on top so the block still reads
		// as a distinct code container within the callout.
		'.md-callout-line.md-cb': {
			background: 'var(--vscode-textCodeBlock-background, rgba(128,128,128,0.1))',
		},
		// The code block's own rounded corners fight the callout's straight side borders (the tint peeks
		// through at the corners). Inside a callout, render the code as a clean flat band instead.
		'.md-callout-line.md-cb-open': {
			borderTopLeftRadius: '0',
			borderTopRightRadius: '0',
		},
		'.md-callout-line.md-cb-close': {
			borderBottomLeftRadius: '0',
			borderBottomRightRadius: '0',
		},
		// Mermaid
		'.md-mermaid-widget': {
			display: 'block',
			overflow: 'auto',
		},
		'.md-mermaid-error': {
			color: '#ff6464',
			fontFamily: "var(--vscode-editor-font-family, 'SF Mono', Menlo, Consolas, monospace)",
			fontSize: '0.85em',
			padding: '0.5em',
			background: 'rgba(255,100,100,0.08)',
			borderRadius: '4px',
			border: '1px solid rgba(255,100,100,0.3)',
			display: 'block',
		},

		// Math (MathJax SVG). Glyphs use `currentColor`, so inherit the editor foreground for live rendering.
		'.md-math': {
			color: 'var(--vscode-editor-foreground)',
		},
		'.md-math-inline': {
			display: 'inline-block',
		},
		'.md-math-block': {
			display: 'block',
			position: 'relative',
			textAlign: 'center',
			overflowX: 'auto',
			padding: '0.2rem 0',
		},
		'.md-math-svg': {
			display: 'block',
		},
		// Copy-SVG button, revealed on hover of a block equation (top-right).
		'.md-math-tools': {
			position: 'absolute',
			top: '0',
			right: '0',
			opacity: '0',
			transition: 'opacity 0.12s',
			pointerEvents: 'none',
		},
		'.md-math-block:hover .md-math-tools': {
			opacity: '1',
			pointerEvents: 'auto',
		},
		'.md-math-error': {
			color: '#ff6464',
			fontFamily: "var(--vscode-editor-font-family, 'SF Mono', Menlo, Consolas, monospace)",
			fontSize: '0.85em',
		},
	},
	{ dark: false },
)
