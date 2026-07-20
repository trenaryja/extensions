import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { defineWidget } from '../lib/widget'

// `- [ ] ` / `- [x] ` (also `*`), allowing a leading blockquote/callout prefix so tasks render inside callouts.
const TASK_RE = /^(\s*(?:>\s*)*[-*]\s)\[([ xX])\]\s/

const checkboxWidget = defineWidget<{ checked: boolean }>({
	eq: (a, b) => a.checked === b.checked,
	// Let mousedown through so the cursor can land near the checkbox; the checkbox itself never changes state
	// (editing the markdown is the source of truth).
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

function buildTaskDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const doc = view.state.doc

	for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
		const line = doc.line(lineNum)
		const match = TASK_RE.exec(line.text)
		if (!match) continue

		const checked = (match[2] ?? '').toLowerCase() === 'x'
		// Replace the `-␣[ ]␣` marker (bullet + checkbox) with the checkbox, keeping any leading indent/prefix —
		// so the rendered task is just "☑ text". The bullet + space are the last 2 chars of match[1].
		const from = line.from + ((match[1]?.length ?? 0) - 2)
		const to = line.from + match[0].length

		builder.add(from, to, Decoration.replace({ widget: checkboxWidget({ checked }), side: 1 }))
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
	{ decorations: (plugin) => plugin.decorations },
)
