import type { EditorState } from '@codemirror/state'
import { Annotation, Prec, RangeSetBuilder, StateField } from '@codemirror/state'
import type { DecorationSet } from '@codemirror/view'
import { Decoration, EditorView, keymap } from '@codemirror/view'
import { defineWidget } from '../lib/widget'
import type { SourceRange } from './active'
import { docOrSelectionChanged, rawSourceRanges, selectionRangeTouches, selectionTouches } from './active'
import { gridCell, makeSink } from './tableCellUi'
import { formatterProfile } from './tableFormat'
import { cellMenu, columnMenu, rowMenu } from './tableMenu'
import type { Axis, TableModel } from './tableModel'
import {
	deleteTable,
	insertColumn,
	insertRow,
	isSeparatorRow,
	moveColumn,
	moveRow,
	parseAligns,
	parseRow,
	rewrite,
} from './tableModel'
import { attachReorder } from './tableReorder'
import { applyVisual, ctxFor, dispatch, modelOf, session } from './tableSession'

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

const tableWidget = defineWidget<TableModel>({
	eq: (a, b) =>
		a.from === b.from &&
		a.to === b.to &&
		JSON.stringify([a.headers, a.aligns, a.rows]) === JSON.stringify([b.headers, b.aligns, b.rows]),
	// Every event inside the table (cells, handles, borders) is handled by our own DOM — CM never sees it, so a
	// plain click can't move the cursor into the range and flip it to source. Raw editing is opt-in ("Edit source").
	ignoreEvent: (event) =>
		event.target instanceof Element &&
		!!event.target.closest(
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
		for (const [col, header] of model.headers.entries()) {
			const th = document.createElement('th')
			th.style.textAlign = model.aligns[col] ?? ''

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
		}

		const tbody = table.createTBody()
		for (const [rowIndex, row] of model.rows.entries()) {
			const tr = tbody.insertRow()
			for (const col of model.headers.keys()) {
				const td = tr.insertCell()
				td.style.textAlign = model.aligns[col] ?? ''
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
			}
		}

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
		if (session.activeFrom === model.from && session.gridState.mode !== 'document')
			requestAnimationFrame(() => applyVisual(ctxFor(view, model.from)))

		return wrap
	},
})

type TableScan = { deco: DecorationSet; raw: SourceRange[] }

// Reveal the raw source when a ranged selection touches the table (drag-select or "Edit source"), and stay
// revealed while a caret lingers in its lines (sticky) so editing the source doesn't collapse it. A grid
// session never reveals — its parked caret would otherwise touch the range.
function updateRevealed(state: EditorState, from: number, to: number) {
	const gridActive = session.activeFrom === from && session.gridState.mode !== 'document'
	const reveal =
		!gridActive &&
		(selectionRangeTouches(state, from, to) || (session.revealedFrom === from && selectionTouches(state, from, to)))
	if (reveal) session.revealedFrom = from
	else if (session.revealedFrom === from) session.revealedFrom = null
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

		if (updateRevealed(state, from, to)) {
			raw.push({ from, to }) // other plugins skip this range → the source stays byte-accurate
			addSourceLines(builder, state, { first: lineNum, last: endLineNum })
		} else
			// block: true tells CM this replaces whole lines — fixes the over-tall caret on the line above it.
			builder.add(from, to, Decoration.replace({ widget: tableWidget(model), block: true }))

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
	state.field(tablesField).deco.between(0, state.doc.length, (from, to) => {
		if (to > from) edges.push({ from, to })
	})
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
	const from = [...dirty].find(
		(f) => !revealed.has(f) && session.activeFrom !== f && edges.some((edge) => edge.from === f),
	)
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

	if (update.docChanged && !isFormatPass) {
		// Inverted, the changes' A side is the new document, which is where the edges live.
		const changed = update.changes.invertedDesc
		for (const edge of [...tableEdges(update.state), ...update.state.field(tablesField).raw])
			if (changed.touchesRange(edge.from, edge.to)) dirty.add(edge.from)
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

export const readGridState = () => ({ ...session.gridState, from: session.activeFrom })
