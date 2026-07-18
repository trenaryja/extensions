import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'

// Matches **bold**, __bold__
const BOLD_RE = /(\*\*|__)(.+?)\1/g
// Matches *italic*, _italic_ (not preceded/followed by same char to avoid bold)
const ITALIC_RE = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g
// Matches ~~strikethrough~~
const STRIKE_RE = /~~(.+?)~~/g
// Matches `inline code`
const CODE_RE = /`([^`]+)`/g
// Matches [text](url)
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g

const marker = Decoration.mark({ class: 'md-marker' })

/**
 * True when a selection intersects (or touches) the range — the Obsidian "Live Preview" reveal test.
 * When active, we leave the raw markdown source visible so you can edit the syntax directly.
 */
const isActive = (view: EditorView, from: number, to: number) =>
	view.state.selection.ranges.some((range) => range.from <= to && range.to >= from)

function buildInlineDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const doc = view.state.doc
	const collected: Array<{ from: number; to: number; deco: Decoration }> = []

	const push = (from: number, to: number, deco: Decoration) => collected.push({ from, to, deco })

	// Hide the marker + style the content, unless the cursor is inside the span (then reveal raw source).
	const styleSpan = (lineFrom: number, matchIndex: number, matchLength: number, markerLen: number, cls: string) => {
		const start = lineFrom + matchIndex
		const end = start + matchLength
		if (isActive(view, start, end)) return
		const contentStart = start + markerLen
		const contentEnd = end - markerLen
		push(start, contentStart, marker)
		push(contentStart, contentEnd, Decoration.mark({ class: cls }))
		push(contentEnd, end, marker)
	}

	for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
		const line = doc.line(lineNum)
		const lineText = line.text

		// Skip fenced code block lines — handled by the code-block plugin.
		if (lineText.startsWith('```') || lineText.startsWith('    ')) continue

		for (const match of lineText.matchAll(BOLD_RE))
			styleSpan(line.from, match.index!, match[0].length, match[1]!.length, 'md-bold')

		for (const match of lineText.matchAll(ITALIC_RE)) {
			const content = match[1] ?? match[2]
			if (content) styleSpan(line.from, match.index!, match[0].length, 1, 'md-italic')
		}

		for (const match of lineText.matchAll(STRIKE_RE))
			styleSpan(line.from, match.index!, match[0].length, 2, 'md-strikethrough')

		for (const match of lineText.matchAll(CODE_RE))
			styleSpan(line.from, match.index!, match[0].length, 1, 'md-code-inline')

		// Links — hide the [ ]( url ) chrome, show only the link text (unless the cursor is inside).
		for (const match of lineText.matchAll(LINK_RE)) {
			const start = line.from + match.index!
			const end = start + match[0].length
			if (isActive(view, start, end)) continue
			const linkText = match[1]!
			const url = match[2]!
			const textStart = start + 1
			const textEnd = textStart + linkText.length
			push(start, textStart, marker)
			push(textStart, textEnd, Decoration.mark({ class: 'md-link-text', attributes: { title: url } }))
			push(textEnd, end, marker)
		}
	}

	// RangeSetBuilder needs sorted, non-overlapping ranges.
	collected.sort((a, b) => a.from - b.from || b.to - a.to)
	let lastTo = -1
	for (const { from, to, deco } of collected) {
		if (from < lastTo) continue
		builder.add(from, to, deco)
		lastTo = to
	}

	return builder.finish()
}

export const inlineDecorationsPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet
		constructor(view: EditorView) {
			this.decorations = buildInlineDecorations(view)
		}
		update(update: ViewUpdate) {
			// Rebuild on selection change too, so markers reveal/hide as the cursor moves (Live Preview).
			if (update.docChanged || update.viewportChanged || update.selectionSet)
				this.decorations = buildInlineDecorations(update.view)
		}
	},
	{ decorations: (plugin) => plugin.decorations },
)
