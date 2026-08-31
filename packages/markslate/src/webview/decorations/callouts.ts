import { StateEffect, StateField } from '@codemirror/state'
import type { EditorState, Line } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { resolveCallout } from '../../callouts.data'
import type { CalloutConfig } from '../../callouts.data'
import { defineWidget } from '../lib/widget'
import { docOrSelectionChanged, selectionTouches } from './active'

// Style-in-place: callout lines stay editable text — line decorations paint the container, the
// `>`/`[!type]` syntax is hidden and revealed per active line, and the content keeps live inline markdown.
// Callouts nest: a `> > [!x]` inside a `> [!y]` renders an indented inner container inside the outer one.
// A StateField (not a ViewPlugin) so it can emit the multi-line block decoration that hides folded content.

// Header with N blockquote markers: `> > [!type]` + optional fold marker + optional custom title.
const CALLOUT_HEADER_RE = /^(\s*(?:>\s*)+)\[!(\w+)\]([+-]?)\s?(.*)$/
const QUOTE_PREFIX_RE = /^(?:\s*>\s?)+/ // the `> > ` markers to hide on content lines
const INDENT = '1.2em' // extra left padding per nesting level

const quoteDepth = (text: string) => /^(?:\s*>)+/.exec(text)?.[0].match(/>/g)?.length ?? 0

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
const NEUTRAL = 'rgba(140,140,160,0.85)'

// An icon can be an emoji, a `$(codicon)` name, or a raw <svg> string (config is trusted). Color is passed
// explicitly (not via --callout-color) so a nested header's icon uses its own callout color, not the outer's.
const iconWidget = defineWidget<{ icon: string; color?: string }>({
	eq: (a, b) => a.icon === b.icon && a.color === b.color,
	toDOM: (value) => {
		const span = document.createElement('span')
		span.className = 'md-callout-icon'
		if (value.color) span.style.color = value.color
		const icon = value.icon.trim()
		if (icon.startsWith('$(') && icon.endsWith(')')) span.classList.add('codicon', `codicon-${icon.slice(2, -1)}`)
		else if (icon.startsWith('<svg')) span.innerHTML = icon
		else span.textContent = value.icon
		return span
	},
})

// The type name shown as the title when the callout has no custom title (Obsidian behavior).
const titleWidget = defineWidget<{ text: string; color?: string }>({
	eq: (a, b) => a.text === b.text && a.color === b.color,
	toDOM: (value) => {
		const span = document.createElement('span')
		span.className = 'md-callout-title'
		if (value.color) span.style.color = value.color
		span.textContent = value.text
		return span
	},
})

// Fold chevron. Clicking toggles the +/- marker in the source, so fold state lives in the document.
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

type Callout = {
	type: string
	color?: string
	icon: string
	depth: number
	from: number // header line number
	to: number // last line number (inclusive)
	title: string
	marker: string
	collapsed?: boolean
}

// The inline `background-image` for a nested line: a 1.5px border + faint tint at each inner level's indent.
function nestedBackground(inside: Callout[]) {
	const layers: string[] = []

	for (let level = 1; level < inside.length; level++) {
		const color = inside[level]?.color ?? NEUTRAL
		const x = `calc(${level} * ${INDENT})`
		const border = `color-mix(in srgb, ${color} 45%, transparent)`
		const tint = `color-mix(in srgb, ${color} 7%, transparent)`
		layers.push(
			`linear-gradient(90deg,transparent ${x},${border} ${x},${border} calc(${x} + 1.5px),transparent calc(${x} + 1.5px))`,
		)
		layers.push(`linear-gradient(90deg,transparent ${x},${tint} ${x})`)
	}

	return layers.join(',')
}

type AddRange = (from: number, to: number, deco: Decoration) => void

// Every callout in the document, outermost first, found by tracking blockquote depth on a stack.
function findCallouts(doc: EditorState['doc']) {
	const callouts: Callout[] = []
	const stack: Callout[] = []

	const closeTo = (line: number) => {
		while (stack.length) {
			const top = stack.pop()
			if (!top) break
			top.to = line
		}
	}

	for (let n = 1; n <= doc.lines; n++) {
		const { text } = doc.line(n)
		const depth = quoteDepth(text)

		while (stack.length && (stack[stack.length - 1]?.depth ?? 0) > depth) {
			const top = stack.pop()
			if (top) top.to = n - 1
		}

		if (depth === 0) {
			closeTo(n - 1)
			continue
		}

		const header = CALLOUT_HEADER_RE.exec(text)

		if (header && depth === stack.length + 1) {
			const type = (header[2] ?? '').toLowerCase()
			const { icon, color } = resolveCallout(userCallouts, type)
			const callout: Callout = {
				type,
				color,
				icon,
				depth,
				from: n,
				to: doc.lines,
				title: header[4] ?? '',
				marker: header[3] ?? '',
			}
			stack.push(callout)
			callouts.push(callout)
		}
	}

	closeTo(doc.lines)
	return callouts
}

// Outermost (`>`) callouts collapse when marked `-` and the cursor isn't inside their content.
function markCollapsed(state: EditorState, callouts: Callout[]) {
	for (const callout of callouts)
		if (callout.depth === 1 && callout.marker === '-' && callout.to > callout.from)
			callout.collapsed = !selectionTouches(state, state.doc.line(callout.from + 1).from, state.doc.line(callout.to).to)
}

// The container decoration for one line: head/last classes, plus per-level indent and nested background.
function calloutLineDeco(inside: Callout[], lineNum: number) {
	const outer = inside[0]
	const isCollapsedHead = inside.some((c) => c.collapsed && c.from === lineNum)
	const classes = ['md-callout-line']
	if (lineNum === outer?.from) classes.push('md-callout-line-head')
	if (lineNum === outer?.to || isCollapsedHead) classes.push('md-callout-line-last')
	let style = outer?.color ? `--callout-color:${outer.color};` : ''
	if (inside.length > 1)
		style += `padding-left:calc(0.85em + ${inside.length - 1} * ${INDENT});background-image:${nestedBackground(inside)};`
	return Decoration.line({ attributes: style ? { class: classes.join(' '), style } : { class: classes.join(' ') } })
}

// Hide the whole `> > [!type][+-] ` prefix; add the chevron (outermost only), icon, and default title.
function renderHeaderLine(add: AddRange, line: Line, header: Callout) {
	const titleStart = line.from + (line.text.length - header.title.length)
	add(line.from, titleStart, hide)
	// Color a nested header's custom title (outer ones are colored/bolded via the head-line CSS).
	if (header.depth > 1 && header.color && header.title.trim().length > 0)
		add(titleStart, line.to, Decoration.mark({ attributes: { style: `color:${header.color};font-weight:600` } }))

	if (header.depth === 1 && (header.marker === '+' || header.marker === '-')) {
		const markerPos = line.from + (CALLOUT_HEADER_RE.exec(line.text)?.[1]?.length ?? 0) + header.type.length + 3
		add(
			line.from,
			line.from,
			Decoration.widget({ widget: chevronWidget({ collapsed: !!header.collapsed, pos: markerPos }), side: -1 }),
		)
	}

	add(
		line.from,
		line.from,
		Decoration.widget({ widget: iconWidget({ icon: header.icon, color: header.color }), side: -1 }),
	)
	if (showDefaultTitle && header.title.trim().length === 0)
		add(
			line.from,
			line.from,
			Decoration.widget({ widget: titleWidget({ text: capitalize(header.type), color: header.color }), side: -1 }),
		)
}

function buildCalloutDecorations(state: EditorState): DecorationSet {
	const { doc } = state
	const ranges: { from: number; to: number; deco: Decoration }[] = []
	const add = (from: number, to: number, deco: Decoration) => ranges.push({ from, to, deco })
	const callouts = findCallouts(doc)
	markCollapsed(state, callouts)

	// Render each line with the stack of callouts it sits inside.
	for (let n = 1; n <= doc.lines; n++) {
		const inside = callouts.filter((c) => c.from <= n && n <= c.to).sort((a, b) => a.depth - b.depth)
		if (!inside.length) continue
		// Skip lines hidden inside a collapsed callout's content (a block replace covers them).
		if (inside.some((c) => c.collapsed && n > c.from)) continue

		const line = doc.line(n)
		add(line.from, line.from, calloutLineDeco(inside, n))

		// Collapsed callout: hide its content lines in one block replace.
		const collapsed = inside.find((c) => c.collapsed && c.from === n)
		if (collapsed) add(line.to, doc.line(collapsed.to).to, hide)

		// Reveal the raw source while the cursor is on this line.
		if (selectionTouches(state, line.from, line.to)) continue

		const headerHere = inside.find((c) => c.from === n)

		if (headerHere) renderHeaderLine(add, line, headerHere)
		else {
			const mark = QUOTE_PREFIX_RE.exec(line.text)?.[0]
			if (mark) add(line.from, line.from + mark.length, hide)
		}
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
