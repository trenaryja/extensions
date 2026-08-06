import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

// ---------- Widgets ----------

class HrWidget extends WidgetType {
	toDOM() {
		const hr = document.createElement('hr')
		hr.className = 'md-hr'
		return hr
	}
	ignoreEvent() {
		return true
	}
}

class ImageWidget extends WidgetType {
	constructor(
		private alt: string,
		private src: string,
	) {
		super()
	}
	toDOM() {
		const img = document.createElement('img')
		img.className = 'md-img'
		img.alt = this.alt
		img.src = this.src
		return img
	}
	ignoreEvent() {
		return true
	}
	eq(other: ImageWidget) {
		return other.alt === this.alt && other.src === this.src
	}
}

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

		// --- Horizontal rule ---
		if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(text)) {
			entries.push(markDeco(line.from, line.to, Decoration.replace({ widget: new HrWidget() })))
			continue
		}

		// --- Images ---
		const imgMatch = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(text)
		if (imgMatch) {
			entries.push(
				markDeco(
					line.from,
					line.to,
					Decoration.replace({ widget: new ImageWidget(imgMatch[1] ?? '', imgMatch[2] ?? '') }),
				),
			)
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
			if (update.docChanged || update.viewportChanged) this.decorations = buildBlockDecorations(update.view)
		}
	},
	{ decorations: (v: { decorations: DecorationSet }) => v.decorations },
)
