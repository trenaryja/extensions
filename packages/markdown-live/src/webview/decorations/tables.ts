import { type EditorState, RangeSetBuilder, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { defineWidget } from '../lib/widget'
import { docOrSelectionChanged, selectionTouches } from './active'
import { toolButton } from './codeblocks'

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

const addRow = (model: TableModel): TableModel => ({ ...model, rows: [...model.rows, model.headers.map(() => '')] })

const addColumn = (model: TableModel): TableModel => ({
	...model,
	headers: [...model.headers, ''],
	aligns: [...model.aligns, null],
	rows: model.rows.map((row) => [...row, '']),
})

// ---------- Widget ----------

function buildTools(model: TableModel, view: EditorView) {
	const tools = document.createElement('div')
	tools.className = 'md-table-tools'
	tools.contentEditable = 'false'
	const rewrite = (next: TableModel) =>
		view.dispatch({ changes: { from: model.from, to: model.to, insert: serialize(next) } })
	tools.append(
		toolButton('＋ Row', 'Add a row', () => rewrite(addRow(model))),
		toolButton('＋ Col', 'Add a column', () => rewrite(addColumn(model))),
		toolButton('Delete', 'Delete table', () =>
			view.dispatch({ changes: { from: model.from, to: Math.min(model.to + 1, view.state.doc.length), insert: '' } }),
		),
	)
	return tools
}

const tableWidget = defineWidget<TableModel>({
	eq: (a, b) =>
		a.from === b.from &&
		a.to === b.to &&
		JSON.stringify([a.headers, a.aligns, a.rows]) === JSON.stringify([b.headers, b.aligns, b.rows]),
	// Let a mousedown through so clicking the table places the cursor and reveals the source to edit.
	ignoreEvent: (event) => event.type !== 'mousedown',
	toDOM: (model, view) => {
		const wrap = document.createElement('div')
		wrap.className = 'md-table-wrap'
		wrap.append(buildTools(model, view))

		const table = document.createElement('table')
		table.className = 'md-table'

		const headerRow = table.createTHead().insertRow()
		model.headers.forEach((header, i) => {
			const th = document.createElement('th')
			const align = model.aligns[i]
			if (align) th.style.textAlign = align
			appendInline(th, header)
			headerRow.append(th)
		})

		const tbody = table.createTBody()
		for (const row of model.rows) {
			const tr = tbody.insertRow()
			model.headers.forEach((_, i) => {
				const td = tr.insertCell()
				const align = model.aligns[i]
				if (align) td.style.textAlign = align
				appendInline(td, row[i] ?? '')
			})
		}

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
			for (let ln = lineNum; ln <= endLineNum; ln++) {
				const cls =
					ln === lineNum
						? 'md-table-src md-table-src-top'
						: ln === endLineNum
							? 'md-table-src md-table-src-bottom'
							: 'md-table-src'
				builder.add(doc.line(ln).from, doc.line(ln).from, Decoration.line({ attributes: { class: cls } }))
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
