import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

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

function buildInlineDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const doc = view.state.doc
	const collected: Array<{ from: number; to: number; deco: Decoration }> = []

	for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
		const line = doc.line(lineNum)
		const lineText = line.text

		// Skip fenced code block lines — handled by blocks plugin
		if (lineText.startsWith('```') || lineText.startsWith('    ')) continue

		// Bold
		for (const match of lineText.matchAll(BOLD_RE)) {
			const start = line.from + match.index!
			const marker = match[1]!
			const content = match[2]!
			const markerLen = marker.length
			collected.push({ from: start, to: start + markerLen, deco: Decoration.mark({ class: 'md-marker' }) })
			collected.push({
				from: start + markerLen,
				to: start + markerLen + content.length,
				deco: Decoration.mark({ class: 'md-bold' }),
			})
			const closeStart = start + markerLen + content.length
			collected.push({ from: closeStart, to: closeStart + markerLen, deco: Decoration.mark({ class: 'md-marker' }) })
		}

		// Italic
		for (const match of lineText.matchAll(ITALIC_RE)) {
			const start = line.from + match.index!
			const content = match[1] ?? match[2]
			if (!content) continue
			collected.push({ from: start, to: start + 1, deco: Decoration.mark({ class: 'md-marker' }) })
			collected.push({
				from: start + 1,
				to: start + 1 + content.length,
				deco: Decoration.mark({ class: 'md-italic' }),
			})
			const closeStart = start + 1 + content.length
			collected.push({ from: closeStart, to: closeStart + 1, deco: Decoration.mark({ class: 'md-marker' }) })
		}

		// Strikethrough
		for (const match of lineText.matchAll(STRIKE_RE)) {
			const start = line.from + match.index!
			const content = match[1]!
			collected.push({ from: start, to: start + 2, deco: Decoration.mark({ class: 'md-marker' }) })
			collected.push({
				from: start + 2,
				to: start + 2 + content.length,
				deco: Decoration.mark({ class: 'md-strikethrough' }),
			})
			const closeStart = start + 2 + content.length
			collected.push({ from: closeStart, to: closeStart + 2, deco: Decoration.mark({ class: 'md-marker' }) })
		}

		// Inline code
		for (const match of lineText.matchAll(CODE_RE)) {
			const start = line.from + match.index!
			const content = match[1]!
			collected.push({ from: start, to: start + 1, deco: Decoration.mark({ class: 'md-marker' }) })
			collected.push({
				from: start + 1,
				to: start + 1 + content.length,
				deco: Decoration.mark({ class: 'md-code-inline' }),
			})
			const closeStart = start + 1 + content.length
			collected.push({ from: closeStart, to: closeStart + 1, deco: Decoration.mark({ class: 'md-marker' }) })
		}

		// Links — hide [text](url), show only text styled as link
		for (const match of lineText.matchAll(LINK_RE)) {
			const start = line.from + match.index!
			const fullLen = match[0].length
			const linkText = match[1]!
			const url = match[2]!
			collected.push({ from: start, to: start + 1, deco: Decoration.mark({ class: 'md-marker' }) })
			collected.push({
				from: start + 1,
				to: start + 1 + linkText.length,
				deco: Decoration.mark({ class: 'md-link-text', attributes: { title: url } }),
			})
			const closeBracket = start + 1 + linkText.length
			collected.push({ from: closeBracket, to: start + fullLen, deco: Decoration.mark({ class: 'md-marker' }) })
		}
	}

	// Sort by from position, then by to position (larger range first for same from)
	collected.sort((a, b) => a.from - b.from || b.to - a.to)

	// Add to builder — skip overlapping ranges
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
			if (update.docChanged || update.viewportChanged) this.decorations = buildInlineDecorations(update.view)
		}
	},
	{ decorations: (v) => v.decorations },
)
