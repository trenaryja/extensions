import { type EditorState, RangeSetBuilder, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import mermaid from 'mermaid'
import { defineWidget } from '../lib/widget'
import { docOrSelectionChanged, selectionTouches } from './active'

export type MermaidRenderMode = 'inline' | 'below' | 'disabled'

let mermaidInitialized = false

function ensureMermaidInit() {
	if (mermaidInitialized) return
	mermaidInitialized = true
	const isDark = document.body.dataset.vscodeThemeKind?.includes('dark') ?? false
	mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default', securityLevel: 'loose' })
}

let diagramCounter = 0
// Cache rendered SVG by exact source so re-mounting the widget (e.g. toggling between the replaced diagram
// and the live-preview-below while editing) shows instantly — no "Rendering…" flash. `lastSvg` keeps the
// most recent diagram on screen while typing a change, so live edits swap smoothly instead of flickering.
const svgByCode = new Map<string, string>()
let lastSvg = ''

const mermaidWidget = defineWidget<{ code: string }>({
	eq: (a, b) => a.code === b.code,
	// Let a mousedown through so clicking the diagram places the cursor and reveals the source to edit.
	ignoreEvent: (event) => event.type !== 'mousedown',
	toDOM: (value) => {
		ensureMermaidInit()
		const wrapper = document.createElement('div')
		wrapper.className = 'md-mermaid-widget'
		const cached = svgByCode.get(value.code) ?? lastSvg
		if (cached) wrapper.innerHTML = cached
		else wrapper.textContent = 'Rendering diagram…'

		mermaid
			.render(`mermaid-diagram-${++diagramCounter}`, value.code)
			.then(({ svg }) => {
				svgByCode.set(value.code, svg)
				lastSvg = svg
				wrapper.innerHTML = svg
			})
			.catch((err: unknown) => {
				// Keep showing the last good diagram if we have one (avoids an error flash mid-edit); otherwise show it.
				if (svgByCode.has(value.code) || lastSvg) return
				const span = document.createElement('span')
				span.className = 'md-mermaid-error'
				span.textContent = `Mermaid error: ${err instanceof Error ? err.message : String(err)}`
				wrapper.replaceChildren(span)
			})

		return wrapper
	},
})

type MermaidBlock = { startLine: number; endLine: number; code: string }

function findMermaidBlocks(state: EditorState): MermaidBlock[] {
	const doc = state.doc
	const blocks: MermaidBlock[] = []
	let blockStart = -1
	const codeLines: string[] = []

	for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
		const text = doc.line(lineNum).text
		if (blockStart === -1) {
			if (/^```mermaid\s*$/i.test(text)) {
				blockStart = lineNum
				codeLines.length = 0
			}
		} else if (text === '```') {
			blocks.push({ startLine: blockStart, endLine: lineNum, code: codeLines.join('\n') })
			blockStart = -1
		} else {
			codeLines.push(text)
		}
	}

	return blocks
}

// The fenced source itself is chromed like any code block by codeblocksPlugin (container, dimmed fences,
// copy/delete, Shiki colors). This field owns only the diagram: it replaces the source when collapsed, and
// renders below the source while editing (`below` mode, or the cursor is inside) — a live preview with no
// big collapse, so revealing the source never jumps the scroll position.
function buildMermaidDecorations(state: EditorState, mode: MermaidRenderMode): DecorationSet {
	if (mode === 'disabled') return Decoration.none

	const builder = new RangeSetBuilder<Decoration>()
	const doc = state.doc

	for (const block of findMermaidBlocks(state)) {
		const start = doc.line(block.startLine)
		const end = doc.line(block.endLine)
		const widget = mermaidWidget({ code: block.code })

		if (mode === 'inline' && !selectionTouches(state, start.from, end.to))
			builder.add(start.from, end.to, Decoration.replace({ widget }))
		else builder.add(end.to, end.to, Decoration.widget({ widget, side: 1 }))
	}

	return builder.finish()
}

export function createMermaidPlugin(getMode: () => MermaidRenderMode) {
	return StateField.define<DecorationSet>({
		create(state) {
			return buildMermaidDecorations(state, getMode())
		},
		update(decorations, transaction) {
			if (!docOrSelectionChanged(transaction)) return decorations
			return buildMermaidDecorations(transaction.state, getMode())
		},
		provide(field) {
			return EditorView.decorations.from(field)
		},
	})
}
