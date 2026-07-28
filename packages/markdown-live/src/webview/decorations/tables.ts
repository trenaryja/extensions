import { type EditorState, Prec, RangeSetBuilder, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, keymap } from '@codemirror/view'
import { defineWidget } from '../lib/widget'
import { docOrSelectionChanged, selectionRangeTouches, selectionTouches } from './active'
import { type Cell, type Effect, type GridEvent, type GridState, normalizeRange, reduce } from './tableMachine'

type Align = 'left' | 'center' | 'right' | null
type TableModel = { headers: string[]; aligns: Align[]; rows: string[][]; from: number; to: number }

const isSeparatorRow = (text: string) => /^\|?[\s\-|:]+\|[\s\-|:]*$/.test(text) && text.includes('-')

const parseRow = (text: string) =>
	text
		.replace(/^\|/, '')
		.replace(/\|$/, '')
		.split('|')
		.map((cell) => cell.trim())

const parseAligns = (separator: string, count: number): Align[] => {
	const cells = parseRow(separator)
	return Array.from({ length: count }, (_, i) => {
		const cell = cells[i] ?? ''
		const left = cell.startsWith(':')
		const right = cell.endsWith(':')
		return left && right ? 'center' : right ? 'right' : left ? 'left' : null
	})
}

// ---------- Inline markdown → DOM (for cell content: code, bold, italic, strikethrough, links) ----------

const INLINE_RE = /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|~~([^~]+)~~|\[([^\]]+)\]\(([^)]+)\)/g

const inlineEl = (tag: string, text: string, className?: string) => {
	const el = document.createElement(tag)
	el.textContent = text
	if (className) el.className = className
	return el
}

function appendInline(parent: HTMLElement, text: string) {
	INLINE_RE.lastIndex = 0
	let last = 0
	for (let match = INLINE_RE.exec(text); match; match = INLINE_RE.exec(text)) {
		if (match.index > last) parent.append(text.slice(last, match.index))
		if (match[1] != null) parent.append(inlineEl('code', match[1], 'md-code-inline'))
		else if (match[2] != null || match[3] != null) parent.append(inlineEl('strong', match[2] ?? match[3] ?? ''))
		else if (match[4] != null || match[5] != null) parent.append(inlineEl('em', match[4] ?? match[5] ?? ''))
		else if (match[6] != null) parent.append(inlineEl('del', match[6]))
		else if (match[7] != null) {
			const link = inlineEl('a', match[7], 'md-link-text')
			link.title = `⌘/Ctrl-click to open · ${match[8]}`
			parent.append(link)
		}
		last = INLINE_RE.lastIndex
	}
	if (last < text.length) parent.append(text.slice(last))
}

// ---------- Serialization (normalizes/pretty-aligns; makes structural edits trivial) ----------

function pad(text: string, width: number, align: Align) {
	if (align === 'right') return text.padStart(width)
	if (align === 'center') {
		const total = Math.max(0, width - text.length)
		const left = Math.floor(total / 2)
		return ' '.repeat(left) + text + ' '.repeat(total - left)
	}
	return text.padEnd(width)
}

function marker(align: Align, width: number) {
	const dashes = (count: number) => '-'.repeat(Math.max(1, count))
	if (align === 'center') return `:${dashes(width - 2)}:`
	if (align === 'right') return `${dashes(width - 1)}:`
	if (align === 'left') return `:${dashes(width - 1)}`
	return dashes(width)
}

function serialize({ headers, aligns, rows }: TableModel) {
	const widths = headers.map((header, i) => Math.max(3, header.length, ...rows.map((row) => (row[i] ?? '').length)))
	const line = (cells: string[]) =>
		`| ${headers.map((_, i) => pad(cells[i] ?? '', widths[i] ?? 3, aligns[i] ?? null)).join(' | ')} |`
	const separator = `| ${widths.map((width, i) => marker(aligns[i] ?? null, width)).join(' | ')} |`
	return [line(headers), separator, ...rows.map(line)].join('\n')
}

// ---------- Model edits (each returns a new model; the widget reserializes + dispatches) ----------

const replaceAt = <T>(list: T[], index: number, value: T) => list.map((item, i) => (i === index ? value : item))
const insertAt = <T>(list: T[], index: number, value: T) => [...list.slice(0, index), value, ...list.slice(index)]
const removeAt = <T>(list: T[], index: number) => list.filter((_, i) => i !== index)
// Move the item at `from` so it lands before position `to` (0..length). `to === from`/`from + 1` are no-ops.
const moveAt = <T>(list: T[], from: number, to: number) => {
	const value = list[from]
	if (value === undefined) return list
	return insertAt(removeAt(list, from), to > from ? to - 1 : to, value)
}

// rowIndex -1 targets the header row.
const setCell = (model: TableModel, rowIndex: number, col: number, value: string): TableModel =>
	rowIndex < 0
		? { ...model, headers: replaceAt(model.headers, col, value) }
		: { ...model, rows: replaceAt(model.rows, rowIndex, replaceAt(model.rows[rowIndex] ?? [], col, value)) }

const emptyRow = (model: TableModel) => model.headers.map(() => '')
const insertRow = (model: TableModel, at: number): TableModel => ({
	...model,
	rows: insertAt(model.rows, at, emptyRow(model)),
})
const deleteRow = (model: TableModel, at: number): TableModel => ({ ...model, rows: removeAt(model.rows, at) })
const moveRow = (model: TableModel, from: number, to: number): TableModel => ({
	...model,
	rows: moveAt(model.rows, from, to),
})

const insertColumn = (model: TableModel, at: number): TableModel => ({
	...model,
	headers: insertAt(model.headers, at, ''),
	aligns: insertAt(model.aligns, at, null),
	rows: model.rows.map((row) => insertAt(row, at, '')),
})
const deleteColumn = (model: TableModel, at: number): TableModel => ({
	...model,
	headers: removeAt(model.headers, at),
	aligns: removeAt(model.aligns, at),
	rows: model.rows.map((row) => removeAt(row, at)),
})
const moveColumn = (model: TableModel, from: number, to: number): TableModel => ({
	...model,
	headers: moveAt(model.headers, from, to),
	aligns: moveAt(model.aligns, from, to),
	rows: model.rows.map((row) => moveAt(row, from, to)),
})
const setAlign = (model: TableModel, col: number, align: Align): TableModel => ({
	...model,
	aligns: replaceAt(model.aligns, col, align),
})

const rewrite = (view: EditorView, model: TableModel, next: TableModel) =>
	view.dispatch({ changes: { from: model.from, to: model.to, insert: serialize(next) } })

const deleteTable = (view: EditorView, model: TableModel) =>
	view.dispatch({ changes: { from: model.from, to: Math.min(model.to + 1, view.state.doc.length), insert: '' } })

// ---------- Context menu (houses insert / align / delete for a column or row) ----------

let currentMenu: { el: HTMLElement; cleanup: () => void } | null = null
const closeMenu = () => {
	currentMenu?.el.remove()
	currentMenu?.cleanup()
	currentMenu = null
}

type MenuItem = 'separator' | { label: string; icon: string; danger?: boolean; onClick: () => void }

// Position a menu below-left of an element (used by the grip handles); right-click uses the pointer instead.
const anchorPos = (el: HTMLElement) => {
	const rect = el.getBoundingClientRect()
	return { x: rect.left, y: rect.bottom + 4 }
}

function openMenu(view: EditorView, at: { x: number; y: number }, items: MenuItem[]) {
	closeMenu()
	const menu = document.createElement('div')
	menu.className = 'md-table-menu'
	menu.contentEditable = 'false'
	for (const item of items) {
		if (item === 'separator') {
			const separator = document.createElement('div')
			separator.className = 'md-menu-sep'
			menu.append(separator)
			continue
		}
		const button = document.createElement('button')
		button.type = 'button'
		button.className = item.danger ? 'md-menu-item md-menu-danger' : 'md-menu-item'
		const icon = document.createElement('span')
		icon.className = `codicon codicon-${item.icon}`
		button.append(icon, document.createTextNode(item.label))
		button.addEventListener('click', (event) => {
			event.stopPropagation()
			const run = item.onClick
			closeMenu()
			run()
		})
		menu.append(button)
	}
	// Live inside the editor (so themed styles apply) but position: fixed to escape the table's scroll clip.
	view.dom.append(menu)
	menu.style.left = `${Math.max(8, Math.min(at.x, window.innerWidth - menu.offsetWidth - 8))}px`
	menu.style.top = `${Math.max(8, Math.min(at.y, window.innerHeight - menu.offsetHeight - 8))}px`
	const onDown = (event: Event) => {
		if (!menu.contains(event.target as Node)) closeMenu()
	}
	const onKey = (event: KeyboardEvent) => event.key === 'Escape' && closeMenu()
	document.addEventListener('pointerdown', onDown, true)
	document.addEventListener('keydown', onKey, true)
	currentMenu = {
		el: menu,
		cleanup: () => {
			document.removeEventListener('pointerdown', onDown, true)
			document.removeEventListener('keydown', onKey, true)
		},
	}
}

// Write to the clipboard via the async API, with an execCommand fallback for older webviews.
function writeClipboard(text: string) {
	if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
	else fallbackCopy(text)
}
const copyMarkdown = (model: TableModel) => writeClipboard(serialize(model))
function fallbackCopy(text: string) {
	const area = document.createElement('textarea')
	area.value = text
	area.style.cssText = 'position:fixed;opacity:0'
	document.body.append(area)
	area.select()
	document.execCommand('copy')
	area.remove()
}

// Reveal the raw markdown by selecting the table's range — a non-empty selection flips it into source mode.
const revealSource = (view: EditorView, model: TableModel) => {
	leaveGrid(view) // drop any grid selection first so its overlay doesn't linger over the revealed source
	revealedFrom = model.from // stick in source mode while the caret stays in the table's lines
	view.dispatch({ selection: { anchor: model.from, head: model.to } })
	view.focus()
}

const columnMenu = (view: EditorView, anchor: HTMLElement, model: TableModel, col: number) =>
	openMenu(view, anchorPos(anchor), [
		{ label: 'Insert left', icon: 'arrow-left', onClick: () => rewrite(view, model, insertColumn(model, col)) },
		{ label: 'Insert right', icon: 'arrow-right', onClick: () => rewrite(view, model, insertColumn(model, col + 1)) },
		'separator',
		{
			label: 'Align left',
			icon: 'arrow-small-left',
			onClick: () => rewrite(view, model, setAlign(model, col, 'left')),
		},
		{ label: 'Align center', icon: 'arrow-both', onClick: () => rewrite(view, model, setAlign(model, col, 'center')) },
		{
			label: 'Align right',
			icon: 'arrow-small-right',
			onClick: () => rewrite(view, model, setAlign(model, col, 'right')),
		},
		'separator',
		{
			label: 'Delete column',
			icon: 'trash',
			danger: true,
			onClick: () => rewrite(view, model, deleteColumn(model, col)),
		},
	])

const rowMenu = (view: EditorView, anchor: HTMLElement, model: TableModel, rowIndex: number) =>
	openMenu(view, anchorPos(anchor), [
		{ label: 'Insert above', icon: 'arrow-up', onClick: () => rewrite(view, model, insertRow(model, rowIndex)) },
		{ label: 'Insert below', icon: 'arrow-down', onClick: () => rewrite(view, model, insertRow(model, rowIndex + 1)) },
		'separator',
		{
			label: 'Delete row',
			icon: 'trash',
			danger: true,
			onClick: () => rewrite(view, model, deleteRow(model, rowIndex)),
		},
	])

// The full right-click menu for a cell: row + column + alignment + table actions. (rowIndex -1 = header.)
function cellMenu(view: EditorView, at: { x: number; y: number }, model: TableModel, rowIndex: number, col: number) {
	const deleteRowItem: MenuItem[] =
		rowIndex >= 0
			? [
					{
						label: 'Delete row',
						icon: 'trash',
						danger: true,
						onClick: () => rewrite(view, model, deleteRow(model, rowIndex)),
					},
				]
			: []
	openMenu(view, at, [
		{
			label: 'Insert row above',
			icon: 'arrow-up',
			onClick: () => rewrite(view, model, insertRow(model, Math.max(0, rowIndex))),
		},
		{
			label: 'Insert row below',
			icon: 'arrow-down',
			onClick: () => rewrite(view, model, insertRow(model, rowIndex + 1)),
		},
		'separator',
		{ label: 'Insert column left', icon: 'arrow-left', onClick: () => rewrite(view, model, insertColumn(model, col)) },
		{
			label: 'Insert column right',
			icon: 'arrow-right',
			onClick: () => rewrite(view, model, insertColumn(model, col + 1)),
		},
		'separator',
		{
			label: 'Align left',
			icon: 'arrow-small-left',
			onClick: () => rewrite(view, model, setAlign(model, col, 'left')),
		},
		{ label: 'Align center', icon: 'arrow-both', onClick: () => rewrite(view, model, setAlign(model, col, 'center')) },
		{
			label: 'Align right',
			icon: 'arrow-small-right',
			onClick: () => rewrite(view, model, setAlign(model, col, 'right')),
		},
		'separator',
		...deleteRowItem,
		{
			label: 'Delete column',
			icon: 'trash',
			danger: true,
			onClick: () => rewrite(view, model, deleteColumn(model, col)),
		},
		'separator',
		{ label: 'Copy as Markdown', icon: 'copy', onClick: () => copyMarkdown(model) },
		{ label: 'Edit source', icon: 'code', onClick: () => revealSource(view, model) },
		{ label: 'Delete table', icon: 'trash', danger: true, onClick: () => deleteTable(view, model) },
	])
}

// ---------- Drag-to-reorder ----------

// The index (0..cells.length) a pointer at `pos` would drop before, given each cell's start/end along one axis.
const dropIndexAt = (bounds: { start: number; end: number }[], pos: number) => {
	for (let i = 0; i < bounds.length; i++) {
		const bound = bounds[i]
		if (bound && pos < (bound.start + bound.end) / 2) return i
	}
	return bounds.length
}

// A handle can be dragged (reorder) or clicked (open menu). A small movement threshold separates the two.
function attachHandle(
	handle: HTMLElement,
	onClick: () => void,
	drag: (event: PointerEvent, first: boolean) => void,
	onDrop: () => void,
) {
	handle.addEventListener('pointerdown', (down) => {
		down.preventDefault()
		down.stopPropagation()
		handle.setPointerCapture(down.pointerId)
		let dragging = false
		const move = (event: PointerEvent) => {
			if (!dragging && Math.abs(event.clientX - down.clientX) + Math.abs(event.clientY - down.clientY) < 4) return
			drag(event, !dragging)
			dragging = true
		}
		const up = () => {
			handle.removeEventListener('pointermove', move)
			handle.removeEventListener('pointerup', up)
			handle.releasePointerCapture(down.pointerId)
			if (dragging) onDrop()
			else onClick()
		}
		handle.addEventListener('pointermove', move)
		handle.addEventListener('pointerup', up)
	})
}

// ---------- Interaction: machine runner ----------
//
// One module-level machine drives the *active* table (whichever is being interacted with). `reduce` (pure,
// in tableMachine.ts) decides state + effects; the runner below executes those effects against CM + the
// widget DOM. Because a doc edit rebuilds the widget, everything is re-derived from the current DOM each
// dispatch (tables located by their `data-from`), so state survives rebuilds without a fragile focus queue.

const modelOf = new WeakMap<HTMLElement, TableModel>()
let gridState: GridState = { mode: 'document' }
let activeFrom: number | null = null
let activeView: EditorView | null = null
let revealedFrom: number | null = null // the table currently in raw-source mode (sticky while its caret stays)
let pendingPaste = '' // stashed by the paste handler so the pure machine can stay clipboard-free

type Ctx = {
	view: EditorView
	from: number
	model: TableModel
	table: HTMLElement
	frame: HTMLElement
	sink: HTMLTextAreaElement
	box: HTMLElement
}

function ctxFor(view: EditorView, from: number): Ctx | null {
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

const cellTd = (table: HTMLElement, cell: Cell): HTMLElement | undefined => {
	const row = cell.row < 0 ? table.querySelector('thead tr') : table.querySelectorAll('tbody tr')[cell.row]
	return row?.children[cell.col] as HTMLElement | undefined
}
const cellContentEl = (table: HTMLElement, cell: Cell) =>
	cellTd(table, cell)?.querySelector('.md-td-content') as HTMLElement | undefined

function placeCaretEnd(el: HTMLElement) {
	const range = document.createRange()
	range.selectNodeContents(el)
	range.collapse(false)
	const selection = window.getSelection()
	selection?.removeAllRanges()
	selection?.addRange(range)
}

// The selection box is one overlay positioned over the range's bounding rect (relative to the frame).
function positionBox(ctx: Ctx, anchor: Cell, focus: Cell) {
	const a = cellTd(ctx.table, anchor)
	const f = cellTd(ctx.table, focus)
	if (!a || !f) return hideBox(ctx)
	const frame = ctx.frame.getBoundingClientRect()
	const ar = a.getBoundingClientRect()
	const fr = f.getBoundingClientRect()
	const top = Math.min(ar.top, fr.top) - frame.top
	const left = Math.min(ar.left, fr.left) - frame.left
	ctx.box.style.cssText = `display:block;top:${top}px;left:${left}px;width:${Math.max(ar.right, fr.right) - frame.left - left}px;height:${Math.max(ar.bottom, fr.bottom) - frame.top - top}px`
}
const hideBox = (ctx: Ctx) => {
	ctx.box.style.display = 'none'
}

// Set every cell in the range to empty in one transaction.
function clearRange(ctx: Ctx, anchor: Cell, focus: Cell) {
	const r = normalizeRange(anchor, focus)
	let next = ctx.model
	for (let row = r.top; row <= r.bottom; row++)
		for (let col = r.left; col <= r.right; col++) next = setCell(next, row, col, '')
	rewrite(ctx.view, ctx.model, next)
}

// ---------- Clipboard (markdown-first, forgiving) ----------

const cellText = (model: TableModel, row: number, col: number) =>
	(row < 0 ? model.headers[col] : model.rows[row]?.[col]) ?? ''

// Pull the selected cells out as a 2-D grid of raw values.
function sliceRange(model: TableModel, anchor: Cell, focus: Cell) {
	const r = normalizeRange(anchor, focus)
	const grid: string[][] = []
	for (let row = r.top; row <= r.bottom; row++) {
		const line: string[] = []
		for (let col = r.left; col <= r.right; col++) line.push(cellText(model, row, col))
		grid.push(line)
	}
	return grid
}

// A copied range is a self-contained markdown table (its first row acts as the header).
function gridToMarkdown(grid: string[][]) {
	if (!grid[0]?.length) return ''
	const widths = grid[0].map((_, col) => Math.max(3, ...grid.map((line) => (line[col] ?? '').length)))
	const line = (cells: string[]) => `| ${widths.map((width, i) => (cells[i] ?? '').padEnd(width)).join(' | ')} |`
	const separator = `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`
	return [line(grid[0] ?? []), separator, ...grid.slice(1).map(line)].join('\n')
}

// Parse pasted text into a grid — a markdown table, else TSV, else one column of lines.
function parseClipboardGrid(text: string): string[][] {
	const trimmed = text.replace(/\r\n/g, '\n').replace(/\n+$/, '')
	if (!trimmed) return []
	const lines = trimmed.split('\n')
	if (lines.every((line) => line.includes('|')) && lines.some(isSeparatorRow))
		return lines.filter((line) => !isSeparatorRow(line)).map(parseRow)
	if (trimmed.includes('\t')) return lines.map((line) => line.split('\t').map((cell) => cell.trim()))
	return lines.map((line) => [line])
}

function copyRange(ctx: Ctx, anchor: Cell, focus: Cell, cut: boolean) {
	writeClipboard(gridToMarkdown(sliceRange(ctx.model, anchor, focus)))
	if (cut) clearRange(ctx, anchor, focus)
}

// Drop a parsed grid at `cell` (top-left), growing the table with empty rows/cols where the block overflows.
function pasteRange(ctx: Ctx, cell: Cell) {
	const grid = parseClipboardGrid(pendingPaste)
	pendingPaste = ''
	if (!grid.length) return
	let model = ctx.model
	const needCols = cell.col + Math.max(...grid.map((line) => line.length))
	while (model.headers.length < needCols) model = insertColumn(model, model.headers.length)
	const needRows = cell.row + grid.length
	while (model.rows.length < needRows) model = insertRow(model, model.rows.length)
	grid.forEach((line, dr) => {
		line.forEach((value, dc) => {
			model = setCell(model, cell.row + dr, cell.col + dc, value.replace(/[\n|]/g, ' ').trim())
		})
	})
	rewrite(ctx.view, ctx.model, model)
}

function runEffect(effect: Effect, ctx: Ctx) {
	switch (effect.e) {
		case 'focusCell': {
			const el = cellContentEl(ctx.table, effect.cell)
			if (!el) return
			el.contentEditable = 'true'
			el.textContent = effect.seed ?? el.dataset.raw ?? ''
			el.focus({ preventScroll: true })
			placeCaretEnd(el)
			return
		}
		case 'commit': {
			const el = cellContentEl(ctx.table, effect.cell)
			if (!el) return
			el.contentEditable = 'false'
			const raw = el.dataset.raw ?? ''
			const next = (el.textContent ?? '').replace(/[\n|]/g, ' ').trim()
			if (next !== raw) rewrite(ctx.view, ctx.model, setCell(ctx.model, effect.cell.row, effect.cell.col, next))
			else {
				el.textContent = ''
				appendInline(el, raw)
			}
			return
		}
		case 'cancelEdit': {
			const el = cellContentEl(ctx.table, effect.cell)
			if (!el) return
			el.contentEditable = 'false'
			el.textContent = ''
			appendInline(el, el.dataset.raw ?? '')
			return
		}
		case 'exitDoc': {
			const anchor =
				effect.side === 'bottom'
					? Math.min(ctx.model.to + 1, ctx.view.state.doc.length)
					: Math.max(ctx.model.from - 1, 0)
			ctx.view.dispatch({ selection: { anchor }, scrollIntoView: true })
			ctx.view.focus()
			return
		}
		case 'clearRange':
			return clearRange(ctx, effect.anchor, effect.focus)
		case 'copyRange':
			return copyRange(ctx, effect.anchor, effect.focus, effect.cut)
		case 'pasteAt':
			return void pasteRange(ctx, effect.cell)
		// showSelection / hideSelection / focusSink are derived from gridState by applyVisual — ignored here.
	}
}

// Re-derive the visual (selection box + which element holds focus) from the current state and DOM.
function applyVisual(ctx: Ctx | null) {
	if (!ctx) return
	if (gridState.mode === 'selected') {
		positionBox(ctx, gridState.anchor, gridState.focus)
		if (document.activeElement !== ctx.sink) ctx.sink.focus({ preventScroll: true })
	} else hideBox(ctx)
}

// Send an event to the machine for table `from`, run its effects, then re-apply the visual to the fresh DOM.
function dispatch(view: EditorView, from: number, event: GridEvent) {
	// Switching tables (click/enter into a different one) — tidy up the previous grid first.
	if ((event.t === 'click' || event.t === 'enter') && activeFrom !== null && activeFrom !== from) {
		const previous = ctxFor(view, activeFrom)
		if (previous) hideBox(previous)
		gridState = { mode: 'document' }
	}
	const ctx = ctxFor(view, from)
	if (!ctx) return
	const enteringGrid = gridState.mode === 'document'
	activeFrom = from
	activeView = view
	const dims = { rows: ctx.model.rows.length, cols: ctx.model.headers.length }
	const { next, effects } = reduce(gridState, event, dims)
	gridState = next
	// On first entry, anchor CM's caret to the table so undo/redo return here instead of the document top.
	// (A selection-only change keeps the widget's model equal, so ctx stays valid — no rebuild.)
	if (enteringGrid && next.mode !== 'document') {
		const head = view.state.selection.main.head
		if (head < ctx.model.from || head > ctx.model.to) view.dispatch({ selection: { anchor: ctx.model.from } })
	}
	for (const effect of effects) runEffect(effect, ctx)
	applyVisual(ctxFor(view, from)) // fresh ctx (a commit/clear may have rebuilt): hides the box in document
	if (next.mode === 'document') activeFrom = null // mode, positions it + holds the sink otherwise
}

// Force the machine back to the document (hide the box, drop the binding) — used when leaving via a route the
// machine doesn't own, e.g. the "Edit source" menu action selecting the table's range in CodeMirror.
function leaveGrid(view: EditorView) {
	if (activeFrom == null) return
	const ctx = ctxFor(view, activeFrom)
	if (ctx) hideBox(ctx)
	gridState = { mode: 'document' }
	activeFrom = null
}

// ---------- Interaction: cell wiring ----------

// A cell shows rendered inline markdown and is inert until the machine puts it into edit mode. Click selects,
// double-click edits; while editing, Enter/Tab/Escape are routed to the machine and arrows/typing are native.
function gridCell(content: HTMLElement, raw: string, cell: Cell, view: EditorView, from: number) {
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
		if (event.buttons === 1 && activeFrom === from && gridState.mode === 'selected')
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
		}
	})
	content.addEventListener('blur', () => {
		if (content.contentEditable !== 'true') return
		requestAnimationFrame(() => leaveIfOutside(view, from))
	})
}

// If focus has left this table entirely (not just moved sink↔cell), tell the machine to exit + commit.
function leaveIfOutside(view: EditorView, from: number) {
	if (activeFrom !== from || gridState.mode === 'document') return
	const active = document.activeElement
	if (
		active instanceof HTMLElement &&
		(active === ctxFor(view, from)?.sink || active.closest(`.md-table[data-from="${from}"]`))
	)
		return
	dispatch(view, from, { t: 'exit' })
}

// The hidden per-table sink holds keyboard focus while a range is selected (so typing, nav, and paste have a
// target). It also captures clipboard events. Selected-mode key handling lives here; editing lives on cells.
function makeSink(view: EditorView, from: number) {
	const sink = document.createElement('textarea')
	sink.className = 'md-grid-sink'
	sink.setAttribute('aria-hidden', 'true')
	sink.tabIndex = -1
	const move = (dir: 'up' | 'down' | 'left' | 'right', shift: boolean) =>
		dispatch(view, from, { t: 'move', dir, shift })
	sink.addEventListener('keydown', (event) => {
		const key = event.key
		const chord = event.metaKey || event.ctrlKey
		const lower = key.toLowerCase()
		if (chord && lower === 'a') {
			event.preventDefault()
			return dispatch(view, from, { t: 'selectAll' })
		}
		if (chord && (lower === 'c' || lower === 'x')) {
			event.preventDefault()
			return dispatch(view, from, { t: lower === 'x' ? 'cut' : 'copy' })
		}
		if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
			event.preventDefault()
			move(key.slice(5).toLowerCase() as 'up' | 'down' | 'left' | 'right', event.shiftKey)
		} else if (key === 'Enter') {
			event.preventDefault()
			dispatch(view, from, { t: 'commitMove', dir: event.shiftKey ? 'up' : 'down' })
		} else if (key === 'Tab') {
			event.preventDefault()
			dispatch(view, from, { t: 'commitMove', dir: event.shiftKey ? 'left' : 'right' })
		} else if (key === 'Escape') {
			event.preventDefault()
			dispatch(view, from, { t: 'escape' })
		} else if (key === 'F2') {
			event.preventDefault()
			dispatch(view, from, { t: 'beginEdit', seed: null })
		} else if (key === 'Backspace' || key === 'Delete') {
			event.preventDefault()
			dispatch(view, from, { t: 'clear' })
		} else if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
			event.preventDefault()
			dispatch(view, from, { t: 'beginEdit', seed: key })
		}
	})
	sink.addEventListener('blur', () => requestAnimationFrame(() => leaveIfOutside(view, from)))
	return sink
}

// Paste is owned at the document capture phase whenever a grid sink holds focus, ahead of CodeMirror's own
// paste handler (which would target the atomic editor selection). Copy/cut go through the sink's keydown
// instead — an empty sink textarea doesn't reliably emit a `copy` event.
const gridSinkFocused = () =>
	activeView != null &&
	activeFrom != null &&
	document.activeElement instanceof HTMLElement &&
	document.activeElement.classList.contains('md-grid-sink')

if (typeof document !== 'undefined')
	document.addEventListener(
		'paste',
		(event) => {
			const view = activeView
			const from = activeFrom
			if (!view || from == null || !gridSinkFocused()) return
			event.preventDefault()
			event.stopImmediatePropagation()
			pendingPaste = event.clipboardData?.getData('text/plain') ?? ''
			dispatch(view, from, { t: 'paste' })
		},
		true,
	)

// A full-edge "+" bar (Obsidian-style): add a column on the right, or a row below.
function edgeAdd(kind: 'col' | 'row', title: string, onClick: () => void) {
	const bar = document.createElement('button')
	bar.type = 'button'
	bar.className = `md-table-add md-table-add-${kind} codicon codicon-add`
	bar.title = title
	bar.addEventListener('mousedown', (event) => event.stopPropagation())
	bar.addEventListener('click', (event) => {
		event.stopPropagation()
		onClick()
	})
	return bar
}

// ---------- Widget ----------

const tableWidget = defineWidget<TableModel>({
	eq: (a, b) =>
		a.from === b.from &&
		a.to === b.to &&
		JSON.stringify([a.headers, a.aligns, a.rows]) === JSON.stringify([b.headers, b.aligns, b.rows]),
	// Every event inside the table (cells, handles, borders) is handled by our own DOM — CM never sees it, so a
	// plain click can't move the cursor into the range and flip it to source. Raw editing is opt-in ("Edit source").
	ignoreEvent: (event) =>
		!!(event.target as HTMLElement)?.closest?.(
			'.md-table, .md-table-add, .md-table-corner, .md-table-menu, .md-grid-sink, .md-grid-selbox',
		),
	toDOM: (model, view) => {
		const wrap = document.createElement('div')
		wrap.className = 'md-table-wrap'

		const frame = document.createElement('div')
		frame.className = 'md-table-frame'
		wrap.append(frame)

		// The table scrolls horizontally inside its own box so wide tables stay contained, while the add "+"
		// bars sit just *outside* the frame (absolute) — that keeps the widget's resting height equal to the
		// table's, so the document's blank line lands right below it instead of below an unreachable bar band.
		const scroll = document.createElement('div')
		scroll.className = 'md-table-scroll'
		frame.append(scroll)

		const table = document.createElement('table')
		table.className = 'md-table'
		table.dataset.from = String(model.from) // lets the interaction runner find this table's fresh DOM
		modelOf.set(table, model)
		scroll.append(table)

		const indicator = document.createElement('div')
		indicator.className = 'md-drop-indicator'
		frame.append(indicator)

		const selBox = document.createElement('div')
		selBox.className = 'md-grid-selbox'
		frame.append(selBox, makeSink(view, model.from))

		const showIndicator = (vertical: boolean, offset: number) => {
			const frameRect = frame.getBoundingClientRect()
			indicator.style.opacity = '1'
			if (vertical) {
				indicator.style.cssText = `opacity:1;top:0;height:${table.offsetHeight}px;width:2px;left:${offset - frameRect.left}px`
			} else {
				indicator.style.cssText = `opacity:1;left:0;width:${table.offsetWidth}px;height:2px;top:${offset - frameRect.top}px`
			}
		}
		const hideIndicator = () => {
			indicator.style.cssText = ''
		}

		const headerRow = table.createTHead().insertRow()
		model.headers.forEach((header, col) => {
			const th = document.createElement('th')
			if (model.aligns[col]) th.style.textAlign = model.aligns[col] ?? ''

			const handle = document.createElement('div')
			handle.className = 'md-col-handle'
			handle.title = 'Drag to move · click for options'
			let dropIndex = col
			attachHandle(
				handle,
				() => columnMenu(view, handle, model, col),
				(event) => {
					const cells = [...table.querySelectorAll('thead th')].map((cell) => {
						const rect = cell.getBoundingClientRect()
						return { start: rect.left, end: rect.right }
					})
					dropIndex = dropIndexAt(cells, event.clientX)
					const edge = dropIndex < cells.length ? cells[dropIndex]?.start : cells.at(-1)?.end
					if (edge != null) showIndicator(true, edge)
				},
				() => {
					hideIndicator()
					if (dropIndex !== col && dropIndex !== col + 1) rewrite(view, model, moveColumn(model, col, dropIndex))
				},
			)
			th.append(handle)

			const content = document.createElement('span')
			gridCell(content, header, { row: -1, col }, view, model.from)
			th.append(content)
			th.addEventListener('contextmenu', (event) => {
				event.preventDefault()
				dispatch(view, model.from, { t: 'click', cell: { row: -1, col }, shift: false })
				cellMenu(view, { x: event.clientX, y: event.clientY }, model, -1, col)
			})
			headerRow.append(th)
		})

		const tbody = table.createTBody()
		model.rows.forEach((row, rowIndex) => {
			const tr = tbody.insertRow()
			model.headers.forEach((_, col) => {
				const td = tr.insertCell()
				if (model.aligns[col]) td.style.textAlign = model.aligns[col] ?? ''
				if (col === 0) {
					const handle = document.createElement('div')
					handle.className = 'md-row-handle'
					handle.title = 'Drag to move · click for options'
					let dropIndex = rowIndex
					attachHandle(
						handle,
						() => rowMenu(view, handle, model, rowIndex),
						(event) => {
							const cells = [...table.querySelectorAll('tbody tr')].map((cell) => {
								const rect = cell.getBoundingClientRect()
								return { start: rect.top, end: rect.bottom }
							})
							dropIndex = dropIndexAt(cells, event.clientY)
							const edge = dropIndex < cells.length ? cells[dropIndex]?.start : cells.at(-1)?.end
							if (edge != null) showIndicator(false, edge)
						},
						() => {
							hideIndicator()
							if (dropIndex !== rowIndex && dropIndex !== rowIndex + 1)
								rewrite(view, model, moveRow(model, rowIndex, dropIndex))
						},
					)
					td.append(handle)
				}
				const content = document.createElement('span')
				gridCell(content, row[col] ?? '', { row: rowIndex, col }, view, model.from)
				td.append(content)
				td.addEventListener('contextmenu', (event) => {
					event.preventDefault()
					dispatch(view, model.from, { t: 'click', cell: { row: rowIndex, col }, shift: false })
					cellMenu(view, { x: event.clientX, y: event.clientY }, model, rowIndex, col)
				})
			})
		})

		frame.append(
			edgeAdd('col', 'Add column to the right', () => rewrite(view, model, insertColumn(model, model.headers.length))),
			edgeAdd('row', 'Add row below', () => rewrite(view, model, insertRow(model, model.rows.length))),
		)

		const corner = document.createElement('button')
		corner.type = 'button'
		corner.className = 'md-table-corner codicon codicon-trash'
		corner.title = 'Delete table'
		corner.addEventListener('mousedown', (event) => event.stopPropagation())
		corner.addEventListener('click', (event) => {
			event.stopPropagation()
			deleteTable(view, model)
		})
		frame.append(corner)

		// If the interaction machine is mid-session on this table, re-apply its visual to the fresh DOM.
		if (activeFrom === model.from && gridState.mode !== 'document')
			requestAnimationFrame(() => applyVisual(ctxFor(view, model.from)))

		return wrap
	},
})

// ---------- Builder ----------

function buildTableDecorations(state: EditorState): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const doc = state.doc

	let lineNum = 1
	while (lineNum <= doc.lines) {
		const line = doc.line(lineNum)
		if (!line.text.includes('|') || lineNum + 1 > doc.lines) {
			lineNum++
			continue
		}
		if (!isSeparatorRow(doc.line(lineNum + 1).text)) {
			lineNum++
			continue
		}

		const headers = parseRow(line.text)
		const aligns = parseAligns(doc.line(lineNum + 1).text, headers.length)
		const rows: string[][] = []
		let endLineNum = lineNum + 1
		for (let dataLine = lineNum + 2; dataLine <= doc.lines; dataLine++) {
			const rowLine = doc.line(dataLine)
			if (!rowLine.text.includes('|')) break
			rows.push(parseRow(rowLine.text))
			endLineNum = dataLine
		}

		const from = line.from
		const to = doc.line(endLineNum).to
		const model: TableModel = { headers, aligns, rows, from, to }

		// Reveal the raw source when a ranged selection touches the table (drag-select or "Edit source"), and stay
		// revealed while a caret lingers in its lines (sticky) so editing the source doesn't collapse it. A grid
		// session never reveals — its parked caret would otherwise touch the range.
		const gridActive = activeFrom === from && gridState.mode !== 'document'
		const reveal =
			!gridActive &&
			(selectionRangeTouches(state, from, to) || (revealedFrom === from && selectionTouches(state, from, to)))
		if (reveal) revealedFrom = from
		else if (revealedFrom === from) revealedFrom = null

		if (!reveal) {
			// block: true tells CM this replaces whole lines — fixes the over-tall caret on the line above it.
			builder.add(from, to, Decoration.replace({ widget: tableWidget(model), block: true }))
		} else {
			// Reveal just the raw markdown, styled as a monospace box, so what's highlighted is what copies.
			for (let sourceLine = lineNum; sourceLine <= endLineNum; sourceLine++) {
				const lineClass =
					sourceLine === lineNum
						? 'md-table-src md-table-src-top'
						: sourceLine === endLineNum
							? 'md-table-src md-table-src-bottom'
							: 'md-table-src'
				builder.add(
					doc.line(sourceLine).from,
					doc.line(sourceLine).from,
					Decoration.line({ attributes: { class: lineClass } }),
				)
			}
		}

		lineNum = endLineNum + 1
	}

	return builder.finish()
}

const tablesField = StateField.define<DecorationSet>({
	create: (state) => buildTableDecorations(state),
	update: (deco, transaction) => (docOrSelectionChanged(transaction) ? buildTableDecorations(transaction.state) : deco),
	provide: (field) => EditorView.decorations.from(field),
})

// The [from, to] range of each *rendered* (atomic) table. Revealed tables carry only zero-width line
// decorations (from === to), so filtering to from < to leaves just the block-replaced tables.
function tableEdges(state: EditorState) {
	const edges: { from: number; to: number }[] = []
	for (const iter = state.field(tablesField).iter(); iter.value; iter.next())
		if (iter.to > iter.from) edges.push({ from: iter.from, to: iter.to })
	return edges
}

// A document-caret arrow key that would cross into an adjacent table instead enters its grid (select mode).
// ↓ / → from the line above enter at the top; ↑ / ← from the line below enter at the bottom. Everything after
// that (cell nav, edit, exit) is the machine's job — this is only the document→grid handoff.
function enterFromDoc(view: EditorView, key: 'up' | 'down' | 'left' | 'right') {
	const active = document.activeElement
	if (active instanceof HTMLElement && active.closest('.md-table-frame')) return false // already inside a grid
	const caret = view.state.selection.main
	if (!caret.empty) return false
	const line = view.state.doc.lineAt(caret.head)
	const edges = tableEdges(view.state)
	if (key === 'down' || (key === 'right' && caret.head === line.to)) {
		// ↓ / → into the top of the table → top-left cell.
		const table = edges.find((edge) => view.state.doc.lineAt(edge.from).number === line.number + 1)
		if (table) {
			dispatch(view, table.from, { t: 'enter', corner: 'top-left' })
			return true
		}
	}
	if (key === 'up' || (key === 'left' && caret.head === line.from)) {
		// ↑ enters the bottom-left; ← wraps into the bottom-right (last) cell, like leftward text motion.
		const table = edges.find((edge) => view.state.doc.lineAt(edge.to).number === line.number - 1)
		if (table) {
			dispatch(view, table.from, { t: 'enter', corner: key === 'left' ? 'bottom-right' : 'bottom-left' })
			return true
		}
	}
	return false
}

// Each rendered table is one atomic range (the caret can't wander into the replaced widget). The keymap turns
// an arrow that would cross a table edge into a grid entry; from there the interaction machine takes over.
export const tablesPlugin = [
	tablesField,
	EditorView.atomicRanges.of((view) => view.state.field(tablesField)),
	Prec.high(
		keymap.of([
			{ key: 'ArrowDown', run: (view) => enterFromDoc(view, 'down') },
			{ key: 'ArrowUp', run: (view) => enterFromDoc(view, 'up') },
			{ key: 'ArrowRight', run: (view) => enterFromDoc(view, 'right') },
			{ key: 'ArrowLeft', run: (view) => enterFromDoc(view, 'left') },
		]),
	),
]

// Harness-only: expose the interaction state so the headless driver can assert grid transitions.
if (typeof window !== 'undefined' && (window as unknown as { HARNESS_CONTENT?: string }).HARNESS_CONTENT !== undefined)
	(window as unknown as { __gridState?: () => unknown }).__gridState = () => ({ ...gridState, from: activeFrom })
