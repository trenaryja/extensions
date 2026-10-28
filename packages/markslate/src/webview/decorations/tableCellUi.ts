import type { EditorView } from '@codemirror/view'
import { caretAtEnd, caretAtStart } from './tableDom'
import { appendInline } from './tableInline'
import type { Cell, GridEvent } from './tableMachine'
import { dispatch, leaveIfOutside, session } from './tableSession'

// A cell shows rendered inline markdown and is inert until the machine puts it into edit mode. Click selects,
// double-click edits; while editing, Enter/Tab/Escape and edge arrows route to the machine, mid-text arrows and
// typing are native (the caret only spills to a neighbour once it reaches the cell's start/end).
type GridCellContext = { content: HTMLElement; raw: string; cell: Cell; view: EditorView; from: number }

export function gridCell({ content, raw, cell, view, from }: GridCellContext) {
	content.className = 'md-td-content'
	content.dataset.raw = raw
	content.contentEditable = 'false'
	appendInline(content, raw)

	content.addEventListener('mousedown', (event) => {
		// Only the left button selects/drags. Right-click must NOT preventDefault here — that suppresses the
		// contextmenu event in Electron. Editing this cell → let the browser place the caret natively.
		if (event.button !== 0 || content.contentEditable === 'true') return
		event.preventDefault()
		dispatch(view, from, { t: 'click', cell, shift: event.shiftKey })
	})
	content.addEventListener('mouseenter', (event) => {
		if (event.buttons === 1 && session.activeFrom === from && session.gridState.mode === 'selected')
			dispatch(view, from, { t: 'dragTo', cell })
	})
	content.addEventListener('dblclick', (event) => {
		event.preventDefault()
		dispatch(view, from, { t: 'click', cell, shift: false })
		dispatch(view, from, { t: 'beginEdit', seed: null })
	})
	content.addEventListener('keydown', (event) => {
		if (content.contentEditable !== 'true') return // only meaningful while editing this cell
		if (event.key === 'Enter') {
			event.preventDefault()
			dispatch(view, from, { t: 'commitMove', dir: event.shiftKey ? 'up' : 'down' })
		} else if (event.key === 'Tab') {
			event.preventDefault()
			dispatch(view, from, { t: 'commitMove', dir: event.shiftKey ? 'left' : 'right' })
		} else if (event.key === 'Escape') {
			event.preventDefault()
			dispatch(view, from, { t: 'escape' })
		} else if (event.key === 'ArrowRight' && caretAtEnd(content)) {
			// Horizontal: spill only at the text edge; mid-text, let the browser move the caret.
			event.preventDefault()
			dispatch(view, from, { t: 'edgeStep', dir: 'right' })
		} else if (event.key === 'ArrowLeft' && caretAtStart(content)) {
			event.preventDefault()
			dispatch(view, from, { t: 'edgeStep', dir: 'left' })
		} else if (event.key === 'ArrowDown') {
			// Vertical: a cell is a single line, so ↑/↓ always move to the neighbouring row (and must be caught —
			// the native caret would otherwise escape the cell and blur out of the table).
			event.preventDefault()
			dispatch(view, from, { t: 'edgeStep', dir: 'down' })
		} else if (event.key === 'ArrowUp') {
			event.preventDefault()
			dispatch(view, from, { t: 'edgeStep', dir: 'up' })
		}
	})
	content.addEventListener('blur', () => {
		if (content.contentEditable !== 'true') return
		requestAnimationFrame(() => leaveIfOutside(view, from))
	})
}

const arrowDir = (key: string) =>
	key === 'ArrowUp'
		? 'up'
		: key === 'ArrowDown'
			? 'down'
			: key === 'ArrowLeft'
				? 'left'
				: key === 'ArrowRight'
					? 'right'
					: null

// The ⌘/Ctrl chords the sink owns. Returns whether it consumed the key.
const sinkChord = (view: EditorView, from: number, event: KeyboardEvent) => {
	if (!event.metaKey && !event.ctrlKey) return false
	const lower = event.key.toLowerCase()
	if (lower !== 'a' && lower !== 'c' && lower !== 'x') return false
	event.preventDefault()
	if (lower === 'a') dispatch(view, from, { t: 'selectAll' })
	else dispatch(view, from, { t: lower === 'x' ? 'cut' : 'copy' })
	return true
}

// The sink's plain-key bindings: nav, edit entry, clear, and type-to-replace.
const sinkKeyEvent = (event: KeyboardEvent): GridEvent | null => {
	const { key } = event
	const dir = arrowDir(key)
	if (dir) return { t: 'move', dir, shift: event.shiftKey }
	// Enter on a selected cell edits it (like F2); Enter while *editing* commits + moves down (cell handler).
	if (key === 'Enter' || key === 'F2') return { t: 'beginEdit', seed: null }
	if (key === 'Tab') return { t: 'commitMove', dir: event.shiftKey ? 'left' : 'right' }
	if (key === 'Escape') return { t: 'escape' }
	if (key === 'Backspace' || key === 'Delete') return { t: 'clear' }
	if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) return { t: 'beginEdit', seed: key }
	return null
}

// The hidden per-table sink holds keyboard focus while a range is selected (so typing, nav, and paste have a
// target). It also captures clipboard events. Selected-mode key handling lives here; editing lives on cells.
export function makeSink(view: EditorView, from: number) {
	const sink = document.createElement('textarea')
	sink.className = 'md-grid-sink'
	sink.setAttribute('aria-hidden', 'true')
	sink.tabIndex = -1
	sink.addEventListener('keydown', (event) => {
		if (sinkChord(view, from, event)) return
		const gridEvent = sinkKeyEvent(event)
		if (!gridEvent) return
		event.preventDefault()
		dispatch(view, from, gridEvent)
	})
	sink.addEventListener('blur', () => requestAnimationFrame(() => leaveIfOutside(view, from)))
	return sink
}

// Paste is owned at the document capture phase whenever a grid sink holds focus, ahead of CodeMirror's own
// paste handler (which would target the atomic editor selection). Copy/cut go through the sink's keydown
// instead — an empty sink textarea doesn't reliably emit a `copy` event.
const gridSinkFocused = () =>
	session.activeView != null &&
	session.activeFrom != null &&
	document.activeElement instanceof HTMLElement &&
	document.activeElement.classList.contains('md-grid-sink')

if (typeof document !== 'undefined')
	document.addEventListener(
		'paste',
		(event) => {
			const view = session.activeView
			const from = session.activeFrom
			if (!view || from == null || !gridSinkFocused()) return
			event.preventDefault()
			event.stopImmediatePropagation()
			session.pendingPaste = event.clipboardData?.getData('text/plain') ?? ''
			dispatch(view, from, { t: 'paste' })
		},
		{ capture: true },
	)
