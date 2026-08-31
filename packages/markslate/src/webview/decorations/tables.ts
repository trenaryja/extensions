import { Annotation, Prec, RangeSetBuilder, StateField } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import { Decoration, EditorView, keymap } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { defineWidget } from '../lib/widget'
import { formatterProfile } from './tableFormat'
import { docOrSelectionChanged, rawSourceRanges, selectionRangeTouches, selectionTouches } from './active'
import type { SourceRange } from './active'
import { normalizeRange, reduce } from './tableMachine'
import type { Cell, Effect, GridEvent, GridState } from './tableMachine'

type Align = 'left' | 'center' | 'right' | null

type Axis = 'col' | 'row'

type TableModel = { headers: string[]; aligns: Align[]; rows: string[][]; from: number; to: number }

const isSeparatorRow = (text: string) => /^[-\s:|][-\s:]*\|[-\s:|]*$/.test(text) && text.includes('-')

// Split a `| a | b |` row into cells, honoring GFM's `\|` escape (a literal pipe inside a cell). Each cell is
// trimmed and unescaped, so the model holds a literal `|`; `serialize` re-escapes it on the way out.
export function parseRow(text: string) {
	const inner = text.replace(/^\s*\|/, '').replace(/\|\s*$/, '')
	const cells: string[] = []
	let cell = ''

	for (let i = 0; i < inner.length; i++) {
		const ch = inner[i]
		if (ch === '\\' && i + 1 < inner.length) {
			cell += ch + inner[i + 1]
			i++
		} else if (ch === '|') {
			cells.push(cell)
			cell = ''
		} else cell += ch
	}

	cells.push(cell)
	return cells.map((c) => c.trim().replace(/\\\|/g, '|'))
}

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

const inlineMatchEl = (match: RegExpExecArray) => {
	if (match[1] != null) return inlineEl('code', match[1], 'md-code-inline')
	if (match[2] != null || match[3] != null) return inlineEl('strong', match[2] ?? match[3] ?? '')
	if (match[4] != null || match[5] != null) return inlineEl('em', match[4] ?? match[5] ?? '')
	if (match[6] != null) return inlineEl('del', match[6])
	if (match[7] == null) return null
	const link = inlineEl('a', match[7], 'md-link-text')
	link.title = `⌘/Ctrl-click to open · ${match[8]}`
	return link
}

function appendInline(parent: HTMLElement, text: string) {
	INLINE_RE.lastIndex = 0
	let last = 0

	for (let match = INLINE_RE.exec(text); match; match = INLINE_RE.exec(text)) {
		if (match.index > last) parent.append(text.slice(last, match.index))
		const el = inlineMatchEl(match)
		if (el) parent.append(el)
		last = INLINE_RE.lastIndex
	}

	if (last < text.length) parent.append(text.slice(last))
}

// ---------- Serialization ----------
// Minimal, valid GFM: single-space cells, one-char alignment markers, `\|`-escaped pipes. Column display width is
// deliberately NOT computed here — the debounced prettier pass (or the user's own formatter) owns alignment, so we
// never hand-maintain Unicode display-width parity with prettier. `serialize` is the instant, transient write.

const escapeCell = (cell: string) => cell.replace(/\|/g, '\\|')
const minMarker = (align: Align) =>
	align === 'center' ? ':-:' : align === 'right' ? '-:' : align === 'left' ? ':-' : '-'

export function serialize({ headers, aligns, rows }: TableModel) {
	const line = (cells: string[]) => `| ${headers.map((_, i) => escapeCell(cells[i] ?? '')).join(' | ')} |`
	const separator = `| ${headers.map((_, i) => minMarker(aligns[i] ?? null)).join(' | ')} |`
	return [line(headers), separator, ...rows.map(line)].join('\n')
}

// Parse a table's markdown text into a model, or null if it isn't a table. Inverse of `serialize`; used by the
// finalizer's guard and exercised directly by the round-trip tests.
export function parseTable(text: string, from = 0, to = 0): TableModel | null {
	const lines = text.split('\n')
	if (lines.length < 2 || !isSeparatorRow(lines[1] ?? '')) return null
	const headers = parseRow(lines[0] ?? '')
	const aligns = parseAligns(lines[1] ?? '', headers.length)
	const rows = lines
		.slice(2)
		.filter((line) => line.includes('|'))
		.map(parseRow)
	return { headers, aligns, rows, from, to }
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

// Write `value` at `col`, padding a ragged row with empty cells so `col` is addressable. GFM lets a row hold
// fewer cells than the header, yet the grid renders (and lets you edit) the full width — without the pad, an
// edit to one of those phantom cells would map over a too-short row, no-op, and serialize away silently.
const withCell = (row: string[], col: number, value: string) => {
	const next = col < row.length ? [...row] : [...row, ...Array<string>(col - row.length + 1).fill('')]
	next[col] = value
	return next
}

const setCell = (model: TableModel, { row, col }: Cell, value: string): TableModel =>
	row < 0
		? { ...model, headers: replaceAt(model.headers, col, value) }
		: { ...model, rows: replaceAt(model.rows, row, withCell(model.rows[row] ?? [], col, value)) }

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

// Every menu action rewrites one table, so they all need the same two things the interaction runner's Ctx carries.
type MenuCtx = Pick<Ctx, 'view' | 'model'>

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

let revealedFrom: number | null = null // the table currently in raw-source mode (sticky while its caret stays)

// Reveal the raw markdown by selecting the table's range — a non-empty selection flips it into source mode.
const revealSource = (view: EditorView, model: TableModel) => {
	leaveGrid(view) // drop any grid selection first so its overlay doesn't linger over the revealed source
	revealedFrom = model.from // stick in source mode while the caret stays in the table's lines
	view.dispatch({ selection: { anchor: model.from, head: model.to } })
	view.focus()
}

const columnMenu = ({ view, model }: MenuCtx, anchor: HTMLElement, col: number) =>
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

const rowMenu = ({ view, model }: MenuCtx, anchor: HTMLElement, rowIndex: number) =>
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

// The full right-click menu for a cell: row + column + alignment + table actions.
function cellMenu({ view, model }: MenuCtx, at: { x: number; y: number }, { row, col }: Cell) {
	const deleteRowItem: MenuItem[] =
		row >= 0
			? [
					{
						label: 'Delete row',
						icon: 'trash',
						danger: true,
						onClick: () => rewrite(view, model, deleteRow(model, row)),
					},
				]
			: []
	openMenu(view, at, [
		{
			label: 'Insert row above',
			icon: 'arrow-up',
			onClick: () => rewrite(view, model, insertRow(model, Math.max(0, row))),
		},
		{
			label: 'Insert row below',
			icon: 'arrow-down',
			onClick: () => rewrite(view, model, insertRow(model, row + 1)),
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

type DragItem = { cells: HTMLElement[]; start: number; size: number }

// Every column (header cell + its data cells) or every data row, with its position along the drag axis.
// Captured at drag start — a drag makes no document edit until the drop, so the widget DOM is frozen and we
// can animate it freely with transforms.
function collectDragItems(table: HTMLElement, axis: Axis): DragItem[] {
	const rows = [...table.querySelectorAll('tbody tr')] as HTMLElement[]
	if (axis === 'row')
		return rows.map((tr) => {
			const rect = tr.getBoundingClientRect()
			return { cells: [tr], start: rect.top, size: rect.height }
		})
	const headers = [...table.querySelectorAll('thead th')] as HTMLElement[]
	return headers.map((th, col) => {
		const cells = [th, ...rows.map((tr) => tr.children[col])].filter(Boolean) as HTMLElement[]
		const rect = th.getBoundingClientRect()
		return { cells, start: rect.left, size: rect.width }
	})
}

// Each item's target start after moving `from` before `to`, laid out edge-to-edge from the first item's start.
function targetStarts(items: Pick<DragItem, 'start' | 'size'>[], from: number, to: number) {
	const order = moveAt([...items.keys()], from, to)
	const result = new Array<number>(items.length)
	let cursor = items[0]?.start ?? 0

	for (const index of order) {
		result[index] = cursor
		cursor += items[index]?.size ?? 0
	}

	return result
}

type CellMotion = { axis: Axis; motion: 'instant' | 'animated' }

const offsetCells = (cells: HTMLElement[], offset: number, { axis, motion }: CellMotion) => {
	for (const cell of cells) {
		cell.style.transition = motion === 'animated' ? 'transform 0.16s ease' : 'none'
		cell.style.transform = offset ? (axis === 'col' ? `translateX(${offset}px)` : `translateY(${offset}px)`) : ''
	}
}

type ReorderContext = {
	handle: HTMLElement
	axis: Axis
	index: number
	frame: HTMLElement
	table: HTMLElement
	onClick: () => void
	commit: (to: number) => void
}

// A grip either reorders its column/row or opens its menu. Dragging lifts the grabbed item to follow the
// pointer, slides the others aside to open a gap where it will land, and settles it into the gap on release —
// then commits the markdown rewrite (whose rebuilt DOM matches the settled layout, so there's no flash).
function attachReorder({ handle, axis, index, frame, table, onClick, commit }: ReorderContext) {
	handle.addEventListener('pointerdown', (down) => {
		down.preventDefault()
		down.stopPropagation()
		handle.setPointerCapture(down.pointerId)
		const axisPos = (event: PointerEvent) => (axis === 'col' ? event.clientX : event.clientY)
		const origin = axisPos(down)
		let dragging = false
		let items: DragItem[] = []
		let drop = index

		const move = (event: PointerEvent) => {
			if (!dragging) {
				if (Math.abs(event.clientX - down.clientX) + Math.abs(event.clientY - down.clientY) < 4) return
				dragging = true
				items = collectDragItems(table, axis)
				frame.classList.add(`md-dragging-${axis}`)
				for (const cell of items[index]?.cells ?? []) cell.classList.add('md-drag-lift')
			}

			// grabbed item tracks the pointer
			offsetCells(items[index]?.cells ?? [], axisPos(event) - origin, { axis, motion: 'instant' })
			drop = dropIndexAt(
				items.map((item) => ({ start: item.start, end: item.start + item.size })),
				axisPos(event),
			)
			const targets = targetStarts(items, index, drop)
			items.forEach((item, i) => {
				if (i !== index) offsetCells(item.cells, (targets[i] ?? item.start) - item.start, { axis, motion: 'animated' })
			})
		}

		const finishListeners = () => {
			handle.removeEventListener('pointermove', move)
			// eslint-disable-next-line @typescript-eslint/no-use-before-define -- mutual teardown: up/cancel call finishListeners, which must unbind them
			handle.removeEventListener('pointerup', up)
			// eslint-disable-next-line @typescript-eslint/no-use-before-define -- mutual teardown: up/cancel call finishListeners, which must unbind them
			handle.removeEventListener('pointercancel', cancel)
			if (handle.hasPointerCapture(down.pointerId)) handle.releasePointerCapture(down.pointerId)
		}

		const clearDrag = () => {
			frame.classList.remove(`md-dragging-${axis}`)

			for (const item of items)
				for (const cell of item.cells) {
					cell.style.transform = ''
					cell.style.transition = ''
					cell.classList.remove('md-drag-lift')
				}
		}

		// A drag can end without a pointerup — a touch/gesture interruption or the browser stealing the capture.
		// Reset so the widget isn't stranded in drag-visual state with the move/up listeners still attached.
		const cancel = () => {
			finishListeners()
			if (dragging) clearDrag()
		}

		const up = () => {
			finishListeners()
			if (!dragging) return onClick()
			const targets = targetStarts(items, index, drop)
			// settle into the gap
			offsetCells(items[index]?.cells ?? [], (targets[index] ?? 0) - (items[index]?.start ?? 0), {
				axis,
				motion: 'animated',
			})
			const moved = drop !== index && drop !== index + 1
			setTimeout(() => {
				if (moved) return commit(drop) // rewrite: the rebuilt DOM already matches the settled layout
				clearDrag()
			}, 170)
		}

		handle.addEventListener('pointermove', move)
		handle.addEventListener('pointerup', up)
		handle.addEventListener('pointercancel', cancel)
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

const placeCaret = (el: HTMLElement, toStart: boolean) => {
	const range = document.createRange()
	range.selectNodeContents(el)
	range.collapse(toStart)
	const selection = window.getSelection()
	selection?.removeAllRanges()
	selection?.addRange(range)
}

const placeCaretEnd = (el: HTMLElement) => placeCaret(el, false)
const placeCaretStart = (el: HTMLElement) => placeCaret(el, true)

// Is the caret at the very start / end of this editing cell? Range-based, so it holds regardless of whether the
// browser anchored the caret in the text node or on the element (e.g. right after we collapse it to the end).
const caretAtEdge = (el: HTMLElement, atStart: boolean) => {
	const selection = window.getSelection()
	if (!selection?.isCollapsed || !selection.anchorNode || !el.contains(selection.anchorNode)) return false
	const range = document.createRange()
	range.selectNodeContents(el)
	if (atStart) range.setEnd(selection.anchorNode, selection.anchorOffset)
	else range.setStart(selection.anchorNode, selection.anchorOffset)
	return range.toString().length === 0 // nothing between the caret and that edge
}

const caretAtStart = (el: HTMLElement) => caretAtEdge(el, true)
const caretAtEnd = (el: HTMLElement) => caretAtEdge(el, false)

const hideBox = (ctx: Ctx) => {
	ctx.box.style.display = 'none'
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

// Set every cell in the range to empty in one transaction.
function clearRange(ctx: Ctx, anchor: Cell, focus: Cell) {
	const r = normalizeRange(anchor, focus)
	let next = ctx.model
	for (let row = r.top; row <= r.bottom; row++)
		for (let col = r.left; col <= r.right; col++) next = setCell(next, { row, col }, '')
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

function copyRange(ctx: Ctx, { anchor, focus, cut }: Extract<Effect, { e: 'copyRange' }>) {
	writeClipboard(gridToMarkdown(sliceRange(ctx.model, anchor, focus)))
	if (cut) clearRange(ctx, anchor, focus)
}

// Drop a parsed grid at `cell` (top-left), growing the table with empty rows/cols where the block overflows.
function pasteRange(ctx: Ctx, cell: Cell) {
	const grid = parseClipboardGrid(pendingPaste)
	pendingPaste = ''
	if (!grid.length) return
	let { model } = ctx
	const needCols = cell.col + Math.max(...grid.map((line) => line.length))
	while (model.headers.length < needCols) model = insertColumn(model, model.headers.length)
	const needRows = cell.row + grid.length
	while (model.rows.length < needRows) model = insertRow(model, model.rows.length)
	grid.forEach((line, dr) => {
		line.forEach((value, dc) => {
			model = setCell(model, { row: cell.row + dr, col: cell.col + dc }, value.replace(/[\r\n]+/g, ' ').trim())
		})
	})
	rewrite(ctx.view, ctx.model, model)
}

// eslint-disable-next-line complexity -- one arm per Effect variant; the branching belongs to the machine, not the runner
function runEffect(effect: Effect, ctx: Ctx) {
	switch (effect.e) {
		case 'focusCell': {
			// A preceding `commit` in the same event may have rebuilt the widget → resolve against the fresh DOM.
			const el = cellContentEl(ctxFor(ctx.view, ctx.from)?.table ?? ctx.table, effect.cell)
			if (!el) return
			el.contentEditable = 'true'
			el.textContent = effect.seed ?? el.dataset.raw ?? ''
			el.focus({ preventScroll: true })
			if (effect.caret === 'start') placeCaretStart(el)
			else placeCaretEnd(el)
			return
		}
		case 'commit': {
			const el = cellContentEl(ctx.table, effect.cell)
			if (!el) return
			el.contentEditable = 'false'
			const raw = el.dataset.raw ?? ''
			const next = (el.textContent ?? '').replace(/[\r\n]+/g, ' ').trim()

			if (next !== raw) rewrite(ctx.view, ctx.model, setCell(ctx.model, effect.cell, next))
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
			const model = ctxFor(ctx.view, ctx.from)?.model ?? ctx.model // fresh: a preceding commit may have resized it
			const anchor =
				effect.side === 'bottom' ? Math.min(model.to + 1, ctx.view.state.doc.length) : Math.max(model.from - 1, 0)
			ctx.view.dispatch({ selection: { anchor }, scrollIntoView: true })
			ctx.view.focus()
			return
		}
		case 'clearRange':
			return clearRange(ctx, effect.anchor, effect.focus)
		case 'copyRange':
			return copyRange(ctx, effect)
		case 'pasteAt':
			return void pasteRange(ctx, effect.cell)
		// Derived from gridState by applyVisual instead — nothing to run here.
		case 'focusSink':
		case 'showSelection':
		case 'hideSelection':
			break
	}
}

// Re-derive the visual (selection box + which element holds focus) from the current state and DOM. Only the
// *active* table drives focus: every rebuilt widget schedules a deferred applyVisual, so without this guard a
// non-active table rebuilding while another is selected would steal the sink focus back to itself.
function applyVisual(ctx: Ctx | null) {
	if (!ctx) return
	if (gridState.mode === 'selected' && ctx.from === activeFrom) {
		positionBox(ctx, gridState.anchor, gridState.focus)
		if (document.activeElement !== ctx.sink) ctx.sink.focus({ preventScroll: true })
	} else hideBox(ctx)
}

const dimsOf = (model: TableModel) => ({ rows: model.rows.length, cols: model.headers.length })

// Switching tables (click/enter into a different one) — commit any in-progress edit on the previous grid
// before leaving it (else the uncommitted text is silently lost), then tidy it up. Returns `from` remapped
// past whatever reflow that commit caused.
function leavePreviousGrid(view: EditorView, from: number) {
	if (activeFrom === null || activeFrom === from) return from
	const previous = ctxFor(view, activeFrom)
	let target = from

	if (previous) {
		const lengthBefore = view.state.doc.length
		for (const effect of reduce(gridState, { t: 'exit' }, dimsOf(previous.model)).effects) runEffect(effect, previous)
		// A commit that reflowed the previous table shifts every position after it — including our target
		// `from` when the clicked table sits below the one we just left.
		if (activeFrom < target) target += view.state.doc.length - lengthBefore
		const settled = ctxFor(view, activeFrom)
		if (settled) hideBox(settled)
	}

	gridState = { mode: 'document' }
	return target
}

// Send an event to the machine for table `from`, run its effects, then re-apply the visual to the fresh DOM.
function dispatch(view: EditorView, initialFrom: number, event: GridEvent) {
	const from = event.t === 'click' || event.t === 'enter' ? leavePreviousGrid(view, initialFrom) : initialFrom
	const ctx = ctxFor(view, from)
	if (!ctx) return
	const enteringGrid = gridState.mode === 'document'
	activeFrom = from
	activeView = view
	const dims = dimsOf(ctx.model)
	const { next, effects } = reduce(gridState, event, dims)
	gridState = next

	// On first entry, anchor CM's caret to the table so undo/redo return here instead of the document top.
	// (A selection-only change keeps the widget's model equal, so ctx stays valid — no rebuild.)
	if (enteringGrid && next.mode !== 'document') {
		const { head } = view.state.selection.main
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
// double-click edits; while editing, Enter/Tab/Escape and edge arrows route to the machine, mid-text arrows and
// typing are native (the caret only spills to a neighbour once it reaches the cell's start/end).
type GridCellContext = { content: HTMLElement; raw: string; cell: Cell; view: EditorView; from: number }

function gridCell({ content, raw, cell, view, from }: GridCellContext) {
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
function makeSink(view: EditorView, from: number) {
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
function edgeAdd(kind: Axis, title: string, onClick: () => void) {
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

		const selBox = document.createElement('div')
		selBox.className = 'md-grid-selbox'
		frame.append(selBox, makeSink(view, model.from))

		const headerRow = table.createTHead().insertRow()
		model.headers.forEach((header, col) => {
			const th = document.createElement('th')
			if (model.aligns[col]) th.style.textAlign = model.aligns[col] ?? ''

			const handle = document.createElement('div')
			handle.className = 'md-col-handle'
			handle.title = 'Drag to move · click for options'
			attachReorder({
				handle,
				axis: 'col',
				index: col,
				frame,
				table,
				onClick: () => columnMenu({ view, model }, handle, col),
				commit: (to) => rewrite(view, model, moveColumn(model, col, to)),
			})
			th.append(handle)

			const cell = { row: -1, col }
			const content = document.createElement('span')
			gridCell({ content, raw: header, cell, view, from: model.from })
			th.append(content)
			th.addEventListener('contextmenu', (event) => {
				event.preventDefault()
				dispatch(view, model.from, { t: 'click', cell, shift: false })
				cellMenu({ view, model }, { x: event.clientX, y: event.clientY }, cell)
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
					attachReorder({
						handle,
						axis: 'row',
						index: rowIndex,
						frame,
						table,
						onClick: () => rowMenu({ view, model }, handle, rowIndex),
						commit: (to) => rewrite(view, model, moveRow(model, rowIndex, to)),
					})
					td.append(handle)
				}

				const cell = { row: rowIndex, col }
				const content = document.createElement('span')
				gridCell({ content, raw: row[col] ?? '', cell, view, from: model.from })
				td.append(content)
				td.addEventListener('contextmenu', (event) => {
					event.preventDefault()
					dispatch(view, model.from, { t: 'click', cell, shift: false })
					cellMenu({ view, model }, { x: event.clientX, y: event.clientY }, cell)
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

type TableScan = { deco: DecorationSet; raw: SourceRange[] }

// Reveal the raw source when a ranged selection touches the table (drag-select or "Edit source"), and stay
// revealed while a caret lingers in its lines (sticky) so editing the source doesn't collapse it. A grid
// session never reveals — its parked caret would otherwise touch the range.
function updateRevealed(state: EditorState, from: number, to: number) {
	const gridActive = activeFrom === from && gridState.mode !== 'document'
	const reveal =
		!gridActive &&
		(selectionRangeTouches(state, from, to) || (revealedFrom === from && selectionTouches(state, from, to)))
	if (reveal) revealedFrom = from
	else if (revealedFrom === from) revealedFrom = null
	return reveal
}

// Reveal just the raw markdown, styled as a monospace box, so what's highlighted is what copies. The first and
// last lines round the box's corners.
function addSourceLines(
	builder: RangeSetBuilder<Decoration>,
	state: EditorState,
	lines: { first: number; last: number },
) {
	for (let lineNum = lines.first; lineNum <= lines.last; lineNum++) {
		const corner = lineNum === lines.first ? ' md-table-src-top' : lineNum === lines.last ? ' md-table-src-bottom' : ''
		const { from } = state.doc.line(lineNum)
		builder.add(from, from, Decoration.line({ attributes: { class: `md-table-src${corner}` } }))
	}
}

function buildTableDecorations(state: EditorState): TableScan {
	const builder = new RangeSetBuilder<Decoration>()
	const raw: SourceRange[] = []
	const { doc } = state

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

		const { from } = line
		const { to } = doc.line(endLineNum)
		const model: TableModel = { headers, aligns, rows, from, to }

		if (!updateRevealed(state, from, to)) {
			// block: true tells CM this replaces whole lines — fixes the over-tall caret on the line above it.
			builder.add(from, to, Decoration.replace({ widget: tableWidget(model), block: true }))
		} else {
			raw.push({ from, to }) // other plugins skip this range → the source stays byte-accurate
			addSourceLines(builder, state, { first: lineNum, last: endLineNum })
		}

		lineNum = endLineNum + 1
	}

	return { deco: builder.finish(), raw }
}

const tablesField = StateField.define<TableScan>({
	create: (state) => buildTableDecorations(state),
	update: (scan, transaction) => (docOrSelectionChanged(transaction) ? buildTableDecorations(transaction.state) : scan),
	provide: (field) => [
		EditorView.decorations.from(field, (scan) => scan.deco),
		rawSourceRanges.from(field, (scan) => scan.raw),
	],
})

// The [from, to] range of each *rendered* (atomic) table. Revealed tables carry only zero-width line
// decorations (from === to), so filtering to from < to leaves just the block-replaced tables.
function tableEdges(state: EditorState) {
	const edges: { from: number; to: number }[] = []
	for (const iter = state.field(tablesField).deco.iter(); iter.value; iter.next())
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

// ---------- Prettier finalizer ----------

// A table edit (grid commit, paste, structural op, or raw-source edit) leaves only a minimal serialization in the
// doc. A debounced pass then runs the active formatter profile (prettier) over the table's range, so the file ends
// up byte-identical to what the user's own prettier would produce — which is why `serialize` never hand-matches
// prettier's Unicode display-width alignment. Only edited tables are touched, and only once they're back to a plain
// rendered widget: a table that's still being source-edited (revealed) or is the live grid the user is in gets
// deferred until that session ends, so the async reflow never yanks the caret/focus mid-edit. Toggled by
// markslate.formatTablesOnEdit; when off, the minimal serialization stands for the user's own formatter to align.
let formatTablesOnEdit = true

// Marks the finalizer's own dispatch so the update listener doesn't re-queue it as a fresh edit (prettier is
// idempotent so it would converge anyway — this just avoids the redundant extra pass).
const formatPass = Annotation.define<boolean>()
const dirty = new Set<number>() // `from` of each edited table awaiting the prettier pass
let formatTimer: ReturnType<typeof setTimeout> | null = null

export const setFormatTablesOnEdit = (on: boolean) => {
	formatTablesOnEdit = on
	if (!on) dirty.clear()
}

const armFormat = (view: EditorView) => {
	if (formatTimer) clearTimeout(formatTimer)
	formatTimer = setTimeout(() => {
		formatTimer = null
		void flushFormat(view)
	}, 300)
}

const isTableText = (text: string) => {
	const lines = text.split('\n')
	return lines.length >= 2 && isSeparatorRow(lines[1] ?? '')
}

// Format one ready table per cycle. The resulting dispatch re-arms the listener for any others, which keeps the
// tracked `from`s correctly remapped between reflows (each reflow shifts the tables below it).
async function flushFormat(view: EditorView) {
	const revealed = new Set(view.state.field(tablesField).raw.map((range) => range.from))
	const edges = tableEdges(view.state)
	// Ready = a rendered widget the user isn't currently editing (not revealed, not the active grid).
	const from = [...dirty].find((f) => !revealed.has(f) && activeFrom !== f && edges.some((edge) => edge.from === f))
	if (from === undefined) return
	dirty.delete(from)
	const edge = edges.find((entry) => entry.from === from)
	if (!edge) return
	const text = view.state.doc.sliceString(edge.from, edge.to)
	if (!isTableText(text)) return
	let formatted: string

	try {
		formatted = await formatterProfile.formatTable(text)
	} catch {
		return
	}

	if (formatted === text) {
		if (dirty.size) armFormat(view)
		return
	}

	// The doc may have changed during the await (the user kept typing) — bail and retry if this table moved/changed.
	const fresh = tableEdges(view.state).find((entry) => entry.from === from)

	if (!fresh || view.state.doc.sliceString(fresh.from, fresh.to) !== text) {
		dirty.add(from)
		armFormat(view)
		return
	}

	view.dispatch({ changes: { from: fresh.from, to: fresh.to, insert: formatted }, annotations: formatPass.of(true) })
}

const formatOnEdit = EditorView.updateListener.of((update) => {
	if (!formatTablesOnEdit) {
		dirty.clear()
		return
	}
	if (update.docChanged && dirty.size) {
		const mapped = [...dirty].map((from) => update.changes.mapPos(from))
		dirty.clear()
		for (const from of mapped) dirty.add(from)
	}

	const isFormatPass = update.transactions.some((tr) => tr.annotation(formatPass))

	if (update.docChanged && !isFormatPass)
		for (const edge of [...tableEdges(update.state), ...update.state.field(tablesField).raw]) {
			let touched = false
			// eslint-disable-next-line max-params -- CodeMirror's iterChangedRanges dictates the callback arity
			update.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
				if (fromB <= edge.to && toB >= edge.from) touched = true
			})
			if (touched) dirty.add(edge.from)
		}
	if (dirty.size) armFormat(update.view)
})

// Each rendered table is one atomic range (the caret can't wander into the replaced widget). The keymap turns
// an arrow that would cross a table edge into a grid entry; from there the interaction machine takes over.
export const tablesPlugin = [
	tablesField,
	formatOnEdit,
	EditorView.atomicRanges.of((view) => view.state.field(tablesField).deco),
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
