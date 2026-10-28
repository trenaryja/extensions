import type { Cell } from './tableMachine'
import { normalizeRange } from './tableMachine'
import type { TableModel } from './tableModel'
import { isSeparatorRow, parseRow, serialize } from './tableModel'

// Write to the clipboard; a rejected write (permission denied, insecure context) is dropped.
export const writeClipboard = (text: string) => {
	navigator.clipboard.writeText(text).catch(() => undefined)
}

export const copyMarkdown = (model: TableModel) => writeClipboard(serialize(model))

export const cellText = (model: TableModel, row: number, col: number) =>
	(row < 0 ? model.headers[col] : model.rows[row]?.[col]) ?? ''

// Pull the selected cells out as a 2-D grid of raw values.
export function sliceRange(model: TableModel, anchor: Cell, focus: Cell) {
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
export function gridToMarkdown(grid: string[][]) {
	if (!grid[0]?.length) return ''
	const widths = grid[0].map((_, col) => Math.max(3, ...grid.map((line) => (line[col] ?? '').length)))
	const line = (cells: string[]) => `| ${widths.map((width, i) => (cells[i] ?? '').padEnd(width)).join(' | ')} |`
	const separator = `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`
	return [line(grid[0]), separator, ...grid.slice(1).map(line)].join('\n')
}

// Parse pasted text into a grid — a markdown table, else TSV, else one column of lines.
export function parseClipboardGrid(text: string): string[][] {
	const trimmed = text.replaceAll('\r\n', '\n').replace(/\n+$/, '')
	if (!trimmed) return []
	const lines = trimmed.split('\n')
	if (lines.every((line) => line.includes('|')) && lines.some(isSeparatorRow))
		return lines.filter((line) => !isSeparatorRow(line)).map(parseRow)
	if (trimmed.includes('\t')) return lines.map((line) => line.split('\t').map((cell) => cell.trim()))
	return lines.map((line) => [line])
}
