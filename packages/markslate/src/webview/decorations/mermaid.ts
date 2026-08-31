import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import mermaid from 'mermaid'
import { defineWidget } from '../lib/widget'
import { docOrSelectionChanged, selectionTouches } from './active'

export type MermaidRenderMode = 'inline' | 'below' | 'disabled'

// Dispatched when the VS Code theme changes so the field rebuilds and diagrams re-render with new colors.
const mermaidRefresh = StateEffect.define<null>()

// Bridge the active VS Code theme into mermaid's `base` theme — the same idea as the Shiki bridge for code
// blocks, but sourced from the `--vscode-*` CSS variables VS Code injects into the webview (no host round-trip
// needed). The categorical series (pie slices, git branches, …) is driven off `--vscode-charts-*`, the palette
// VS Code reserves for charts, so diagrams match your theme's chart colors.
function buildMermaidTheme() {
	const css = getComputedStyle(document.body)
	const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
	const isDark = document.body.dataset.vscodeThemeKind?.includes('dark') ?? false

	const bg = v('--vscode-editor-background', isDark ? '#1e1e1e' : '#ffffff')
	const fg = v('--vscode-editor-foreground', isDark ? '#d4d4d4' : '#333333')
	const surface = v('--vscode-editorWidget-background', bg)
	const border = v('--vscode-widget-border', v('--vscode-editorWidget-border', isDark ? '#454545' : '#c8c8c8'))
	const accent = v('--vscode-focusBorder', v('--vscode-button-background', '#4fc1ff'))
	const lines = v('--vscode-charts-lines', border)

	const series = [
		v('--vscode-charts-blue', '#4c8bf5'),
		v('--vscode-charts-green', '#53c578'),
		v('--vscode-charts-orange', '#ffab40'),
		v('--vscode-charts-purple', '#b478ff'),
		v('--vscode-charts-red', '#ff6464'),
		v('--vscode-charts-yellow', '#ffc83c'),
	]
	const pick = (index: number) => series[index % series.length]
	// pie uses 1-based keys (pie1..pie12), git uses 0-based (git0..git7).
	const pie = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`pie${i + 1}`, pick(i)]))
	const git = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`git${i}`, pick(i)]))

	return {
		theme: 'base' as const,
		themeVariables: {
			darkMode: isDark,
			fontFamily: v('--vscode-font-family', "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"),
			fontSize: '14px',
			background: bg,
			primaryColor: surface,
			primaryTextColor: fg,
			primaryBorderColor: accent,
			secondaryColor: surface,
			tertiaryColor: bg,
			lineColor: lines,
			textColor: fg,
			mainBkg: surface,
			nodeBorder: accent,
			clusterBkg: bg,
			clusterBorder: border,
			titleColor: fg,
			edgeLabelBackground: bg,
			// Pie
			pieTitleTextColor: fg,
			pieSectionTextColor: fg,
			pieStrokeColor: bg,
			pieOuterStrokeColor: border,
			pieLegendTextColor: fg,
			...pie,
			// Git
			commitLabelColor: fg,
			commitLabelBackground: bg,
			...git,
		},
	}
}

function initMermaid() {
	mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', ...buildMermaidTheme() })
}

let mermaidInitialized = false

function ensureMermaidInit() {
	if (mermaidInitialized) return
	mermaidInitialized = true
	initMermaid()
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

/** Re-theme mermaid to the current VS Code theme and re-render every diagram (called when the theme changes). */
export function refreshMermaidTheme(view: EditorView) {
	if (!mermaidInitialized) return // nothing rendered yet — the first render will pick up the current theme
	initMermaid()
	svgByCode.clear()
	lastSvg = ''
	view.dispatch({ effects: mermaidRefresh.of(null) })
}

type MermaidBlock = { startLine: number; endLine: number; code: string }

function findMermaidBlocks(state: EditorState): MermaidBlock[] {
	const { doc } = state
	const blocks: MermaidBlock[] = []
	let blockStart = -1
	const codeLines: string[] = []

	for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
		const { text } = doc.line(lineNum)

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

// The fenced source itself is chromed like any code block by treeBlocks + codeblocks (container, dimmed
// fences, copy/delete, Shiki colors). This field owns only the diagram: it replaces the source when collapsed, and
// renders below the source while editing (`below` mode, or the cursor is inside) — a live preview with no
// big collapse, so revealing the source never jumps the scroll position.
function buildMermaidDecorations(state: EditorState, mode: MermaidRenderMode): DecorationSet {
	if (mode === 'disabled') return Decoration.none

	const builder = new RangeSetBuilder<Decoration>()
	const { doc } = state

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
			const themed = transaction.effects.some((effect) => effect.is(mermaidRefresh))
			if (!themed && !docOrSelectionChanged(transaction)) return decorations
			return buildMermaidDecorations(transaction.state, getMode())
		},
		provide(field) {
			return EditorView.decorations.from(field)
		},
	})
}
