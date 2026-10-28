import type { EditorView } from '@codemirror/view'
import { gridToMarkdown, parseClipboardGrid, sliceRange, writeClipboard } from './tableClipboard'
import { cellContentEl, cellTd, placeCaretEnd, placeCaretStart } from './tableDom'
import { appendInline } from './tableInline'
import type { Cell, Effect, GridEvent, GridState } from './tableMachine'
import { normalizeRange, reduce } from './tableMachine'
import type { TableModel } from './tableModel'
import { insertColumn, insertRow, rewrite, setCell } from './tableModel'

/** The one module-level machine drives the active table; `reduce` (pure, tableMachine.ts) decides, the runner below executes against CM + the widget DOM, re-deriving from the current DOM (`data-from`) each dispatch. */
export const session: {
	gridState: GridState
	activeFrom: number | null
	activeView: EditorView | null
	/** stashed by the paste handler so the pure machine can stay clipboard-free */
	pendingPaste: string
	/** the table currently in raw-source mode (sticky while its caret stays) */
	revealedFrom: number | null
} = { gridState: { mode: 'document' }, activeFrom: null, activeView: null, pendingPaste: '', revealedFrom: null }

export const modelOf = new WeakMap<HTMLElement, TableModel>()

export type Ctx = {
	view: EditorView
	from: number
	model: TableModel
	table: HTMLElement
	frame: HTMLElement
	sink: HTMLTextAreaElement
	box: HTMLElement
}

export function ctxFor(view: EditorView, from: number): Ctx | null {
	const table = view.dom.querySelector(`.md-table[data-from="${from}"]`)
	if (!(table instanceof HTMLElement)) return null
	const model = modelOf.get(table)
	const frame = table.closest('.md-table-frame')
	const sink = frame?.querySelector('.md-grid-sink')
	const box = frame?.querySelector('.md-grid-selbox')
	if (
		!model ||
		!(frame instanceof HTMLElement) ||
		!(sink instanceof HTMLTextAreaElement) ||
		!(box instanceof HTMLElement)
	)
		return null
	return { view, from, model, table, frame, sink, box }
}

const hideBox = (ctx: Ctx) => {
	ctx.box.style.display = 'none'
}

// The selection box is one overlay positioned over the range's bounding rect (relative to the frame).
function positionBox(ctx: Ctx, anchor: Cell, focus: Cell) {
	const a = cellTd(ctx.table, anchor)
	const f = cellTd(ctx.table, focus)
	if (!a || !f) return void hideBox(ctx)
	const frame = ctx.frame.getBoundingClientRect()
	const ar = a.getBoundingClientRect()
	const fr = f.getBoundingClientRect()
	const top = Math.min(ar.top, fr.top) - frame.top
	const left = Math.min(ar.left, fr.left) - frame.left
	ctx.box.style.cssText = `display:block;top:${top}px;left:${left}px;width:${Math.max(ar.right, fr.right) - frame.left - left}px;height:${Math.max(ar.bottom, fr.bottom) - frame.top - top}px`
}

// Set every cell in the range to empty in one transaction.
function clearRange(ctx: Ctx, anchor: Cell, focus: Cell) {
	const r = normalizeRange(anchor, focus)
	let next = ctx.model
	for (let row = r.top; row <= r.bottom; row++)
		for (let col = r.left; col <= r.right; col++) next = setCell(next, { row, col }, '')
	rewrite(ctx.view, ctx.model, next)
}

function copyRange(ctx: Ctx, { anchor, focus, cut }: Extract<Effect, { e: 'copyRange' }>) {
	writeClipboard(gridToMarkdown(sliceRange(ctx.model, anchor, focus)))
	if (cut) clearRange(ctx, anchor, focus)
}

// Drop a parsed grid at `cell` (top-left), growing the table with empty rows/cols where the block overflows.
function pasteRange(ctx: Ctx, cell: Cell) {
	const grid = parseClipboardGrid(session.pendingPaste)
	session.pendingPaste = ''
	if (!grid.length) return
	let { model } = ctx
	const needCols = cell.col + Math.max(...grid.map((line) => line.length))
	while (model.headers.length < needCols) model = insertColumn(model, model.headers.length)
	const needRows = cell.row + grid.length
	while (model.rows.length < needRows) model = insertRow(model, model.rows.length)
	for (const [dr, line] of grid.entries())
		for (const [dc, value] of line.entries())
			model = setCell(model, { row: cell.row + dr, col: cell.col + dc }, value.replaceAll(/[\r\n]+/g, ' ').trim())

	rewrite(ctx.view, ctx.model, model)
}

function focusCell(ctx: Ctx, effect: Extract<Effect, { e: 'focusCell' }>) {
	// A preceding `commit` in the same event may have rebuilt the widget → resolve against the fresh DOM.
	const el = cellContentEl(ctxFor(ctx.view, ctx.from)?.table ?? ctx.table, effect.cell)
	if (!el) return
	el.contentEditable = 'true'
	el.textContent = effect.seed ?? el.dataset.raw ?? ''
	el.focus({ preventScroll: true })
	if (effect.caret === 'start') placeCaretStart(el)
	else placeCaretEnd(el)
}

function commitCell(ctx: Ctx, cell: Cell) {
	const el = cellContentEl(ctx.table, cell)
	if (!el) return
	el.contentEditable = 'false'
	const raw = el.dataset.raw ?? ''
	const next = el.textContent.replaceAll(/[\r\n]+/g, ' ').trim()

	if (next === raw) {
		el.textContent = ''
		appendInline(el, raw)
	} else rewrite(ctx.view, ctx.model, setCell(ctx.model, cell, next))
}

function cancelEdit(ctx: Ctx, cell: Cell) {
	const el = cellContentEl(ctx.table, cell)
	if (!el) return
	el.contentEditable = 'false'
	el.textContent = ''
	appendInline(el, el.dataset.raw ?? '')
}

function exitDoc(ctx: Ctx, side: Extract<Effect, { e: 'exitDoc' }>['side']) {
	const model = ctxFor(ctx.view, ctx.from)?.model ?? ctx.model // fresh: a preceding commit may have resized it
	const anchor = side === 'bottom' ? Math.min(model.to + 1, ctx.view.state.doc.length) : Math.max(model.from - 1, 0)
	ctx.view.dispatch({ selection: { anchor }, scrollIntoView: true })
	ctx.view.focus()
}

function runEffect(effect: Effect, ctx: Ctx) {
	switch (effect.e) {
		case 'focusCell':
			return void focusCell(ctx, effect)
		case 'commit':
			return void commitCell(ctx, effect.cell)
		case 'cancelEdit':
			return void cancelEdit(ctx, effect.cell)
		case 'exitDoc':
			return void exitDoc(ctx, effect.side)
		case 'clearRange':
			return void clearRange(ctx, effect.anchor, effect.focus)
		case 'copyRange':
			return void copyRange(ctx, effect)
		case 'pasteAt':
			return void pasteRange(ctx, effect.cell)
		// Derived from session.gridState by applyVisual instead — nothing to run here.
		case 'focusSink':
		case 'showSelection':
		case 'hideSelection':
			break
	}
}

// Re-derive the visual (selection box + which element holds focus) from the current state and DOM. Only the
// *active* table drives focus: every rebuilt widget schedules a deferred applyVisual, so without this guard a
// non-active table rebuilding while another is selected would steal the sink focus back to itself.
export function applyVisual(ctx: Ctx | null) {
	if (!ctx) return
	if (session.gridState.mode === 'selected' && ctx.from === session.activeFrom) {
		positionBox(ctx, session.gridState.anchor, session.gridState.focus)
		if (document.activeElement !== ctx.sink) ctx.sink.focus({ preventScroll: true })
	} else hideBox(ctx)
}

const dimsOf = (model: TableModel) => ({ rows: model.rows.length, cols: model.headers.length })

// Switching tables (click/enter into a different one) — commit any in-progress edit on the previous grid
// before leaving it (else the uncommitted text is silently lost), then tidy it up. Returns `from` remapped
// past whatever reflow that commit caused.
function leavePreviousGrid(view: EditorView, from: number) {
	if (session.activeFrom === null || session.activeFrom === from) return from
	const previous = ctxFor(view, session.activeFrom)
	let target = from

	if (previous) {
		const lengthBefore = view.state.doc.length
		for (const effect of reduce(session.gridState, { t: 'exit' }, dimsOf(previous.model)).effects)
			runEffect(effect, previous)
		// A commit that reflowed the previous table shifts every position after it — including our target
		// `from` when the clicked table sits below the one we just left.
		if (session.activeFrom < target) target += view.state.doc.length - lengthBefore
		const settled = ctxFor(view, session.activeFrom)
		if (settled) hideBox(settled)
	}

	session.gridState = { mode: 'document' }
	return target
}

// Send an event to the machine for table `from`, run its effects, then re-apply the visual to the fresh DOM.
export function dispatch(view: EditorView, initialFrom: number, event: GridEvent) {
	const from = event.t === 'click' || event.t === 'enter' ? leavePreviousGrid(view, initialFrom) : initialFrom
	const ctx = ctxFor(view, from)
	if (!ctx) return
	const enteringGrid = session.gridState.mode === 'document'
	session.activeFrom = from
	session.activeView = view
	const dims = dimsOf(ctx.model)
	const { next, effects } = reduce(session.gridState, event, dims)
	session.gridState = next

	// On first entry, anchor CM's caret to the table so undo/redo return here instead of the document top.
	// (A selection-only change keeps the widget's model equal, so ctx stays valid — no rebuild.)
	if (enteringGrid && next.mode !== 'document') {
		const { head } = view.state.selection.main
		if (head < ctx.model.from || head > ctx.model.to) view.dispatch({ selection: { anchor: ctx.model.from } })
	}

	for (const effect of effects) runEffect(effect, ctx)
	applyVisual(ctxFor(view, from)) // fresh ctx (a commit/clear may have rebuilt): hides the box in document
	if (next.mode === 'document') session.activeFrom = null // mode, positions it + holds the sink otherwise
}

// Force the machine back to the document (hide the box, drop the binding) — used when leaving via a route the
// machine doesn't own, e.g. the "Edit source" menu action selecting the table's range in CodeMirror.
export function leaveGrid(view: EditorView) {
	if (session.activeFrom == null) return
	const ctx = ctxFor(view, session.activeFrom)
	if (ctx) hideBox(ctx)
	session.gridState = { mode: 'document' }
	session.activeFrom = null
}

// If focus has left this table entirely (not just moved sink↔cell), tell the machine to exit + commit.
export function leaveIfOutside(view: EditorView, from: number) {
	if (session.activeFrom !== from || session.gridState.mode === 'document') return
	const active = document.activeElement
	if (
		active instanceof HTMLElement &&
		(active === ctxFor(view, from)?.sink || active.closest(`.md-table[data-from="${from}"]`))
	)
		return
	dispatch(view, from, { t: 'exit' })
}

// Reveal the raw markdown by selecting the table's range — a non-empty selection flips it into source mode.
export const revealSource = (view: EditorView, model: TableModel) => {
	leaveGrid(view) // drop any grid selection first so its overlay doesn't linger over the revealed source
	session.revealedFrom = model.from // stick in source mode while the caret stays in the table's lines
	view.dispatch({ selection: { anchor: model.from, head: model.to } })
	view.focus()
}
