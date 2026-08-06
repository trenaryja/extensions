import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { type EditorState, RangeSetBuilder, StateField } from '@codemirror/state'

function isSeparatorRow(text: string): boolean {
	return /^\|?[\s\-|:]+\|[\s\-|:]*$/.test(text) && text.includes('-')
}

function parseRow(text: string): string[] {
	return text
		.replace(/^\|/, '')
		.replace(/\|$/, '')
		.split('|')
		.map((cell) => cell.trim())
}

class TableWidget extends WidgetType {
	constructor(
		private headers: string[],
		private rows: string[][],
	) {
		super()
	}

	toDOM() {
		const table = document.createElement('table')
		table.className = 'md-table'

		const thead = table.createTHead()
		const headerRow = thead.insertRow()
		for (const header of this.headers) {
			const th = document.createElement('th')
			th.textContent = header
			headerRow.appendChild(th)
		}

		const tbody = table.createTBody()
		for (const row of this.rows) {
			const tr = tbody.insertRow()
			for (let i = 0; i < this.headers.length; i++) {
				const td = tr.insertCell()
				td.textContent = row[i] ?? ''
			}
		}

		return table
	}

	ignoreEvent() {
		return true
	}

	eq(other: TableWidget) {
		return (
			JSON.stringify(other.headers) === JSON.stringify(this.headers) &&
			JSON.stringify(other.rows) === JSON.stringify(this.rows)
		)
	}
}

function buildTableDecorations(state: EditorState): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const doc = state.doc
	const lines = doc.lines

	let lineNum = 1
	while (lineNum <= lines) {
		const line = doc.line(lineNum)
		const text = line.text

		if (!text.includes('|') || lineNum + 1 > lines) {
			lineNum++
			continue
		}

		const nextLine = doc.line(lineNum + 1)
		if (!isSeparatorRow(nextLine.text)) {
			lineNum++
			continue
		}

		const headers = parseRow(text)
		const dataRows: string[][] = []
		let endLineNum = lineNum + 1

		for (let dataLine = lineNum + 2; dataLine <= lines; dataLine++) {
			const rowLine = doc.line(dataLine)
			if (!rowLine.text.includes('|')) break
			dataRows.push(parseRow(rowLine.text))
			endLineNum = dataLine
		}

		builder.add(line.from, doc.line(endLineNum).to, Decoration.replace({ widget: new TableWidget(headers, dataRows) }))

		lineNum = endLineNum + 1
	}

	return builder.finish()
}

export const tablesPlugin = StateField.define<DecorationSet>({
	create(state) {
		return buildTableDecorations(state)
	},
	update(decorations, transaction) {
		if (!transaction.docChanged) return decorations
		return buildTableDecorations(transaction.state)
	},
	provide(field) {
		return EditorView.decorations.from(field)
	},
})
