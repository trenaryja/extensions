import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { selectionTouches } from './active'

const HEADING_RE = /^(#{1,6})\s/

const headingClass: Record<number, string> = {
	1: 'md-h1',
	2: 'md-h2',
	3: 'md-h3',
	4: 'md-h4',
	5: 'md-h5',
	6: 'md-h6',
}

// Hidden prefix collapses out of layout, so there's no leading gap where the `#` markers were.
const hide = Decoration.replace({})

function buildHeadingDecorations(view: EditorView): DecorationSet {
	const ranges: Array<{ from: number; to: number; deco: Decoration }> = []
	const doc = view.state.doc

	for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
		const line = doc.line(lineNum)
		const match = HEADING_RE.exec(line.text)
		if (!match) continue

		const level = match[1]!.length
		const markerEnd = line.from + match[0]!.length // end of the `##␣` prefix, including its space

		// Style the heading text (not the markers), so revealed `#`s stay normal-size when editing.
		if (line.to > markerEnd)
			ranges.push({ from: markerEnd, to: line.to, deco: Decoration.mark({ class: headingClass[level] ?? 'md-h6' }) })
		// Hide the `##␣` prefix (markers + the space) unless the cursor is on this line.
		if (!selectionTouches(view.state, line.from, line.to)) ranges.push({ from: line.from, to: markerEnd, deco: hide })
	}

	return Decoration.set(
		ranges.map(({ from, to, deco }) => deco.range(from, to)),
		true,
	)
}

export const headingsPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet
		constructor(view: EditorView) {
			this.decorations = buildHeadingDecorations(view)
		}
		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged || update.selectionSet)
				this.decorations = buildHeadingDecorations(update.view)
		}
	},
	{ decorations: (plugin) => plugin.decorations },
)
