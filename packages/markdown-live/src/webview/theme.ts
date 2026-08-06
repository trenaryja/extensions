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
			marginTop: '0.5em',
			marginBottom: '0.3em',
			color: 'var(--vscode-editor-foreground)',
		},
		'.md-h2': {
			fontSize: '1.6em',
			fontWeight: '700',
			lineHeight: '1.3',
			marginTop: '0.5em',
			marginBottom: '0.3em',
		},
		'.md-h3': {
			fontSize: '1.3em',
			fontWeight: '600',
			lineHeight: '1.3',
			marginTop: '0.5em',
			marginBottom: '0.3em',
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
		'.md-marker': {
			display: 'none',
		},
		'.md-code-inline': {
			fontFamily: "var(--vscode-editor-font-family, 'SF Mono', Menlo, Consolas, monospace)",
			fontSize: '0.88em',
			background: 'var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15))',
			borderRadius: '3px',
			padding: '0.1em 0.35em',
		},

		// Links
		'.md-link-text': {
			color: 'var(--vscode-textLink-foreground, #4fc1ff)',
			textDecoration: 'underline',
			cursor: 'pointer',
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

		// Code block widget
		'.md-codeblock-widget': {
			display: 'block',
			borderRadius: '6px',
			overflow: 'hidden',
			margin: '0.5em 0',
			border: '1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.2))',
		},
		'.md-codeblock-header': {
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'space-between',
			padding: '0.2rem 0.75rem',
			background: 'var(--vscode-editorWidget-background, rgba(128,128,128,0.06))',
			borderBottom: '1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.1))',
			minHeight: '1.75rem',
		},
		'.md-codeblock-lang': {
			fontSize: '0.72em',
			opacity: '0.45',
			fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
			letterSpacing: '0.03em',
		},
		'.md-codeblock-copy': {
			opacity: '0',
			transition: 'opacity 0.15s',
			padding: '0.15em 0.55em',
			fontSize: '0.72em',
			fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
			background: 'var(--vscode-button-secondaryBackground, rgba(128,128,128,0.2))',
			color: 'var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground))',
			border: '1px solid var(--vscode-button-border, rgba(128,128,128,0.3))',
			borderRadius: '3px',
			cursor: 'pointer',
		},
		'.md-codeblock-widget:hover .md-codeblock-copy': {
			opacity: '1',
		},
		'.md-codeblock-copy:hover': {
			background: 'var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,0.3))',
		},
		// Plain pre shown while Shiki loads
		'.md-codeblock-plain': {
			margin: '0',
			padding: '0.85rem 1rem',
			fontFamily: "var(--vscode-editor-font-family, 'SF Mono', Menlo, Consolas, monospace)",
			fontSize: '0.88em',
			background: 'var(--vscode-textCodeBlock-background, rgba(128,128,128,0.12))',
			overflowX: 'auto',
		},
		// Shiki output — transformer removed inline style from <pre> so CSS controls background
		'.md-codeblock-shiki pre': {
			margin: '0',
			padding: '0.85rem 1rem',
			background: 'var(--vscode-textCodeBlock-background, rgba(128,128,128,0.12))',
			fontSize: '0.88em',
			overflowX: 'auto',
		},

		// Widgets
		'.md-widget': {
			display: 'block',
		},
		'.md-hr': {
			border: 'none',
			borderTop: '1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.35))',
			margin: '1em 0',
			display: 'block',
		},
		'.md-img': {
			maxWidth: '100%',
			height: 'auto',
			borderRadius: '4px',
			display: 'block',
			margin: '0.5em 0',
		},
		'.md-task-checkbox': {
			marginRight: '0.4em',
			cursor: 'pointer',
			accentColor: 'var(--vscode-textLink-foreground, #4fc1ff)',
		},

		// Table widget
		'.md-table': {
			borderCollapse: 'separate',
			borderSpacing: '0',
			width: '100%',
			margin: '1em 0',
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
		'.md-callout': {
			borderRadius: '6px',
			margin: '0.75em 0',
			overflow: 'hidden',
			border: '1px solid',
		},
		'.md-callout-title': {
			display: 'flex',
			alignItems: 'center',
			gap: '0.4em',
			padding: '0.5em 0.75em',
			fontWeight: '600',
			fontSize: '0.9em',
		},
		'.md-callout-content': {
			padding: '0.5em 0.75em 0.75em',
			fontSize: '0.95em',
			lineHeight: '1.6',
		},
		// Callout color variants
		'.md-callout-note, .md-callout-info, .md-callout-todo': {
			borderColor: 'rgba(79,193,255,0.4)',
			background: 'rgba(79,193,255,0.06)',
		},
		'.md-callout-note .md-callout-title, .md-callout-info .md-callout-title, .md-callout-todo .md-callout-title': {
			background: 'rgba(79,193,255,0.12)',
			color: '#4fc1ff',
		},
		'.md-callout-tip, .md-callout-hint, .md-callout-important': {
			borderColor: 'rgba(83,197,120,0.4)',
			background: 'rgba(83,197,120,0.06)',
		},
		'.md-callout-tip .md-callout-title, .md-callout-hint .md-callout-title, .md-callout-important .md-callout-title': {
			background: 'rgba(83,197,120,0.12)',
			color: '#53c578',
		},
		'.md-callout-success, .md-callout-check, .md-callout-done': {
			borderColor: 'rgba(83,197,120,0.4)',
			background: 'rgba(83,197,120,0.06)',
		},
		'.md-callout-success .md-callout-title, .md-callout-check .md-callout-title, .md-callout-done .md-callout-title': {
			background: 'rgba(83,197,120,0.12)',
			color: '#53c578',
		},
		'.md-callout-warning, .md-callout-caution, .md-callout-attention': {
			borderColor: 'rgba(255,200,60,0.4)',
			background: 'rgba(255,200,60,0.06)',
		},
		'.md-callout-warning .md-callout-title, .md-callout-caution .md-callout-title, .md-callout-attention .md-callout-title':
			{
				background: 'rgba(255,200,60,0.12)',
				color: '#ffc83c',
			},
		'.md-callout-failure, .md-callout-fail, .md-callout-missing': {
			borderColor: 'rgba(255,100,100,0.4)',
			background: 'rgba(255,100,100,0.06)',
		},
		'.md-callout-failure .md-callout-title, .md-callout-fail .md-callout-title, .md-callout-missing .md-callout-title':
			{
				background: 'rgba(255,100,100,0.12)',
				color: '#ff6464',
			},
		'.md-callout-danger, .md-callout-error': {
			borderColor: 'rgba(255,100,100,0.4)',
			background: 'rgba(255,100,100,0.06)',
		},
		'.md-callout-danger .md-callout-title, .md-callout-error .md-callout-title': {
			background: 'rgba(255,100,100,0.12)',
			color: '#ff6464',
		},
		'.md-callout-bug': {
			borderColor: 'rgba(255,100,100,0.4)',
			background: 'rgba(255,100,100,0.06)',
		},
		'.md-callout-bug .md-callout-title': {
			background: 'rgba(255,100,100,0.12)',
			color: '#ff6464',
		},
		'.md-callout-question, .md-callout-help, .md-callout-faq': {
			borderColor: 'rgba(180,120,255,0.4)',
			background: 'rgba(180,120,255,0.06)',
		},
		'.md-callout-question .md-callout-title, .md-callout-help .md-callout-title, .md-callout-faq .md-callout-title': {
			background: 'rgba(180,120,255,0.12)',
			color: '#b478ff',
		},
		'.md-callout-abstract, .md-callout-summary, .md-callout-tldr': {
			borderColor: 'rgba(0,200,180,0.4)',
			background: 'rgba(0,200,180,0.06)',
		},
		'.md-callout-abstract .md-callout-title, .md-callout-summary .md-callout-title, .md-callout-tldr .md-callout-title':
			{
				background: 'rgba(0,200,180,0.12)',
				color: '#00c8b4',
			},
		'.md-callout-example': {
			borderColor: 'rgba(180,120,255,0.4)',
			background: 'rgba(180,120,255,0.06)',
		},
		'.md-callout-example .md-callout-title': {
			background: 'rgba(180,120,255,0.12)',
			color: '#b478ff',
		},
		'.md-callout-quote, .md-callout-cite': {
			borderColor: 'rgba(128,128,128,0.4)',
			background: 'rgba(128,128,128,0.06)',
		},
		'.md-callout-quote .md-callout-title, .md-callout-cite .md-callout-title': {
			background: 'rgba(128,128,128,0.12)',
			color: 'var(--vscode-editor-foreground)',
		},

		// Mermaid
		'.md-mermaid-widget': {
			display: 'block',
			margin: '0.5em 0',
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
			margin: '0.5em 0',
		},
	},
	{ dark: false },
)
