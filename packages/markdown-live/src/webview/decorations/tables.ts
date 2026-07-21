import { type EditorState, RangeSetBuilder, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { defineWidget } from '../lib/widget'
import { docOrSelectionChanged, selectionTouches } from './active'

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

function openMenu(view: EditorView, anchor: HTMLElement, items: MenuItem[]) {
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
	const rect = anchor.getBoundingClientRect()
	menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`
	menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menu.offsetHeight - 8))}px`
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

const columnMenu = (view: EditorView, anchor: HTMLElement, model: TableModel, col: number) =>
	openMenu(view, anchor, [
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
	openMenu(view, anchor, [
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

// ---------- Cells ----------

// A cell renders inline markdown; on focus it swaps to its raw source (editable), and on blur commits the
// change back to the document (which reserializes + re-renders). Enter commits; a new line is never inserted.
function editableCell(
	cell: HTMLElement,
	raw: string,
	rowIndex: number,
	col: number,
	model: TableModel,
	view: EditorView,
) {
	cell.className = 'md-td-content'
	cell.contentEditable = 'true'
	appendInline(cell, raw)
	cell.addEventListener('focusin', () => {
		if (cell.dataset.editing) return
		cell.dataset.editing = '1'
		cell.textContent = raw
		const range = document.createRange()
		range.selectNodeContents(cell)
		range.collapse(false)
		const selection = window.getSelection()
		selection?.removeAllRanges()
		selection?.addRange(range)
	})
	cell.addEventListener('keydown', (event) => {
		if (event.key === 'Enter') {
			event.preventDefault()
			cell.blur()
		}
	})
	cell.addEventListener('blur', () => {
		if (!cell.dataset.editing) return
		delete cell.dataset.editing
		const next = (cell.textContent ?? '').replace(/[\n|]/g, ' ').trim()
		if (next === raw) {
			cell.textContent = ''
			appendInline(cell, raw)
		} else rewrite(view, model, setCell(model, rowIndex, col, next))
	})
}

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
	// Route clicks: cells, handles, and add/corner buttons handle themselves (return true → CM ignores them); a
	// click on the table chrome (borders/gaps) falls through to CM, which places the cursor and reveals the source.
	ignoreEvent: (event) =>
		!!(event.target as HTMLElement)?.closest?.(
			'.md-td-content, .md-col-handle, .md-row-handle, .md-table-add, .md-table-corner, .md-table-menu',
		),
	toDOM: (model, view) => {
		const wrap = document.createElement('div')
		wrap.className = 'md-table-wrap'

		const frame = document.createElement('div')
		frame.className = 'md-table-frame'
		wrap.append(frame)

		const table = document.createElement('table')
		table.className = 'md-table'
		frame.append(table)

		const indicator = document.createElement('div')
		indicator.className = 'md-drop-indicator'
		frame.append(indicator)

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
			editableCell(content, header, -1, col, model, view)
			th.append(content)
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
				editableCell(content, row[col] ?? '', rowIndex, col, model, view)
				td.append(content)
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

		if (!selectionTouches(state, from, to)) {
			builder.add(from, to, Decoration.replace({ widget: tableWidget(model) }))
		} else {
			// Editing: reveal the source with monospace container chrome and keep the table rendered just below
			// it (live preview). Only the source lines are added on reveal, so nothing collapses — no scroll jump.
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
			builder.add(to, to, Decoration.widget({ widget: tableWidget(model), side: 1 }))
		}

		lineNum = endLineNum + 1
	}

	return builder.finish()
}

export const tablesPlugin = StateField.define<DecorationSet>({
	create(state) {
		return buildTableDecorations(state)
	},
	update(decorations, transaction) {
		if (!docOrSelectionChanged(transaction)) return decorations
		return buildTableDecorations(transaction.state)
	},
	provide(field) {
		return EditorView.decorations.from(field)
	},
})
