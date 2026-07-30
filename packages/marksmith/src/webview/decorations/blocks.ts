import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { defineWidget } from '../lib/widget'
import { selectionTouches } from './active'

// ---------- Widgets ----------

// Let a mousedown through so clicking the widget places the cursor and reveals the raw source to edit.
const editable = (event: Event) => event.type !== 'mousedown'

const hrWidget = defineWidget<null>({
	eq: () => true,
	ignoreEvent: editable,
	toDOM: () => {
		const hr = document.createElement('hr')
		hr.className = 'md-hr'
		return hr
	},
})

const imageWidget = defineWidget<{ alt: string; src: string }>({
	eq: (a, b) => a.alt === b.alt && a.src === b.src,
	ignoreEvent: editable,
	toDOM: (value) => {
		const img = document.createElement('img')
		img.className = 'md-img'
		img.alt = value.alt
		img.src = value.src
		return img
	},
})

// ---------- Types ----------

type LineEntry = { kind: 'line'; from: number; deco: Decoration }
type MarkEntry = { kind: 'mark'; from: number; to: number; deco: Decoration }
type Entry = LineEntry | MarkEntry

function lineDeco(from: number, cls: string): LineEntry {
	return { kind: 'line', from, deco: Decoration.line({ attributes: { class: cls } }) }
}

function markDeco(from: number, to: number, deco: Decoration): MarkEntry {
	return { kind: 'mark', from, to, deco }
}

// ---------- Builder ----------

function buildBlockDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const doc = view.state.doc
	const entries: Entry[] = []

	let inFrontMatter = false
	let frontMatterClosed = false
	let inCodeBlock = false
	let inCallout = false

	for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
		const line = doc.line(lineNum)
		const text = line.text
		// Reveal the raw source (editable) whenever the cursor is on this line.
		const active = selectionTouches(view.state, line.from, line.to)

		// Reset callout tracking when we leave a blockquote context
		if (!text.startsWith('>')) inCallout = false

		// --- Front matter ---
		if (lineNum === 1 && /^---\s*$/.test(text) && !inCodeBlock) {
			inFrontMatter = true
			entries.push(lineDeco(line.from, 'md-frontmatter'))
			continue
		}
		if (inFrontMatter && !frontMatterClosed) {
			if (lineNum > 1 && /^---\s*$/.test(text)) {
				frontMatterClosed = true
				inFrontMatter = false
			}
			entries.push(lineDeco(line.from, 'md-frontmatter'))
			continue
		}

		// --- Fenced code blocks — owned entirely by codeblocksPlugin ---
		if (text.startsWith('```')) {
			inCodeBlock = !inCodeBlock
			continue
		}
		if (inCodeBlock) continue

		// --- Horizontal rule (editable on cursor entry) ---
		if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(text)) {
			if (!active) entries.push(markDeco(line.from, line.to, Decoration.replace({ widget: hrWidget(null) })))
			continue
		}

		// --- Images ---
		const imgMatch = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(text)
		if (imgMatch) {
			const image = imageWidget({ alt: imgMatch[1] ?? '', src: imgMatch[2] ?? '' })
			// While editing, keep the image rendered just BELOW the editable `![...]` source, so the document
			// height barely changes on reveal (no ~500px collapse → no jarring scroll jump), and you get a live
			// preview. It's an inline widget (block widgets aren't allowed from a plugin); `.md-img` is
			// display:block, so it wraps to its own line under the source. Otherwise, replace the line with it.
			if (active) entries.push(markDeco(line.to, line.to, Decoration.widget({ widget: image, side: 1 })))
			else entries.push(markDeco(line.from, line.to, Decoration.replace({ widget: image })))
			continue
		}

		// --- Blockquote (callouts owned by calloutsPlugin — skip their title AND content lines) ---
		if (text.startsWith('>')) {
			if (/^>\s*\[!\w+\]/i.test(text)) {
				inCallout = true
				continue
			}
			if (inCallout) continue
			entries.push(lineDeco(line.from, 'md-blockquote-line'))
			entries.push(markDeco(line.from, line.from + 1, Decoration.mark({ class: 'md-blockquote-marker' })))
		}
	}

	// Sort: by `from`, then line decos before mark decos, then larger marks first
	entries.sort((a, b) => {
		if (a.from !== b.from) return a.from - b.from
		const aIsLine = a.kind === 'line'
		const bIsLine = b.kind === 'line'
		if (aIsLine && !bIsLine) return -1
		if (!aIsLine && bIsLine) return 1
		if (a.kind === 'mark' && b.kind === 'mark') return b.to - a.to
		return 0
	})

	let lastMarkTo = -1
	for (const entry of entries) {
		if (entry.kind === 'line') {
			builder.add(entry.from, entry.from, entry.deco)
		} else {
			if (entry.from < lastMarkTo) continue
			builder.add(entry.from, entry.to, entry.deco)
			lastMarkTo = entry.to
		}
	}

	return builder.finish()
}

export const blocksPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet
		constructor(view: EditorView) {
			this.decorations = buildBlockDecorations(view)
		}
		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged || update.selectionSet)
				this.decorations = buildBlockDecorations(update.view)
		}
	},
	{ decorations: (plugin) => plugin.decorations },
)
