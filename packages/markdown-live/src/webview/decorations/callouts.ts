import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { type EditorState, RangeSetBuilder, StateField } from '@codemirror/state'

const CALLOUT_ICONS: Record<string, string> = {
	note: 'ℹ️',
	info: 'ℹ️',
	todo: 'ℹ️',
	tip: '💡',
	hint: '💡',
	important: '💡',
	success: '✅',
	check: '✅',
	done: '✅',
	warning: '⚠️',
	caution: '⚠️',
	attention: '⚠️',
	failure: '❌',
	fail: '❌',
	missing: '❌',
	danger: '🔥',
	error: '🔥',
	bug: '🐛',
	question: '❓',
	help: '❓',
	faq: '❓',
	abstract: '📋',
	summary: '📋',
	tldr: '📋',
	example: '📌',
	quote: '💬',
	cite: '💬',
}

const CALLOUT_TITLE_RE = /^>\s*\[!(\w+)\](.*)$/i

class CalloutWidget extends WidgetType {
	constructor(
		private calloutType: string,
		private title: string,
		private contentLines: string[],
	) {
		super()
	}

	toDOM() {
		const typeLower = this.calloutType.toLowerCase()
		const icon = CALLOUT_ICONS[typeLower] ?? 'ℹ️'
		const displayTitle = this.title.trim() || typeLower.toUpperCase()

		const container = document.createElement('div')
		container.className = `md-callout md-callout-${typeLower}`

		const titleDiv = document.createElement('div')
		titleDiv.className = 'md-callout-title'

		const iconSpan = document.createElement('span')
		iconSpan.className = 'md-callout-icon'
		iconSpan.textContent = icon

		const titleSpan = document.createElement('span')
		titleSpan.className = 'md-callout-title-text'
		titleSpan.textContent = displayTitle

		titleDiv.appendChild(iconSpan)
		titleDiv.appendChild(titleSpan)
		container.appendChild(titleDiv)

		if (this.contentLines.length > 0) {
			const contentDiv = document.createElement('div')
			contentDiv.className = 'md-callout-content'
			const stripped = this.contentLines.map((l) => l.replace(/^>\s?/, '')).join('\n')
			contentDiv.textContent = stripped
			container.appendChild(contentDiv)
		}

		return container
	}

	ignoreEvent() {
		return true
	}

	eq(other: CalloutWidget) {
		return (
			other.calloutType === this.calloutType &&
			other.title === this.title &&
			JSON.stringify(other.contentLines) === JSON.stringify(this.contentLines)
		)
	}
}

function buildCalloutDecorations(state: EditorState): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const doc = state.doc
	const lines = doc.lines

	let lineNum = 1
	while (lineNum <= lines) {
		const line = doc.line(lineNum)
		const match = CALLOUT_TITLE_RE.exec(line.text)

		if (!match) {
			lineNum++
			continue
		}

		const calloutType = match[1] ?? 'note'
		const titleExtra = match[2] ?? ''
		const contentLines: string[] = []
		let endLineNum = lineNum

		for (let nextLine = lineNum + 1; nextLine <= lines; nextLine++) {
			const next = doc.line(nextLine)
			if (!next.text.startsWith('>')) break
			contentLines.push(next.text)
			endLineNum = nextLine
		}

		const from = line.from
		const to = doc.line(endLineNum).to

		builder.add(from, to, Decoration.replace({ widget: new CalloutWidget(calloutType, titleExtra, contentLines) }))

		lineNum = endLineNum + 1
	}

	return builder.finish()
}

export const calloutsPlugin = StateField.define<DecorationSet>({
	create(state) {
		return buildCalloutDecorations(state)
	},
	update(decorations, transaction) {
		if (!transaction.docChanged) return decorations
		return buildCalloutDecorations(transaction.state)
	},
	provide(field) {
		return EditorView.decorations.from(field)
	},
})
