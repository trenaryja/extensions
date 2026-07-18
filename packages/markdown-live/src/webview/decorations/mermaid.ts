import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { type EditorState, RangeSetBuilder, StateField } from '@codemirror/state'
import mermaid from 'mermaid'
import { docOrSelectionChanged, selectionTouches } from './active'

export type MermaidRenderMode = 'inline' | 'below' | 'disabled'

let mermaidInitialized = false

function ensureMermaidInit() {
	if (mermaidInitialized) return
	mermaidInitialized = true
	const isDark = document.body.dataset['vscodeThemeKind']?.includes('dark') ?? false
	mermaid.initialize({
		startOnLoad: false,
		theme: isDark ? 'dark' : 'default',
		securityLevel: 'loose',
	})
}

let diagramCounter = 0

class MermaidWidget extends WidgetType {
	constructor(private code: string) {
		super()
	}

	toDOM() {
		ensureMermaidInit()
		const wrapper = document.createElement('div')
		wrapper.className = 'md-mermaid-widget'
		wrapper.textContent = 'Rendering diagram…'

		const id = `mermaid-diagram-${++diagramCounter}`

		mermaid
			.render(id, this.code)
			.then(({ svg }: { svg: string }) => {
				wrapper.innerHTML = svg
			})
			.catch((err: unknown) => {
				const errMsg = err instanceof Error ? err.message : String(err)
				const span = document.createElement('span')
				span.className = 'md-mermaid-error'
				span.textContent = `Mermaid error: ${errMsg}`
				wrapper.innerHTML = ''
				wrapper.appendChild(span)
			})

		return wrapper
	}

	ignoreEvent(event: Event) {
		// Let a mousedown through so clicking the diagram places the cursor and reveals the source to edit.
		return event.type !== 'mousedown'
	}

	eq(other: MermaidWidget) {
		return other.code === this.code
	}
}

function findMermaidBlocks(state: EditorState) {
	const doc = state.doc
	const lines = doc.lines
	const blocks: Array<{ startLine: number; endLine: number; code: string }> = []

	let inMermaid = false
	let blockStart = -1
	const codeLines: string[] = []

	for (let lineNum = 1; lineNum <= lines; lineNum++) {
		const text = doc.line(lineNum).text

		if (!inMermaid && /^```mermaid\s*$/i.test(text)) {
			inMermaid = true
			blockStart = lineNum
			codeLines.length = 0
			continue
		}

		if (inMermaid) {
			if (text === '```') {
				blocks.push({ startLine: blockStart, endLine: lineNum, code: codeLines.join('\n') })
				inMermaid = false
				blockStart = -1
			} else {
				codeLines.push(text)
			}
		}
	}

	return blocks
}

function buildMermaidDecorations(state: EditorState, mode: MermaidRenderMode): DecorationSet {
	if (mode === 'disabled') return Decoration.none

	const builder = new RangeSetBuilder<Decoration>()
	const doc = state.doc
	const blocks = findMermaidBlocks(state)

	for (const block of blocks) {
		const startLine = doc.line(block.startLine)
		const endLine = doc.line(block.endLine)

		if (mode === 'inline') {
			// Reveal the raw block (editable) while the cursor is inside it; otherwise render the diagram.
			if (!selectionTouches(state, startLine.from, endLine.to))
				builder.add(startLine.from, endLine.to, Decoration.replace({ widget: new MermaidWidget(block.code) }))
		} else {
			// 'below' — keep source visible, insert diagram widget after the closing fence
			builder.add(endLine.to, endLine.to, Decoration.widget({ widget: new MermaidWidget(block.code), side: 1 }))
		}
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
