import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { defineWidget } from '../lib/widget'

// Unordered bullets `- `/`* `/`+ `, allowing a leading blockquote/callout prefix (`> `, `> > `) so lists
// render inside callouts and blockquotes too. Negative lookahead for `[` skips task items (tasksPlugin).
const BULLET_RE = /^(\s*(?:>\s*)*)([-*+]) (?!\[)/

const bulletWidget = defineWidget<null>({
	eq: () => true,
	toDOM: () => {
		const span = document.createElement('span')
		span.className = 'md-list-bullet-glyph'
		span.textContent = '•'
		return span
	},
})

function buildListDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const doc = view.state.doc

	for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
		const line = doc.line(lineNum)
		const match = BULLET_RE.exec(line.text)
		if (!match) continue
		const bulletPos = line.from + (match[1]?.length ?? 0)
		// Replace the `-` / `*` / `+` glyph with `•` (the space after is preserved).
		builder.add(bulletPos, bulletPos + 1, Decoration.replace({ widget: bulletWidget(null) }))
	}

	return builder.finish()
}

export const listsPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet
		constructor(view: EditorView) {
			this.decorations = buildListDecorations(view)
		}
		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged) this.decorations = buildListDecorations(update.view)
		}
	},
	{ decorations: (plugin) => plugin.decorations },
)
