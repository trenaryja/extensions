import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

// Matches `- [ ] ` or `- [x] ` (also `* [ ]` and `* [x]`)
const TASK_RE = /^(\s*[-*]\s)\[([ xX])\]\s/

class CheckboxWidget extends WidgetType {
	constructor(private checked: boolean) {
		super()
	}
	toDOM() {
		const checkbox = document.createElement('input')
		checkbox.type = 'checkbox'
		checkbox.className = 'md-task-checkbox'
		checkbox.checked = this.checked
		// Read-only visual — editing the markdown is the source of truth
		checkbox.addEventListener('change', (e) => e.preventDefault())
		return checkbox
	}
	ignoreEvent(event: Event) {
		// Allow click events to propagate so the cursor lands near the checkbox,
		// but prevent the checkbox from actually changing state.
		return event.type !== 'mousedown'
	}
	eq(other: CheckboxWidget) {
		return other.checked === this.checked
	}
}

function buildTaskDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const doc = view.state.doc

	for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
		const line = doc.line(lineNum)
		const match = TASK_RE.exec(line.text)
		if (!match) continue

		const bullet = match[1]!
		const mark = match[2]!
		const checked = mark.toLowerCase() === 'x'
		// The task marker is `[ ] ` or `[x] ` — 4 chars, after the bullet prefix
		const markerStart = line.from + bullet.length
		const markerEnd = markerStart + mark.length + 3 // `[?] ` = 4 chars but we keep the space after

		// Replace `[ ] ` with the checkbox widget
		builder.add(
			markerStart,
			markerEnd,
			Decoration.replace({ widget: new CheckboxWidget(checked), side: 1 }),
		)
	}

	return builder.finish()
}

export const tasksPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet
		constructor(view: EditorView) {
			this.decorations = buildTaskDecorations(view)
		}
		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged) this.decorations = buildTaskDecorations(update.view)
		}
	},
	{ decorations: (v) => v.decorations },
)
