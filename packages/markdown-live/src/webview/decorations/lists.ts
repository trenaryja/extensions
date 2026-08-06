import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

// Matches unordered bullets: `- `, `* `, `+ ` at start (with optional indent)
// Negative lookahead for `[` avoids matching task list items (handled by tasksPlugin)
const BULLET_RE = /^(\s*)([-*+]) (?!\[)/

class BulletWidget extends WidgetType {
	toDOM() {
		const span = document.createElement('span')
		span.className = 'md-list-bullet-glyph'
		span.textContent = '•'
		return span
	}
	ignoreEvent() {
		return true
	}
	eq() {
		return true
	}
}

const bulletWidget = new BulletWidget()

function buildListDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const doc = view.state.doc

	for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
		const line = doc.line(lineNum)
		const match = BULLET_RE.exec(line.text)
		if (!match) continue
		const bulletPos = line.from + match[1]!.length
		// Replace the `-` / `*` / `+` glyph with `•` (space after is preserved)
		builder.add(bulletPos, bulletPos + 1, Decoration.replace({ widget: bulletWidget }))
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
	{ decorations: (v: { decorations: DecorationSet }) => v.decorations },
)
