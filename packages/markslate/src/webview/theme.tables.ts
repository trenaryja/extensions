/** Table widget styles, spread into markSlateTheme. */
export const tableStyles = {
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
		background: 'color-mix(in srgb, var(--vscode-focusBorder, #007fd4) 16%, var(--vscode-editor-background, #1e1e1e))',
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
}
