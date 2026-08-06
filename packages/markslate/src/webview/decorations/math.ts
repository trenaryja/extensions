import { type EditorState, RangeSetBuilder, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js'
import { mathjax } from 'mathjax-full/js/mathjax.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { defineWidget } from '../lib/widget'
import { docOrSelectionChanged, selectionTouches } from './active'
import { toolButton } from './codeblocks'

// MathJax → SVG, headless via liteAdaptor (works in the CSP webview, renders synchronously). `fontCache:
// local` makes each SVG self-contained (its own glyph <defs>), so any equation is directly copyable/exportable.
const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)
const mathDocument = mathjax.document('', {
	InputJax: new TeX({ packages: AllPackages }),
	OutputJax: new SVG({ fontCache: 'local' }),
})

// Cache SVG by input — rendering is sync so this is purely to avoid recomputing on every rebuild.
const svgCache = new Map<string, string>()
const renderMath = (latex: string, display: boolean) => {
	const key = `${display ? 'd' : 'i'} ${latex}`
	const cached = svgCache.get(key)
	if (cached) return cached
	let svg: string
	try {
		svg = adaptor.innerHTML(mathDocument.convert(latex, { display }))
	} catch (err) {
		svg = `<span class="md-math-error">${err instanceof Error ? err.message : String(err)}</span>`
	}
	svgCache.set(key, svg)
	return svg
}

// Exported SVG color (settings): `currentColor` (default, inherits at paste target), `theme` (bake the
// editor foreground), or any CSS color.
let exportColor = 'currentColor'
export const setMathExportColor = (color: string) => {
	exportColor = color || 'currentColor'
}
const exportSvg = (latex: string) => {
	const svg = renderMath(latex, true)
	if (exportColor === 'currentColor') return svg
	const color =
		exportColor === 'theme'
			? getComputedStyle(document.body).getPropertyValue('--vscode-editor-foreground').trim() || '#1a1a1a'
			: exportColor
	return svg.replaceAll('currentColor', color)
}

// --- Widgets ---

const editable = (event: Event) => event.type !== 'mousedown'

const inlineMathWidget = defineWidget<{ latex: string }>({
	eq: (a, b) => a.latex === b.latex,
	ignoreEvent: editable,
	toDOM: (value) => {
		const span = document.createElement('span')
		span.className = 'md-math md-math-inline'
		span.innerHTML = renderMath(value.latex, false)
		return span
	},
})

const blockMathWidget = defineWidget<{ latex: string }>({
	eq: (a, b) => a.latex === b.latex,
	ignoreEvent: editable,
	toDOM: (value) => {
		const wrap = document.createElement('div')
		wrap.className = 'md-math md-math-block'
		const tools = document.createElement('div')
		tools.className = 'md-math-tools'
		tools.contentEditable = 'false'
		tools.append(
			toolButton('Copy SVG', 'Copy equation as SVG', () => {
				navigator.clipboard.writeText(exportSvg(value.latex))
			}),
		)
		const svg = document.createElement('div')
		svg.className = 'md-math-svg'
		svg.innerHTML = renderMath(value.latex, true)
		wrap.append(tools, svg)
		return wrap
	},
})

// --- Parsing helpers ---

// Inline `$…$`, currency-safe: opening `$` not escaped / not part of `$$`, no space just inside, closing `$`
// not followed by a digit. `\.` allows escaped chars inside.
const INLINE_MATH_RE = /(?<![\\$])\$(?!\s)((?:[^$\\]|\\.)+?)(?<!\s)\$(?!\d)/g
const FENCE_MATH_RE = /^```(math|latex|tex)\s*$/i
const FENCE_RE = /^```/

// Parse a `$$…$$` block starting at `startNum`; returns the end line and inner LaTeX, or null.
function parseBlockDollar(doc: EditorState['doc'], startNum: number) {
	const trimmed = doc.line(startNum).text.trim()
	if (!trimmed.startsWith('$$')) return null
	if (trimmed.length > 3 && trimmed.endsWith('$$')) return { endNum: startNum, latex: trimmed.slice(2, -2).trim() }
	const content = trimmed.slice(2) ? [trimmed.slice(2)] : []
	for (let next = startNum + 1; next <= doc.lines; next++) {
		const text = doc.line(next).text
		const lineTrimmed = text.trim()
		if (lineTrimmed.endsWith('$$')) {
			const before = lineTrimmed.slice(0, -2)
			if (before.trim()) content.push(before)
			return { endNum: next, latex: content.join('\n').trim() }
		}
		content.push(text)
	}
	return null
}

// --- Builder ---

function buildMathDecorations(state: EditorState): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const doc = state.doc

	// A block equation: replace with the SVG when the cursor is away; reveal the source with the SVG rendered
	// just below while editing (live preview, like mermaid).
	const addBlock = (from: number, to: number, latex: string) => {
		if (selectionTouches(state, from, to))
			builder.add(to, to, Decoration.widget({ widget: blockMathWidget({ latex }), side: 1 }))
		else builder.add(from, to, Decoration.replace({ widget: blockMathWidget({ latex }) }))
	}

	let inFrontMatter = false
	let inCodeBlock = false
	let lineNum = 1
	while (lineNum <= doc.lines) {
		const line = doc.line(lineNum)
		const text = line.text

		// Front matter (opening `---` on line 1 through its closing `---`).
		if (lineNum === 1 && /^---\s*$/.test(text)) {
			inFrontMatter = true
			lineNum++
			continue
		}
		if (inFrontMatter) {
			if (/^---\s*$/.test(text)) inFrontMatter = false
			lineNum++
			continue
		}

		// Fences: `math`/`latex`/`tex` render as block math; other fences are code — skip their contents.
		if (FENCE_RE.test(text)) {
			if (!inCodeBlock && FENCE_MATH_RE.test(text)) {
				let closeNum = lineNum
				const body: string[] = []
				for (let next = lineNum + 1; next <= doc.lines; next++) {
					if (FENCE_RE.test(doc.line(next).text)) {
						closeNum = next
						break
					}
					body.push(doc.line(next).text)
				}
				if (closeNum > lineNum) {
					addBlock(line.from, doc.line(closeNum).to, body.join('\n').trim())
					lineNum = closeNum + 1
					continue
				}
			}
			inCodeBlock = !inCodeBlock
			lineNum++
			continue
		}
		if (inCodeBlock) {
			lineNum++
			continue
		}

		// Block `$$…$$` (own line).
		if (text.trim().startsWith('$$')) {
			const block = parseBlockDollar(doc, lineNum)
			if (block) {
				addBlock(line.from, doc.line(block.endNum).to, block.latex)
				lineNum = block.endNum + 1
				continue
			}
		}

		// Inline `$…$`.
		INLINE_MATH_RE.lastIndex = 0
		for (let match = INLINE_MATH_RE.exec(text); match; match = INLINE_MATH_RE.exec(text)) {
			const from = line.from + match.index
			const to = from + match[0].length
			const latex = match[1] ?? ''
			if (!selectionTouches(state, from, to))
				builder.add(from, to, Decoration.replace({ widget: inlineMathWidget({ latex }) }))
		}

		lineNum++
	}

	return builder.finish()
}

export const mathPlugin = StateField.define<DecorationSet>({
	create: buildMathDecorations,
	update(decorations, transaction) {
		if (!docOrSelectionChanged(transaction)) return decorations
		return buildMathDecorations(transaction.state)
	},
	provide: (field) => EditorView.decorations.from(field),
})
