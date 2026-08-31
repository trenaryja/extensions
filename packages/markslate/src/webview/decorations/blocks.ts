import { RangeSetBuilder } from '@codemirror/state'
import type { Line } from '@codemirror/state'
import { Decoration, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view'
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

const RULE_RE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/
const CALLOUT_HEADER_RE = /^>\s*\[!\w+\]/
const FRONT_MATTER_FENCE_RE = /^---\s*$/

// Front matter and fenced code span many lines, so the scan carries their open/closed state line to line.
type BlockScan = { inFrontMatter: boolean; frontMatterClosed: boolean; inCodeBlock: boolean; inCallout: boolean }

// The `---` fence and everything between it, styled as one block. Returns null once the front matter is behind us.
function frontMatterEntry(scan: BlockScan, line: Line) {
	if (line.number === 1 && FRONT_MATTER_FENCE_RE.test(line.text) && !scan.inCodeBlock) {
		scan.inFrontMatter = true
		return lineDeco(line.from, 'md-frontmatter')
	}
	if (!scan.inFrontMatter || scan.frontMatterClosed) return null

	if (line.number > 1 && FRONT_MATTER_FENCE_RE.test(line.text)) {
		scan.frontMatterClosed = true
		scan.inFrontMatter = false
	}

	return lineDeco(line.from, 'md-frontmatter')
}

// While editing, keep the image rendered just BELOW the editable `![...]` source, so the document height
// barely changes on reveal (no ~500px collapse → no jarring scroll jump), and you get a live preview. It's an
// inline widget (block widgets aren't allowed from a plugin); `.md-img` is display:block, so it wraps to its
// own line under the source. Otherwise, replace the line with it.
function imageEntry(line: Line, active: boolean) {
	const match = IMAGE_RE.exec(line.text)
	if (!match) return null
	const image = imageWidget({ alt: match[1] ?? '', src: match[2] ?? '' })
	if (active) return markDeco(line.to, line.to, Decoration.widget({ widget: image, side: 1 }))
	return markDeco(line.from, line.to, Decoration.replace({ widget: image }))
}

// Callout blockquotes are owned by calloutsPlugin — skip their title AND content lines.
function blockquoteEntries(scan: BlockScan, line: Line): Entry[] {
	if (!line.text.startsWith('>')) return []

	if (CALLOUT_HEADER_RE.test(line.text)) {
		scan.inCallout = true
		return []
	}

	if (scan.inCallout) return []
	return [
		lineDeco(line.from, 'md-blockquote-line'),
		markDeco(line.from, line.from + 1, Decoration.mark({ class: 'md-blockquote-marker' })),
	]
}

// Sort by `from`, then line decos before mark decos, then larger marks first; overlapping marks are dropped
// because RangeSetBuilder only accepts ranges in order.
function emitEntries(entries: Entry[]): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
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

function buildBlockDecorations(view: EditorView): DecorationSet {
	const { doc } = view.state
	const entries: Entry[] = []
	const scan: BlockScan = { inFrontMatter: false, frontMatterClosed: false, inCodeBlock: false, inCallout: false }

	for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
		const line = doc.line(lineNum)
		const { text } = line
		if (!text.startsWith('>')) scan.inCallout = false

		const frontMatter = frontMatterEntry(scan, line)

		if (frontMatter) {
			entries.push(frontMatter)
			continue
		}

		// Fenced code blocks are owned by the tree renderer (treeBlocks) and codeblocks' hover tools.
		if (text.startsWith('```')) {
			scan.inCodeBlock = !scan.inCodeBlock
			continue
		}
		if (scan.inCodeBlock) continue

		// Reveal the raw source (editable) whenever the cursor is on this line.
		const active = selectionTouches(view.state, line.from, line.to)

		if (RULE_RE.test(text)) {
			if (!active) entries.push(markDeco(line.from, line.to, Decoration.replace({ widget: hrWidget(null) })))
			continue
		}

		const image = imageEntry(line, active)

		if (image) {
			entries.push(image)
			continue
		}

		entries.push(...blockquoteEntries(scan, line))
	}

	return emitEntries(entries)
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
