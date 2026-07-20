import { type EditorState, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { type CalloutConfig, resolveCallout } from '../../callouts.data'
import { defineWidget } from '../lib/widget'
import { docOrSelectionChanged, selectionTouches } from './active'

// Style-in-place (model C): callout lines stay editable text — line decorations paint the container, the
// `>`/`[!type]` syntax is hidden and revealed per active line, and the content keeps live inline markdown
// (it's real text). The icon (and, when untitled, the type-name title) are widgets on the header line.
// A StateField (not a ViewPlugin) so it can emit the multi-line block decoration that hides folded content.

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

// Fold chevron. Clicking toggles the +/- marker in the source, so fold state lives in the document and
// round-trips (like Obsidian) — no separate state to keep in sync with edits.
const chevronWidget = defineWidget<{ collapsed: boolean; pos: number }>({
	eq: (a, b) => a.collapsed === b.collapsed && a.pos === b.pos,
	toDOM: (value, view) => {
		const span = document.createElement('span')
		span.className = `md-callout-fold codicon codicon-${value.collapsed ? 'chevron-right' : 'chevron-down'}`
		span.title = value.collapsed ? 'Expand callout' : 'Collapse callout'
		span.addEventListener('mousedown', (event) => event.stopPropagation())
		span.addEventListener('click', (event) => {
			event.stopPropagation()
			view.dispatch({ changes: { from: value.pos, to: value.pos + 1, insert: value.collapsed ? '+' : '-' } })
		})
		return span
	},
})

function buildCalloutDecorations(state: EditorState): DecorationSet {
	const ranges: Array<{ from: number; to: number; deco: Decoration }> = []
	const add = (from: number, to: number, deco: Decoration) => ranges.push({ from, to, deco })
	const doc = state.doc

	let lineNum = 1
	while (lineNum <= doc.lines) {
		const headerLine = doc.line(lineNum)
		const header = CALLOUT_HEADER_RE.exec(headerLine.text)
		if (!header) {
			lineNum++
			continue
		}

		const type = (header[2] ?? '').toLowerCase()
		const marker = header[3] ?? ''
		const title = header[4] ?? ''
		const { icon, color } = resolveCallout(userCallouts, type)

		// The block runs from the header line through the following `>` lines.
		let lastLine = lineNum
		for (let next = lineNum + 1; next <= doc.lines && doc.line(next).text.startsWith('>'); next++) lastLine = next

		const hasContent = lastLine > lineNum
		const foldable = marker === '+' || marker === '-'
		// Position of the marker character (right after `[!type]`), for the chevron to toggle.
		const markerPos = headerLine.from + (header[1] ?? '').length + type.length + 3
		// Collapse when marked `-`, but not while the cursor is inside the (about-to-be-hidden) content.
		const collapsed =
			marker === '-' && hasContent && !selectionTouches(state, doc.line(lineNum + 1).from, doc.line(lastLine).to)

		const lineDeco = (classes: string[]) => {
			const attributes: Record<string, string> = { class: classes.join(' ') }
			if (color) attributes.style = `--callout-color:${color}`
			return Decoration.line({ attributes })
		}

		// --- Header line ---
		const headClasses = ['md-callout-line', 'md-callout-line-head']
		if (collapsed || !hasContent) headClasses.push('md-callout-line-last')
		add(headerLine.from, headerLine.from, lineDeco(headClasses))

		if (!selectionTouches(state, headerLine.from, headerLine.to)) {
			// Hide the whole `> [!type][+-] ` prefix; show the fold chevron, the icon, and — when there's no
			// custom title — the type name as the title.
			add(headerLine.from, headerLine.from + (headerLine.text.length - title.length), hide)
			if (foldable)
				add(
					headerLine.from,
					headerLine.from,
					Decoration.widget({ widget: chevronWidget({ collapsed, pos: markerPos }), side: -1 }),
				)
			add(headerLine.from, headerLine.from, Decoration.widget({ widget: iconWidget({ icon }), side: -1 }))
			if (showDefaultTitle && title.trim().length === 0)
				add(
					headerLine.from,
					headerLine.from,
					Decoration.widget({ widget: titleWidget({ text: capitalize(type) }), side: -1 }),
				)
		}

		// --- Content ---
		if (collapsed) {
			// Hide every content line at once (a multi-line block replace — only possible from a StateField).
			add(headerLine.to, doc.line(lastLine).to, hide)
		} else {
			for (let current = lineNum + 1; current <= lastLine; current++) {
				const line = doc.line(current)
				const classes = ['md-callout-line']
				if (current === lastLine) classes.push('md-callout-line-last')
				add(line.from, line.from, lineDeco(classes))
				if (selectionTouches(state, line.from, line.to)) continue
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

export const calloutsPlugin = StateField.define<DecorationSet>({
	create: buildCalloutDecorations,
	update(decorations, transaction) {
		const refreshed = transaction.effects.some((effect) => effect.is(refresh))
		if (!refreshed && !docOrSelectionChanged(transaction)) return decorations
		return buildCalloutDecorations(transaction.state)
	},
	provide: (field) => EditorView.decorations.from(field),
})
