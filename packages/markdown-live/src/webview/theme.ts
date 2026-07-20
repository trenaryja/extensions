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
			position: 'relative',
			overflowX: 'auto',
		},
		// Row/column tools, revealed on hover of the table (top-right).
		'.md-table-tools': {
			position: 'absolute',
			top: '0.35rem',
			right: '0.35rem',
			display: 'flex',
			gap: '0.3rem',
			opacity: '0',
			transition: 'opacity 0.12s',
			pointerEvents: 'none',
		},
		'.md-table-wrap:hover .md-table-tools': {
			opacity: '1',
			pointerEvents: 'auto',
		},
		// Source revealed while editing — a monospace container like a code block, so the pipes line up.
		'.md-table-src': {
			fontFamily: "var(--vscode-editor-font-family, 'SF Mono', Menlo, Consolas, monospace)",
			fontSize: '0.9em',
			background: 'var(--vscode-textCodeBlock-background, rgba(128,128,128,0.1))',
			padding: '0 1rem',
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
			borderCollapse: 'separate',
			borderSpacing: '0',
			width: '100%',
			fontSize: '0.875em',
			textAlign: 'left',
		},
		'.md-table th, .md-table td': {
			padding: '0.75rem 1rem',
			verticalAlign: 'middle',
		},
		'.md-table thead th': {
			fontWeight: '600',
			opacity: '0.6',
			whiteSpace: 'nowrap',
			borderBottom: '1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.2))',
		},
		'.md-table tbody tr:not(:last-child) td': {
			borderBottom: '1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.1))',
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
