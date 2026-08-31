// Pure interaction state machine for the table data-grid. No DOM, no CodeMirror — `reduce` is a pure
// function of (state, event, dims), and its output `effects` are plain data that the runner (in tables.ts)
// executes against CM + the widget DOM. Keeping the decision logic pure is the whole point: the 4-direction
// entry matrix, edge exits, and range growth are exhaustively unit-tested in tableMachine.test.ts.

export type Cell = { row: number; col: number } // row -1 = header row; 0.. = data rows
export type Dir = 'up' | 'down' | 'left' | 'right'
export type Dims = { rows: number; cols: number } // rows = data-row count; cols = column count

export type GridState =
	| { mode: 'document' } // CodeMirror owns the caret; the table is just rendered
	| { mode: 'selected'; anchor: Cell; focus: Cell } // a cell range is selected (single cell ⇒ anchor === focus)
	| { mode: 'editing'; cell: Cell } // one cell's text is being edited

export type GridEvent =
	// arrow crossed the table boundary from the document; the corner is the cell it lands on
	| { t: 'enter'; corner: 'top-left' | 'bottom-left' | 'bottom-right' }
	| { t: 'move'; dir: Dir; shift: boolean } // arrow while selected (shift = grow the range)
	| { t: 'commitMove'; dir: Dir } // Enter=down, Shift+Enter=up, Tab=right, Shift+Tab=left
	| { t: 'edgeStep'; dir: Dir } // arrow leaving a cell while editing → the adjacent cell (traverse the source)
	| { t: 'beginEdit'; seed: string | null } // F2/double-click (seed null) or type-to-replace (seed = char)
	| { t: 'escape' }
	| { t: 'click'; cell: Cell; shift: boolean }
	| { t: 'dragTo'; cell: Cell } // pointer drag extends the range
	| { t: 'selectAll' } // Ctrl/Cmd-A while selected → the whole grid
	| { t: 'clear' } // Delete/Backspace on the selection
	| { t: 'copy' }
	| { t: 'cut' }
	| { t: 'paste' }
	| { t: 'exit' } // focus truly left the island (outside click, blur to document)

export type Effect =
	| { e: 'focusSink' } // park focus on the hidden key/paste sink (selected mode)
	| { e: 'focusCell'; cell: Cell; seed: string | null; caret?: 'start' | 'end' } // enter editing (caret defaults to end)
	| { e: 'commit'; cell: Cell } // read the editing cell's DOM text → write it to the document
	| { e: 'cancelEdit'; cell: Cell } // discard the editing cell's DOM text → re-render from the model
	| { e: 'showSelection'; anchor: Cell; focus: Cell }
	| { e: 'hideSelection' }
	| { e: 'exitDoc'; side: 'top' | 'bottom' } // hand back to CM: park the caret just above/below the table
	| { e: 'clearRange'; anchor: Cell; focus: Cell }
	| { e: 'copyRange'; anchor: Cell; focus: Cell; cut: boolean }
	| { e: 'pasteAt'; cell: Cell }

export type Result = { next: GridState; effects: Effect[] }

const HEADER_ROW = -1

export const normalizeRange = (anchor: Cell, focus: Cell) => ({
	top: Math.min(anchor.row, focus.row),
	bottom: Math.max(anchor.row, focus.row),
	left: Math.min(anchor.col, focus.col),
	right: Math.max(anchor.col, focus.col),
})
const topLeft = (anchor: Cell, focus: Cell): Cell => ({
	row: Math.min(anchor.row, focus.row),
	col: Math.min(anchor.col, focus.col),
})

// Arrow motion: up/down can step off the top (above the header) or bottom (below the last row); left/right
// clamp within the row (leaving horizontally isn't a thing — you exit vertically or with Esc).
function step(cell: Cell, dir: Dir, dims: Dims): Cell | 'top' | 'bottom' {
	const maxRow = dims.rows - 1
	if (dir === 'up') return cell.row <= HEADER_ROW ? 'top' : { row: cell.row - 1, col: cell.col }
	if (dir === 'down') return cell.row >= maxRow ? 'bottom' : { row: cell.row + 1, col: cell.col }
	if (dir === 'left') return { row: cell.row, col: Math.max(0, cell.col - 1) }
	return { row: cell.row, col: Math.min(dims.cols - 1, cell.col + 1) }
}

// Enter/Tab motion additionally wraps across rows before exiting at the far ends.
function commitStep(cell: Cell, dir: Dir, dims: Dims): Cell | 'top' | 'bottom' {
	const maxRow = dims.rows - 1
	const maxCol = dims.cols - 1
	if (dir === 'down' || dir === 'up') return step(cell, dir, dims)
	if (dir === 'right')
		return cell.col < maxCol
			? { row: cell.row, col: cell.col + 1 }
			: cell.row >= maxRow
				? 'bottom'
				: { row: cell.row + 1, col: 0 }
	return cell.col > 0
		? { row: cell.row, col: cell.col - 1 }
		: cell.row <= HEADER_ROW
			? 'top'
			: { row: cell.row - 1, col: maxCol }
}

const select = (cell: Cell): Result => ({
	next: { mode: 'selected', anchor: cell, focus: cell },
	effects: [{ e: 'showSelection', anchor: cell, focus: cell }, { e: 'focusSink' }],
})
const extend = (anchor: Cell, focus: Cell): Result => ({
	next: { mode: 'selected', anchor, focus },
	effects: [{ e: 'showSelection', anchor, focus }, { e: 'focusSink' }],
})
const exitDoc = (side: 'top' | 'bottom', extra: Effect[] = []): Result => ({
	next: { mode: 'document' },
	effects: [...extra, { e: 'hideSelection' }, { e: 'exitDoc', side }],
})

const stay = (state: GridState): Result => ({ next: state, effects: [] })

function reduceDocument(state: GridState, event: GridEvent, dims: Dims): Result {
	if (event.t === 'enter') {
		const bottom = dims.rows - 1
		const cell: Cell =
			event.corner === 'top-left'
				? { row: HEADER_ROW, col: 0 }
				: event.corner === 'bottom-left'
					? { row: bottom, col: 0 }
					: { row: bottom, col: dims.cols - 1 } // bottom-right
		return select(cell)
	}
	if (event.t === 'click') return select(event.cell)
	return stay(state)
}

function reduceSelected(state: Extract<GridState, { mode: 'selected' }>, event: GridEvent, dims: Dims): Result {
	switch (event.t) {
		case 'move': {
			const target = step(state.focus, event.dir, dims)
			if (target === 'top' || target === 'bottom')
				// A bare arrow off the edge exits to the document; Shift+arrow would collapse the range being
				// built, so clamp (keep the current selection) like a spreadsheet does.
				return event.shift ? extend(state.anchor, state.focus) : exitDoc(target)
			return event.shift ? extend(state.anchor, target) : select(target)
		}
		case 'commitMove': {
			const target = commitStep(state.focus, event.dir, dims)
			return target === 'top' || target === 'bottom' ? exitDoc(target) : select(target)
		}
		case 'beginEdit':
			return {
				next: { mode: 'editing', cell: state.focus },
				effects: [{ e: 'focusCell', cell: state.focus, seed: event.seed }],
			}
		case 'escape':
			return exitDoc('top')
		case 'click':
			return event.shift ? extend(state.anchor, event.cell) : select(event.cell)
		case 'dragTo':
			return extend(state.anchor, event.cell)
		case 'selectAll':
			return extend({ row: HEADER_ROW, col: 0 }, { row: dims.rows - 1, col: dims.cols - 1 })
		case 'clear':
			return { next: state, effects: [{ e: 'clearRange', anchor: state.anchor, focus: state.focus }] }
		case 'copy':
			return { next: state, effects: [{ e: 'copyRange', anchor: state.anchor, focus: state.focus, cut: false }] }
		case 'cut':
			return { next: state, effects: [{ e: 'copyRange', anchor: state.anchor, focus: state.focus, cut: true }] }
		case 'paste':
			return { next: state, effects: [{ e: 'pasteAt', cell: topLeft(state.anchor, state.focus) }] }
		// `enter` only fires from the document; `edgeStep` only while editing; `exit` is handled by `reduce`.
		case 'enter':
		case 'edgeStep':
		case 'exit':
			return stay(state)
	}
}

function reduceEditing(state: Extract<GridState, { mode: 'editing' }>, event: GridEvent, dims: Dims): Result {
	switch (event.t) {
		case 'commitMove': {
			const target = commitStep(state.cell, event.dir, dims)
			return target === 'top' || target === 'bottom'
				? exitDoc(target, [{ e: 'commit', cell: state.cell }])
				: {
						next: { mode: 'selected', anchor: target, focus: target },
						effects: [
							{ e: 'commit', cell: state.cell },
							{ e: 'showSelection', anchor: target, focus: target },
							{ e: 'focusSink' },
						],
					}
		}
		case 'edgeStep': {
			// The caret left the cell (a text edge for ← →, always for ↑ ↓) — keep traversing the source: commit,
			// then edit the adjacent cell (forward → its start, backward → its end), wrapping across rows for ← →
			// and exiting the table at the far ends.
			const target = commitStep(state.cell, event.dir, dims)
			if (target === 'top' || target === 'bottom') return exitDoc(target, [{ e: 'commit', cell: state.cell }])
			const forward = event.dir === 'right' || event.dir === 'down'
			return {
				next: { mode: 'editing', cell: target },
				effects: [
					{ e: 'commit', cell: state.cell },
					{ e: 'focusCell', cell: target, seed: null, caret: forward ? 'start' : 'end' },
				],
			}
		}
		case 'escape':
			return {
				next: { mode: 'selected', anchor: state.cell, focus: state.cell },
				effects: [
					{ e: 'cancelEdit', cell: state.cell },
					{ e: 'showSelection', anchor: state.cell, focus: state.cell },
					{ e: 'focusSink' },
				],
			}
		case 'click':
			return {
				next: { mode: 'selected', anchor: event.cell, focus: event.cell },
				effects: [
					{ e: 'commit', cell: state.cell },
					{ e: 'showSelection', anchor: event.cell, focus: event.cell },
					{ e: 'focusSink' },
				],
			}
		// Arrows and typing inside a cell are native contenteditable; the rest only fire in another mode.
		case 'move':
		case 'enter':
		case 'beginEdit':
		case 'dragTo':
		case 'selectAll':
		case 'clear':
		case 'copy':
		case 'cut':
		case 'paste':
		case 'exit':
			return stay(state)
	}
}

export function reduce(state: GridState, event: GridEvent, dims: Dims): Result {
	// Leaving the island entirely — commit an in-progress edit first, then hand back to the document.
	if (event.t === 'exit') {
		if (state.mode === 'document') return stay(state)
		const commit: Effect[] = state.mode === 'editing' ? [{ e: 'commit', cell: state.cell }] : []
		return { next: { mode: 'document' }, effects: [...commit, { e: 'hideSelection' }] }
	}

	if (state.mode === 'document') return reduceDocument(state, event, dims)
	if (state.mode === 'selected') return reduceSelected(state, event, dims)
	return reduceEditing(state, event, dims)
}
