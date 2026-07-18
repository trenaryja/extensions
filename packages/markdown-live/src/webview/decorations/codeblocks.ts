import { type EditorState, RangeSetBuilder, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { type BundledLanguage, bundledLanguages, bundledThemes, createHighlighterCore } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { docOrSelectionChanged, selectionTouches } from './active'

// ---------- Highlighter singleton (pure JS engine — no WASM, CSP-safe) ----------

const highlighterPromise = createHighlighterCore({
	themes: [bundledThemes['dark-plus'], bundledThemes['light-plus']],
	langs: [],
	engine: createJavaScriptRegexEngine(),
})

function getTheme() {
	const kind = document.body.dataset.vscodeThemeKind ?? ''
	return kind.includes('light') ? 'light-plus' : 'dark-plus'
}

// ---------- Widget ----------

class CodeBlockWidget extends WidgetType {
	constructor(
		private lang: string,
		private code: string,
	) {
		super()
	}

	eq(other: CodeBlockWidget) {
		return other.lang === this.lang && other.code === this.code
	}

	toDOM() {
		const wrapper = document.createElement('div')
		wrapper.className = 'md-codeblock-widget'

		// Header: language label (left) + copy button (right, visible on hover)
		const header = document.createElement('div')
		header.className = 'md-codeblock-header'

		const langLabel = document.createElement('span')
		langLabel.className = 'md-codeblock-lang'
		langLabel.textContent = this.lang
		header.appendChild(langLabel)

		const copyBtn = document.createElement('button')
		copyBtn.className = 'md-codeblock-copy'
		copyBtn.textContent = 'Copy'
		// Don't let interacting with the copy button place the cursor / reveal the block's source.
		copyBtn.addEventListener('mousedown', (event) => event.stopPropagation())
		copyBtn.addEventListener('click', () => {
			navigator.clipboard.writeText(this.code).then(() => {
				copyBtn.textContent = 'Copied!'
				setTimeout(() => {
					copyBtn.textContent = 'Copy'
				}, 2000)
			})
		})
		header.appendChild(copyBtn)
		wrapper.appendChild(header)

		// Placeholder while Shiki loads
		const pre = document.createElement('pre')
		pre.className = 'md-codeblock-plain'
		const codeEl = document.createElement('code')
		codeEl.textContent = this.code
		pre.appendChild(codeEl)
		wrapper.appendChild(pre)

		// Capture locals so the closure works even if the widget is GC'd
		const { lang, code } = this
		const theme = getTheme()

		highlighterPromise.then(async (hl) => {
			try {
				let resolvedLang = 'text'
				if (lang && lang in bundledLanguages) {
					if (!hl.getLoadedLanguages().includes(lang)) {
						await hl.loadLanguage(bundledLanguages[lang as BundledLanguage])
					}
					resolvedLang = lang
				}

				const html = hl.codeToHtml(code, {
					lang: resolvedLang,
					theme,
					transformers: [
						{
							pre(node) {
								// Let our CSS control background
								delete node.properties['style']
							},
						},
					],
				})

				if (!wrapper.contains(pre)) return // widget was already replaced
				const shikiDiv = document.createElement('div')
				shikiDiv.className = 'md-codeblock-shiki'
				shikiDiv.innerHTML = html
				wrapper.replaceChild(shikiDiv, pre)
			} catch (err) {
				console.error('[markdown-live] shiki highlight error:', err)
			}
		})

		return wrapper
	}

	ignoreEvent(event: Event) {
		// Let a mousedown through so clicking the block places the cursor and reveals the source to edit.
		return event.type !== 'mousedown'
	}
}

// ---------- StateField ----------

const FENCE_OPEN_RE = /^```(\w+)?\s*$/

function buildCodeBlockDecorations(state: EditorState): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const doc = state.doc
	const lines = doc.lines

	let lineNum = 1
	while (lineNum <= lines) {
		const line = doc.line(lineNum)
		const match = FENCE_OPEN_RE.exec(line.text)

		if (!match) {
			lineNum++
			continue
		}

		const lang = (match[1] ?? '').toLowerCase()

		// Mermaid blocks are owned by mermaidPlugin — skip them
		if (lang === 'mermaid') {
			for (lineNum++; lineNum <= lines; lineNum++) {
				if (/^```\s*$/.test(doc.line(lineNum).text)) break
			}
			lineNum++
			continue
		}

		const blockStart = lineNum
		const codeLines: string[] = []
		let closed = false

		for (lineNum++; lineNum <= lines; lineNum++) {
			if (/^```\s*$/.test(doc.line(lineNum).text)) {
				closed = true
				break
			}
			codeLines.push(doc.line(lineNum).text)
		}

		if (!closed) break // unterminated fence at end of doc — leave as-is

		const from = doc.line(blockStart).from
		const to = doc.line(lineNum).to

		// Reveal the raw block (editable) while the cursor is inside it; otherwise render the widget.
		if (!selectionTouches(state, from, to))
			builder.add(from, to, Decoration.replace({ widget: new CodeBlockWidget(lang, codeLines.join('\n')) }))

		lineNum++
	}

	return builder.finish()
}

export const codeblocksPlugin = StateField.define<DecorationSet>({
	create(state) {
		return buildCodeBlockDecorations(state)
	},
	update(decorations, transaction) {
		if (!docOrSelectionChanged(transaction)) return decorations
		return buildCodeBlockDecorations(transaction.state)
	},
	provide(field) {
		return EditorView.decorations.from(field)
	},
})
