import { describe, expect, test } from 'bun:test'
import { type Cell, type Dims, type GridState, normalizeRange, reduce } from '../src/webview/decorations/tableMachine'

const dims: Dims = { rows: 3, cols: 2 } // header (-1) + data rows 0,1,2 ; cols 0,1
const cell = (row: number, col: number): Cell => ({ row, col })
const selected = (a: Cell, f: Cell = a): GridState => ({ mode: 'selected', anchor: a, focus: f })
const editing = (c: Cell): GridState => ({ mode: 'editing', cell: c })

describe('entry from the document', () => {
	test('enter top-left → header, first column', () => {
		const { next, effects } = reduce({ mode: 'document' }, { t: 'enter', corner: 'top-left' }, dims)
		expect(next).toEqual(selected(cell(-1, 0)))
		expect(effects).toEqual([{ e: 'showSelection', anchor: cell(-1, 0), focus: cell(-1, 0) }, { e: 'focusSink' }])
	})
	test('enter bottom-left → last data row, first column', () => {
		expect(reduce({ mode: 'document' }, { t: 'enter', corner: 'bottom-left' }, dims).next).toEqual(selected(cell(2, 0)))
	})
	test('enter bottom-right → last data row, last column', () => {
		expect(reduce({ mode: 'document' }, { t: 'enter', corner: 'bottom-right' }, dims).next).toEqual(
			selected(cell(2, 1)),
		)
	})
	test('click selects the clicked cell', () => {
		expect(reduce({ mode: 'document' }, { t: 'click', cell: cell(1, 1), shift: false }, dims).next).toEqual(
			selected(cell(1, 1)),
		)
	})
	test('stray events in document mode are no-ops', () => {
		expect(reduce({ mode: 'document' }, { t: 'move', dir: 'down', shift: false }, dims)).toEqual({
			next: { mode: 'document' },
			effects: [],
		})
	})
})

describe('arrow movement while selected', () => {
	test('down moves one data row', () => {
		expect(reduce(selected(cell(0, 0)), { t: 'move', dir: 'down', shift: false }, dims).next).toEqual(
			selected(cell(1, 0)),
		)
	})
	test('up from the header exits above the table', () => {
		expect(reduce(selected(cell(-1, 0)), { t: 'move', dir: 'up', shift: false }, dims)).toEqual({
			next: { mode: 'document' },
			effects: [{ e: 'hideSelection' }, { e: 'exitDoc', side: 'top' }],
		})
	})
	test('down from the last row exits below the table', () => {
		expect(reduce(selected(cell(2, 0)), { t: 'move', dir: 'down', shift: false }, dims)).toEqual({
			next: { mode: 'document' },
			effects: [{ e: 'hideSelection' }, { e: 'exitDoc', side: 'bottom' }],
		})
	})
	test('left/right clamp within the row (no horizontal exit)', () => {
		expect(reduce(selected(cell(0, 0)), { t: 'move', dir: 'left', shift: false }, dims).next).toEqual(
			selected(cell(0, 0)),
		)
		expect(reduce(selected(cell(0, 1)), { t: 'move', dir: 'right', shift: false }, dims).next).toEqual(
			selected(cell(0, 1)),
		)
		expect(reduce(selected(cell(0, 0)), { t: 'move', dir: 'right', shift: false }, dims).next).toEqual(
			selected(cell(0, 1)),
		)
	})
	test('shift+move grows the range from a fixed anchor', () => {
		const { next } = reduce(selected(cell(0, 0)), { t: 'move', dir: 'down', shift: true }, dims)
		expect(next).toEqual(selected(cell(0, 0), cell(1, 0)))
	})
	test('non-shift move collapses an existing range', () => {
		expect(reduce(selected(cell(0, 0), cell(2, 1)), { t: 'move', dir: 'up', shift: false }, dims).next).toEqual(
			selected(cell(1, 1)),
		)
	})
})

describe('Enter / Tab commit-and-move while selected', () => {
	test('Tab moves right, then wraps to the next row', () => {
		expect(reduce(selected(cell(0, 0)), { t: 'commitMove', dir: 'right' }, dims).next).toEqual(selected(cell(0, 1)))
		expect(reduce(selected(cell(0, 1)), { t: 'commitMove', dir: 'right' }, dims).next).toEqual(selected(cell(1, 0)))
	})
	test('Tab past the last cell exits below', () => {
		expect(reduce(selected(cell(2, 1)), { t: 'commitMove', dir: 'right' }, dims).next).toEqual({ mode: 'document' })
	})
	test('Enter at the last row exits below', () => {
		expect(reduce(selected(cell(2, 0)), { t: 'commitMove', dir: 'down' }, dims).next).toEqual({ mode: 'document' })
	})
	test('Shift+Tab wraps to the previous row / header', () => {
		expect(reduce(selected(cell(0, 0)), { t: 'commitMove', dir: 'left' }, dims).next).toEqual(selected(cell(-1, 1)))
	})
})

describe('entering / leaving edit', () => {
	test('beginEdit enters editing the focused cell', () => {
		expect(reduce(selected(cell(1, 1)), { t: 'beginEdit', seed: null }, dims)).toEqual({
			next: editing(cell(1, 1)),
			effects: [{ e: 'focusCell', cell: cell(1, 1), seed: null }],
		})
	})
	test('type-to-replace passes the seed char through', () => {
		expect(reduce(selected(cell(1, 1)), { t: 'beginEdit', seed: 'x' }, dims).effects).toEqual([
			{ e: 'focusCell', cell: cell(1, 1), seed: 'x' },
		])
	})
	test('editing + Tab commits and moves to the next cell (selected)', () => {
		const { next, effects } = reduce(editing(cell(0, 0)), { t: 'commitMove', dir: 'right' }, dims)
		expect(next).toEqual(selected(cell(0, 1)))
		expect(effects[0]).toEqual({ e: 'commit', cell: cell(0, 0) })
	})
	test('editing + Enter at the last row commits and exits', () => {
		const { next, effects } = reduce(editing(cell(2, 0)), { t: 'commitMove', dir: 'down' }, dims)
		expect(next).toEqual({ mode: 'document' })
		expect(effects).toContainEqual({ e: 'commit', cell: cell(2, 0) })
		expect(effects).toContainEqual({ e: 'exitDoc', side: 'bottom' })
	})
	test('Escape while editing cancels and drops to selected', () => {
		expect(reduce(editing(cell(1, 0)), { t: 'escape' }, dims)).toEqual({
			next: selected(cell(1, 0)),
			effects: [
				{ e: 'cancelEdit', cell: cell(1, 0) },
				{ e: 'showSelection', anchor: cell(1, 0), focus: cell(1, 0) },
				{ e: 'focusSink' },
			],
		})
	})
	test('Escape while selected exits to the document', () => {
		expect(reduce(selected(cell(1, 0)), { t: 'escape' }, dims).next).toEqual({ mode: 'document' })
	})
	test('clicking another cell while editing commits then selects it', () => {
		const { next, effects } = reduce(editing(cell(0, 0)), { t: 'click', cell: cell(2, 1), shift: false }, dims)
		expect(next).toEqual(selected(cell(2, 1)))
		expect(effects[0]).toEqual({ e: 'commit', cell: cell(0, 0) })
	})
	test('arrows/typing inside a cell are native no-ops', () => {
		expect(reduce(editing(cell(0, 0)), { t: 'move', dir: 'left', shift: false }, dims)).toEqual({
			next: editing(cell(0, 0)),
			effects: [],
		})
	})
})

describe('range: click, drag, clear, clipboard', () => {
	test('shift-click extends from the anchor', () => {
		expect(reduce(selected(cell(0, 0)), { t: 'click', cell: cell(2, 1), shift: true }, dims).next).toEqual(
			selected(cell(0, 0), cell(2, 1)),
		)
	})
	test('dragTo extends the range', () => {
		expect(reduce(selected(cell(1, 0)), { t: 'dragTo', cell: cell(2, 1) }, dims).next).toEqual(
			selected(cell(1, 0), cell(2, 1)),
		)
	})
	test('clear emits clearRange and stays selected', () => {
		const state = selected(cell(0, 0), cell(1, 1))
		expect(reduce(state, { t: 'clear' }, dims)).toEqual({
			next: state,
			effects: [{ e: 'clearRange', anchor: cell(0, 0), focus: cell(1, 1) }],
		})
	})
	test('copy / cut emit copyRange with the cut flag', () => {
		expect(reduce(selected(cell(0, 0), cell(1, 1)), { t: 'copy' }, dims).effects).toEqual([
			{ e: 'copyRange', anchor: cell(0, 0), focus: cell(1, 1), cut: false },
		])
		expect(reduce(selected(cell(0, 0), cell(1, 1)), { t: 'cut' }, dims).effects).toEqual([
			{ e: 'copyRange', anchor: cell(0, 0), focus: cell(1, 1), cut: true },
		])
	})
	test('paste drops at the top-left of the selection', () => {
		expect(reduce(selected(cell(2, 1), cell(0, 0)), { t: 'paste' }, dims).effects).toEqual([
			{ e: 'pasteAt', cell: cell(0, 0) },
		])
	})
})

describe('exit (focus left the island)', () => {
	test('from selected → document + hideSelection', () => {
		expect(reduce(selected(cell(0, 0)), { t: 'exit' }, dims)).toEqual({
			next: { mode: 'document' },
			effects: [{ e: 'hideSelection' }],
		})
	})
	test('from editing → commit then document', () => {
		expect(reduce(editing(cell(0, 0)), { t: 'exit' }, dims)).toEqual({
			next: { mode: 'document' },
			effects: [{ e: 'commit', cell: cell(0, 0) }, { e: 'hideSelection' }],
		})
	})
	test('from document → no-op', () => {
		expect(reduce({ mode: 'document' }, { t: 'exit' }, dims)).toEqual({ next: { mode: 'document' }, effects: [] })
	})
})

describe('normalizeRange', () => {
	test('orders corners regardless of anchor/focus direction', () => {
		expect(normalizeRange(cell(2, 1), cell(0, 0))).toEqual({ top: 0, bottom: 2, left: 0, right: 1 })
	})
})
