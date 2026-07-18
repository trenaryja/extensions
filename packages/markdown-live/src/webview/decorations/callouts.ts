import { type EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { type CalloutConfig, DEFAULT_CALLOUTS } from '../../callouts.data'
import { defineWidget } from '../lib/widget'
import { docOrSelectionChanged, selectionTouches } from './active'

const CALLOUT_TITLE_RE = /^>\s*\[!(\w+)\](.*)$/i

// The active callout config (defaults merged with the user's `markdownLive.callouts` setting).
let currentCallouts: CalloutConfig = { ...DEFAULT_CALLOUTS }
const refresh = StateEffect.define<null>()

/** Apply the user's callout config and rebuild — called from the webview when settings arrive/change. */
export function applyCallouts(view: EditorView, config: CalloutConfig) {
	currentCallouts = { ...DEFAULT_CALLOUTS, ...config }
	view.dispatch({ effects: refresh.of(null) })
}

// An icon can be an emoji, a `$(codicon)` name, or a raw <svg> string (config is trusted).
const renderIcon = (icon: string) => {
	const span = document.createElement('span')
	span.className = 'md-callout-icon'
	const trimmed = icon.trim()
	if (trimmed.startsWith('$(') && trimmed.endsWith(')'))
		span.classList.add('codicon', `codicon-${trimmed.slice(2, -1)}`)
	else if (trimmed.startsWith('<svg')) span.innerHTML = trimmed
	else span.textContent = icon
	return span
}

type CalloutValue = { type: string; title: string; content: string[]; icon: string; color?: string }

const calloutWidget = defineWidget<CalloutValue>({
	eq: (a, b) =>
		a.type === b.type &&
		a.title === b.title &&
		a.icon === b.icon &&
		a.color === b.color &&
		a.content.length === b.content.length &&
		a.content.every((line, index) => line === b.content[index]),
	// Let a mousedown through so clicking the callout places the cursor and reveals the source to edit.
	ignoreEvent: (event) => event.type !== 'mousedown',
	toDOM: (value) => {
		const container = document.createElement('div')
		container.className = `md-callout md-callout-${value.type}`
		// One accent drives border, body tint, and the title bar (see the --callout-color CSS).
		if (value.color) container.style.setProperty('--callout-color', value.color)

		const title = document.createElement('div')
		title.className = 'md-callout-title'
		title.appendChild(renderIcon(value.icon))
		const titleText = document.createElement('span')
		titleText.className = 'md-callout-title-text'
		titleText.textContent = value.title.trim() || value.type.toUpperCase()
		title.appendChild(titleText)
		container.appendChild(title)

		if (value.content.length) {
			const content = document.createElement('div')
			content.className = 'md-callout-content'
			content.textContent = value.content.map((line) => line.replace(/^>\s?/, '')).join('\n')
			container.appendChild(content)
		}
		return container
	},
})

function buildCalloutDecorations(state: EditorState): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const doc = state.doc

	let lineNum = 1
	while (lineNum <= doc.lines) {
		const line = doc.line(lineNum)
		const match = CALLOUT_TITLE_RE.exec(line.text)
		if (!match) {
			lineNum++
			continue
		}

		const type = (match[1] ?? 'note').toLowerCase()
		const title = match[2] ?? ''
		const content: string[] = []
		let endLineNum = lineNum
		for (let next = lineNum + 1; next <= doc.lines; next++) {
			if (!doc.line(next).text.startsWith('>')) break
			content.push(doc.line(next).text)
			endLineNum = next
		}

		const from = line.from
		const to = doc.line(endLineNum).to
		// Reveal the raw callout (editable) while the cursor is inside it; otherwise render the widget.
		if (!selectionTouches(state, from, to)) {
			const style = currentCallouts[type] ?? { icon: '💬' }
			builder.add(
				from,
				to,
				Decoration.replace({
					widget: calloutWidget({ type, title, content, icon: style.icon, color: style.color }),
				}),
			)
		}

		lineNum = endLineNum + 1
	}

	return builder.finish()
}

export const calloutsPlugin = StateField.define<DecorationSet>({
	create(state) {
		return buildCalloutDecorations(state)
	},
	update(decorations, transaction) {
		const refreshed = transaction.effects.some((effect) => effect.is(refresh))
		if (!docOrSelectionChanged(transaction) && !refreshed) return decorations
		return buildCalloutDecorations(transaction.state)
	},
	provide(field) {
		return EditorView.decorations.from(field)
	},
})
