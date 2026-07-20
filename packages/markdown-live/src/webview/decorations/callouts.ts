import { StateEffect } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { type CalloutConfig, resolveCallout } from '../../callouts.data'
import { defineWidget } from '../lib/widget'
import { selectionTouches } from './active'

// Style-in-place (model C): callout lines stay editable text — line decorations paint the container, the
// `>`/`[!type]` syntax is hidden and revealed per active line, and the content keeps live inline markdown
// (it's real text). The icon (and, when untitled, the type-name title) are widgets on the header line.

// Header: `> [!type]` with an optional fold marker (+/-) and an optional custom title.
const CALLOUT_HEADER_RE = /^(>\s*)\[!(\w+)\]([+-]?)\s?(.*)$/i
const BLOCKQUOTE_MARK_RE = /^>\s?/ // the `> ` prefix to hide on content lines

// Settings pushed from the webview.
let userCallouts: CalloutConfig = {}
let showDefaultTitle = true
const refresh = StateEffect.define<null>()

/** Apply the user's callout settings and rebuild — called from the webview when settings arrive/change. */
export function applyCallouts(view: EditorView, config: CalloutConfig, defaultTitle: boolean) {
	userCallouts = config
	showDefaultTitle = defaultTitle
	view.dispatch({ effects: refresh.of(null) })
}

const hide = Decoration.replace({})
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// An icon can be an emoji, a `$(codicon)` name, or a raw <svg> string (config is trusted).
const iconWidget = defineWidget<{ icon: string }>({
	eq: (a, b) => a.icon === b.icon,
	toDOM: (value) => {
		const span = document.createElement('span')
		span.className = 'md-callout-icon'
		const icon = value.icon.trim()
		if (icon.startsWith('$(') && icon.endsWith(')')) span.classList.add('codicon', `codicon-${icon.slice(2, -1)}`)
		else if (icon.startsWith('<svg')) span.innerHTML = icon
		else span.textContent = value.icon
		return span
	},
})

// The type name shown as the title when the callout has no custom title (Obsidian behavior).
const titleWidget = defineWidget<{ text: string }>({
	eq: (a, b) => a.text === b.text,
	toDOM: (value) => {
		const span = document.createElement('span')
		span.className = 'md-callout-title'
		span.textContent = value.text
		return span
	},
})

function buildCalloutDecorations(view: EditorView): DecorationSet {
	const ranges: Array<{ from: number; to: number; deco: Decoration }> = []
	const add = (from: number, to: number, deco: Decoration) => ranges.push({ from, to, deco })
	const doc = view.state.doc

	let lineNum = 1
	while (lineNum <= doc.lines) {
		const header = CALLOUT_HEADER_RE.exec(doc.line(lineNum).text)
		if (!header) {
			lineNum++
			continue
		}
		const type = (header[2] ?? '').toLowerCase()
		const title = header[4] ?? ''
		const { icon, color } = resolveCallout(userCallouts, type)

		// The block runs from the header line through the following `>` lines.
		let lastLine = lineNum
		for (let next = lineNum + 1; next <= doc.lines && doc.line(next).text.startsWith('>'); next++) lastLine = next

		for (let current = lineNum; current <= lastLine; current++) {
			const line = doc.line(current)
			const classes = ['md-callout-line']
			if (current === lineNum) classes.push('md-callout-line-head')
			if (current === lastLine) classes.push('md-callout-line-last')
			const attributes: Record<string, string> = { class: classes.join(' ') }
			if (color) attributes.style = `--callout-color:${color}`
			add(line.from, line.from, Decoration.line({ attributes }))

			// Reveal the raw syntax on whichever line the cursor is on; style everything else.
			if (selectionTouches(view.state, line.from, line.to)) continue

			if (current === lineNum) {
				// Hide the whole `> [!type][+-] ` prefix (so the fold marker never leaks), show the icon, and —
				// when there's no custom title — the type name as the title.
				const titleStart = line.text.length - title.length
				add(line.from, line.from + titleStart, hide)
				add(line.from, line.from, Decoration.widget({ widget: iconWidget({ icon }), side: -1 }))
				if (showDefaultTitle && title.trim().length === 0)
					add(line.from, line.from, Decoration.widget({ widget: titleWidget({ text: capitalize(type) }), side: -1 }))
			} else {
				const mark = BLOCKQUOTE_MARK_RE.exec(line.text)?.[0]
				if (mark) add(line.from, line.from + mark.length, hide)
			}
		}

		lineNum = lastLine + 1
	}

	return Decoration.set(
		ranges.map(({ from, to, deco }) => deco.range(from, to)),
		true,
	)
}

export const calloutsPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet
		constructor(view: EditorView) {
			this.decorations = buildCalloutDecorations(view)
		}
		update(update: ViewUpdate) {
			const refreshed = update.transactions.some((transaction) =>
				transaction.effects.some((effect) => effect.is(refresh)),
			)
			if (update.docChanged || update.viewportChanged || update.selectionSet || refreshed)
				this.decorations = buildCalloutDecorations(update.view)
		}
	},
	{ decorations: (plugin) => plugin.decorations },
)
