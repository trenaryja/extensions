import type { EditorView } from '@codemirror/view'
import type { Cell } from './tableMachine'

export type Align = 'left' | 'center' | 'right' | null

export type Axis = 'col' | 'row'

export type TableModel = { headers: string[]; aligns: Align[]; rows: string[][]; from: number; to: number }

export const isSeparatorRow = (text: string) => /^[-\s:|][-\s:]*\|[-\s:|]*$/.test(text) && text.includes('-')

// Split a `| a | b |` row into cells, honoring GFM's `\|` escape (a literal pipe inside a cell). Each cell is
// trimmed and unescaped, so the model holds a literal `|`; `serialize` re-escapes it on the way out.
export function parseRow(text: string) {
	const inner = text.replace(/^\s*\|/, '').replace(/\|\s*$/, '')
	const cells: string[] = []
	let cell = ''

	for (let i = 0; i < inner.length; i++) {
		const ch = inner.charAt(i)
		if (ch === '\\' && i + 1 < inner.length) {
			cell += ch + inner.charAt(i + 1)
			i++
		} else if (ch === '|') {
			cells.push(cell)
			cell = ''
		} else cell += ch
	}

	cells.push(cell)
	return cells.map((c) => c.trim().replaceAll(String.raw`\|`, '|'))
}

export const parseAligns = (separator: string, count: number): Align[] => {
	const cells = parseRow(separator)
	return Array.from({ length: count }, (_, i) => {
		const cell = cells[i] ?? ''
		const left = cell.startsWith(':')
		const right = cell.endsWith(':')
		return left && right ? 'center' : right ? 'right' : left ? 'left' : null
	})
}

// Minimal, valid GFM: single-space cells, one-char alignment markers, `\|`-escaped pipes. Column display width is
// deliberately NOT computed here — the debounced prettier pass (or the user's own formatter) owns alignment, so we
// never hand-maintain Unicode display-width parity with prettier. `serialize` is the instant, transient write.

export const escapeCell = (cell: string) => cell.replaceAll('|', String.raw`\|`)
export const minMarker = (align: Align) =>
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

export const replaceAt = <T>(list: T[], index: number, value: T) => list.map((item, i) => (i === index ? value : item))
export const insertAt = <T>(list: T[], index: number, value: T) => [
	...list.slice(0, index),
	value,
	...list.slice(index),
]
export const removeAt = <T>(list: T[], index: number) => list.filter((_, i) => i !== index)

// Move the item at `from` so it lands before position `to` (0..length). `to === from`/`from + 1` are no-ops.
export const moveAt = <T>(list: T[], from: number, to: number) => {
	const value = list[from]
	if (value === undefined) return list
	return insertAt(removeAt(list, from), to > from ? to - 1 : to, value)
}

// Write `value` at `col`, padding a ragged row with empty cells so `col` is addressable. GFM lets a row hold
// fewer cells than the header, yet the grid renders (and lets you edit) the full width — without the pad, an
// edit to one of those phantom cells would map over a too-short row, no-op, and serialize away silently.
const withCell = (row: string[], col: number, value: string) =>
	Array.from({ length: Math.max(row.length, col + 1) }, (_, i) => (i === col ? value : (row[i] ?? '')))

export const setCell = (model: TableModel, { row, col }: Cell, value: string): TableModel =>
	row < 0
		? { ...model, headers: replaceAt(model.headers, col, value) }
		: { ...model, rows: replaceAt(model.rows, row, withCell(model.rows[row] ?? [], col, value)) }

export const emptyRow = (model: TableModel) => model.headers.map(() => '')
export const insertRow = (model: TableModel, at: number): TableModel => ({
	...model,
	rows: insertAt(model.rows, at, emptyRow(model)),
})
export const deleteRow = (model: TableModel, at: number): TableModel => ({ ...model, rows: removeAt(model.rows, at) })
export const moveRow = (model: TableModel, from: number, to: number): TableModel => ({
	...model,
	rows: moveAt(model.rows, from, to),
})

export const insertColumn = (model: TableModel, at: number): TableModel => ({
	...model,
	headers: insertAt(model.headers, at, ''),
	aligns: insertAt(model.aligns, at, null),
	rows: model.rows.map((row) => insertAt(row, at, '')),
})
export const deleteColumn = (model: TableModel, at: number): TableModel => ({
	...model,
	headers: removeAt(model.headers, at),
	aligns: removeAt(model.aligns, at),
	rows: model.rows.map((row) => removeAt(row, at)),
})
export const moveColumn = (model: TableModel, from: number, to: number): TableModel => ({
	...model,
	headers: moveAt(model.headers, from, to),
	aligns: moveAt(model.aligns, from, to),
	rows: model.rows.map((row) => moveAt(row, from, to)),
})
export const setAlign = (model: TableModel, col: number, align: Align): TableModel => ({
	...model,
	aligns: replaceAt(model.aligns, col, align),
})

export const rewrite = (view: EditorView, model: TableModel, next: TableModel) =>
	view.dispatch({ changes: { from: model.from, to: model.to, insert: serialize(next) } })

export const deleteTable = (view: EditorView, model: TableModel) =>
	view.dispatch({ changes: { from: model.from, to: Math.min(model.to + 1, view.state.doc.length), insert: '' } })
