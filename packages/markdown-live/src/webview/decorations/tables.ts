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

// ---------- Serialization (normalizes/pretty-aligns; makes add-row/add-col trivial) ----------

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

const ALIGN_CYCLE: Align[] = [null, 'left', 'center', 'right']
const cycleAlign = (model: TableModel, col: number): TableModel => ({
	...model,
	aligns: replaceAt(model.aligns, col, ALIGN_CYCLE[(ALIGN_CYCLE.indexOf(model.aligns[col] ?? null) + 1) % 4] ?? null),
})

// ---------- Widget ----------

const rewrite = (view: EditorView, model: TableModel, next: TableModel) =>
	view.dispatch({ changes: { from: model.from, to: model.to, insert: serialize(next) } })

// A small codicon control button whose events don't reach the cell or CodeMirror.
function iconButton(codicon: string, title: string, onClick: () => void) {
	const button = document.createElement('button')
	button.type = 'button'
	button.className = `md-table-btn codicon codicon-${codicon}`
	button.title = title
	button.addEventListener('mousedown', (event) => event.stopPropagation())
	button.addEventListener('click', (event) => {
		event.stopPropagation()
		onClick()
	})
	return button
}

const ALIGN_ICON: Record<'left' | 'center' | 'right', string> = {
	left: 'arrow-small-left',
	center: 'arrow-both',
	right: 'arrow-small-right',
}

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

const tableWidget = defineWidget<TableModel>({
	eq: (a, b) =>
		a.from === b.from &&
		a.to === b.to &&
		JSON.stringify([a.headers, a.aligns, a.rows]) === JSON.stringify([b.headers, b.aligns, b.rows]),
	// Route clicks: cells + controls handle themselves (return true → CM ignores them); a click on the table
	// chrome falls through to CM, which places the cursor and reveals the raw source.
	ignoreEvent: (event) =>
		!!(event.target as HTMLElement)?.closest?.(
			'.md-td-content, .md-table-btn, .md-table-tools, .md-col-controls, .md-row-controls',
		),
	toDOM: (model, view) => {
		const wrap = document.createElement('div')
		wrap.className = 'md-table-wrap'

		const tools = document.createElement('div')
		tools.className = 'md-table-tools'
		tools.contentEditable = 'false'
		tools.append(
			iconButton('add', 'Add row', () => rewrite(view, model, insertRow(model, model.rows.length))),
			iconButton('trash', 'Delete table', () =>
				view.dispatch({ changes: { from: model.from, to: Math.min(model.to + 1, view.state.doc.length), insert: '' } }),
			),
		)
		wrap.append(tools)

		const table = document.createElement('table')
		table.className = 'md-table'

		const headerRow = table.createTHead().insertRow()
		model.headers.forEach((header, col) => {
			const th = document.createElement('th')
			const align = model.aligns[col]
			if (align) th.style.textAlign = align
			const controls = document.createElement('div')
			controls.className = 'md-col-controls'
			controls.contentEditable = 'false'
			controls.append(
				iconButton(align ? ALIGN_ICON[align] : 'dash', `Align: ${align ?? 'default'}`, () =>
					rewrite(view, model, cycleAlign(model, col)),
				),
				iconButton('insert', 'Insert column right', () => rewrite(view, model, insertColumn(model, col + 1))),
				iconButton('close', 'Delete column', () => rewrite(view, model, deleteColumn(model, col))),
			)
			th.append(controls)
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
				const align = model.aligns[col]
				if (align) td.style.textAlign = align
				if (col === 0) {
					const controls = document.createElement('div')
					controls.className = 'md-row-controls'
					controls.contentEditable = 'false'
					controls.append(
						iconButton('insert', 'Insert row below', () => rewrite(view, model, insertRow(model, rowIndex + 1))),
						iconButton('close', 'Delete row', () => rewrite(view, model, deleteRow(model, rowIndex))),
					)
					td.append(controls)
				}
				const content = document.createElement('span')
				editableCell(content, row[col] ?? '', rowIndex, col, model, view)
				td.append(content)
			})
		})

		wrap.append(table)
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
