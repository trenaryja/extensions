import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { defineWidget } from '../lib/widget'
import { selectionTouches } from './active'

// Tree-driven block rendering. Structural markdown (headings, lists, tasks, …) is derived from the
// CommonMark/GFM syntax tree instead of regex line-scanning. Because the tree models blockquote nesting, this
// renders correctly *inside callouts and blockquotes* with zero `>`-awareness — the node positions are already
// correct. To support a new construct, register a renderer for its node type(s); nothing else changes.

// SyntaxNode type, derived so we don't take a direct @lezer/common dependency.
type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>

type RenderContext = {
	state: EditorState
	add: (from: number, to: number, deco: Decoration) => void
}
type NodeRenderer = (node: SyntaxNode, ctx: RenderContext) => void

const renderers: Record<string, NodeRenderer> = {}
const register = (nodeNames: string[], renderer: NodeRenderer) => {
	for (const name of nodeNames) renderers[name] = renderer
}

const hide = Decoration.replace({})

// ---------- Widgets ----------

const bulletWidget = defineWidget<null>({
	eq: () => true,
	toDOM: () => {
		const span = document.createElement('span')
		span.className = 'md-list-bullet-glyph'
		span.textContent = '•'
		return span
	},
})

const checkboxWidget = defineWidget<{ checked: boolean }>({
	eq: (a, b) => a.checked === b.checked,
	ignoreEvent: (event) => event.type !== 'mousedown',
	toDOM: (value) => {
		const checkbox = document.createElement('input')
		checkbox.type = 'checkbox'
		checkbox.className = 'md-task-checkbox'
		checkbox.checked = value.checked
		checkbox.addEventListener('change', (event) => event.preventDefault())
		return checkbox
	},
})

// ---------- Renderers ----------

const HEADING_CLASS: Record<number, string> = { 1: 'md-h1', 2: 'md-h2', 3: 'md-h3', 4: 'md-h4', 5: 'md-h5', 6: 'md-h6' }

// Headings: style the text, hide the `#` markers (+ following spaces) unless the cursor is on the line.
register(
	['ATXHeading1', 'ATXHeading2', 'ATXHeading3', 'ATXHeading4', 'ATXHeading5', 'ATXHeading6'],
	(node, { state, add }) => {
		const level = Number(node.name.slice(-1))
		const marker = node.firstChild // HeaderMark
		let textStart = marker ? marker.to : node.from
		while (textStart < node.to && state.doc.sliceString(textStart, textStart + 1) === ' ') textStart++
		if (textStart < node.to) add(textStart, node.to, Decoration.mark({ class: HEADING_CLASS[level] ?? 'md-h6' }))
		const line = state.doc.lineAt(node.from)
		if (!selectionTouches(state, line.from, line.to)) add(node.from, textStart, hide)
	},
)

// Unordered bullets → `•`. Ordered lists keep their numbers; task items are handled by the checkbox renderer.
register(['ListMark'], (node, { add }) => {
	const item = node.parent
	if (item?.parent?.name !== 'BulletList') return
	if (item.getChild('Task')) return
	add(node.from, node.to, Decoration.replace({ widget: bulletWidget(null) }))
})

// Task checkboxes: replace `- [ ] ` (bullet marker through the `]` + trailing space) with a checkbox.
register(['TaskMarker'], (node, { state, add }) => {
	const listMark = node.parent?.parent?.getChild('ListMark') // TaskMarker → Task → ListItem → ListMark
	if (!listMark) return
	const checked = state.doc.sliceString(node.from, node.to).toLowerCase().includes('x')
	const to = Math.min(node.to + 1, state.doc.length)
	add(listMark.from, to, Decoration.replace({ widget: checkboxWidget({ checked }), side: 1 }))
})

// ---------- Plugin ----------

function buildTreeDecorations(view: EditorView): DecorationSet {
	const ranges: Array<{ from: number; to: number; deco: Decoration }> = []
	const ctx: RenderContext = {
		state: view.state,
		add: (from, to, deco) => {
			if (to > from) ranges.push({ from, to, deco })
		},
	}
	const tree = syntaxTree(view.state)
	for (const { from, to } of view.visibleRanges)
		tree.iterate({ from, to, enter: (nodeRef) => renderers[nodeRef.name]?.(nodeRef.node, ctx) })

	return Decoration.set(
		ranges.map(({ from, to, deco }) => deco.range(from, to)),
		true,
	)
}

export const treeBlocksPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet
		constructor(view: EditorView) {
			this.decorations = buildTreeDecorations(view)
		}
		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged || update.selectionSet)
				this.decorations = buildTreeDecorations(update.view)
		}
	},
	{ decorations: (plugin) => plugin.decorations },
)
