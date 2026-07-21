import { syntaxTree } from '@codemirror/language'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'

// Strikethrough isn't in the CommonMark tree (it's GFM), so it stays a lightweight regex pass.
const STRIKE_RE = /~~(.+?)~~/g

// Hidden syntax collapses out of layout entirely (no line-height cost) and is atomic, so the cursor
// skips over it — until the selection enters the span, at which point the raw markdown is revealed.
const hide = Decoration.replace({})

// Lezer node name → { style class, mark-child node name to hide }.
const INLINE: Record<string, { cls: string; mark: string }> = {
	StrongEmphasis: { cls: 'md-bold', mark: 'EmphasisMark' },
	Emphasis: { cls: 'md-italic', mark: 'EmphasisMark' },
	InlineCode: { cls: 'md-code-inline', mark: 'CodeMark' },
}

const styleCache: Record<string, Decoration> = {}
const styleFor = (cls: string) => (styleCache[cls] ??= Decoration.mark({ class: cls }))

/** The Obsidian "Live Preview" reveal test: is the selection touching this range? */
const isActive = (view: EditorView, from: number, to: number) =>
	view.state.selection.ranges.some((range) => range.from <= to && range.to >= from)

function buildInline(view: EditorView): DecorationSet {
	const ranges: Array<{ from: number; to: number; deco: Decoration }> = []
	const add = (from: number, to: number, deco: Decoration) => {
		if (to > from) ranges.push({ from, to, deco })
	}

	const tree = syntaxTree(view.state)
	for (const visible of view.visibleRanges) {
		tree.iterate({
			from: visible.from,
			to: visible.to,
			enter: (node) => {
				const spec = INLINE[node.name]
				if (spec) {
					// getChildren returns only this node's own marks — nested emphasis is visited separately,
					// so the syntax tree gives correct nesting for free (e.g. **bold with _italic_ inside**).
					const marks = node.node.getChildren(spec.mark)
					const first = marks[0]
					const last = marks[marks.length - 1]
					add(first ? first.to : node.from, last ? last.from : node.to, styleFor(spec.cls))
					if (!isActive(view, node.from, node.to)) for (const mark of marks) add(mark.from, mark.to, hide)
					return
				}
				if (node.name === 'Link') {
					// Only style navigable links (`[text](url)`). A URL-less `[text]` — e.g. a callout's `[!type]`
					// tag, which the parser also reads as a Link — isn't a real link, so leave it as plain text.
					const urlNode = node.node.getChild('URL')
					if (!urlNode) return
					const marks = node.node.getChildren('LinkMark') // [ ] ( )
					const open = marks[0]
					const closeText = marks[1]
					if (!open || !closeText) return
					const url = view.state.sliceDoc(urlNode.from, urlNode.to)
					add(
						open.to,
						closeText.from,
						Decoration.mark({ class: 'md-link-text', attributes: { title: `⌘/Ctrl-click to open · ${url}` } }),
					)
					if (!isActive(view, node.from, node.to)) {
						add(open.from, open.to, hide) // [
						add(closeText.from, node.to, hide) // ](url)
					}
				}
				if (node.name === 'Image') {
					// Style just the URL of an image like a link (visible only while editing — otherwise the
					// blocks plugin replaces the line with the rendered <img>). ⌘/Ctrl-click opens it.
					const urlNode = node.node.getChild('URL')
					if (urlNode) {
						const url = view.state.sliceDoc(urlNode.from, urlNode.to)
						add(
							urlNode.from,
							urlNode.to,
							Decoration.mark({ class: 'md-link-text', attributes: { title: `⌘/Ctrl-click to open · ${url}` } }),
						)
					}
				}
			},
		})
	}

	const doc = view.state.doc
	for (const visible of view.visibleRanges) {
		const start = doc.lineAt(visible.from).number
		const end = doc.lineAt(visible.to).number
		for (let lineNum = start; lineNum <= end; lineNum++) {
			const line = doc.line(lineNum)
			if (line.text.startsWith('```')) continue
			for (const match of line.text.matchAll(STRIKE_RE)) {
				const from = line.from + match.index!
				const to = from + match[0].length
				add(from + 2, to - 2, styleFor('md-strikethrough'))
				if (!isActive(view, from, to)) {
					add(from, from + 2, hide)
					add(to - 2, to, hide)
				}
			}
		}
	}

	return Decoration.set(
		ranges.map(({ from, to, deco }) => deco.range(from, to)),
		true,
	)
}

export const inlineDecorationsPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet
		constructor(view: EditorView) {
			this.decorations = buildInline(view)
		}
		update(update: ViewUpdate) {
			// Rebuild on selection change too, so markers reveal/hide as the cursor moves (Live Preview).
			if (update.docChanged || update.viewportChanged || update.selectionSet)
				this.decorations = buildInline(update.view)
		}
	},
	{ decorations: (plugin) => plugin.decorations },
)
