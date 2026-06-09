import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

const HEADING_RE = /^(#{1,6})\s/

const headingClass: Record<number, string> = {
	1: 'md-h1',
	2: 'md-h2',
	3: 'md-h3',
	4: 'md-h4',
	5: 'md-h5',
	6: 'md-h6',
}

function buildHeadingDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const doc = view.state.doc

	for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
		const line = doc.line(lineNum)
		const match = HEADING_RE.exec(line.text)
		if (!match) continue

		const markers = match[1]!
		const level = markers.length
		const cls = headingClass[level] ?? 'md-h6'
		const markerEnd = line.from + markers.length

		// Style the whole line as a heading
		builder.add(line.from, line.to, Decoration.mark({ class: cls }))
		// Hide the # markers
		builder.add(line.from, markerEnd, Decoration.mark({ class: 'md-heading-marker' }))
	}

	return builder.finish()
}

export const headingsPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet
		constructor(view: EditorView) {
			this.decorations = buildHeadingDecorations(view)
		}
		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged) this.decorations = buildHeadingDecorations(update.view)
		}
	},
	{ decorations: (v) => v.decorations },
)
