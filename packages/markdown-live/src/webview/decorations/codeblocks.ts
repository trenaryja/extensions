import { StateEffect } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
import { type BundledLanguage, bundledLanguages, bundledThemes, createHighlighterCore } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { defineWidget } from '../lib/widget'

// Shiki service for code blocks (Model C+): the fenced block stays real, editable CodeMirror text; Shiki
// tokenizes it and the tree renderer (treeBlocks.ts) paints the colors as inline-style marks — so the editable
// text is color-identical to a Shiki render with no palette shift on focus. This module owns the highlighter,
// tokenization, theme bridge, and the copy/delete tools; the actual decorations are emitted from the tree.

// @shikijs/vscode-textmate FontStyle bitmask (avoid importing the enum).
const FONT_ITALIC = 1
const FONT_BOLD = 2
const FONT_UNDERLINE = 4

// Pure-JS engine (no WASM / eval) — same CSP-safe path used elsewhere.
const highlighterPromise = createHighlighterCore({
	themes: [bundledThemes['dark-plus'], bundledThemes['light-plus']],
	langs: [],
	engine: createJavaScriptRegexEngine(),
})
let highlighter: Awaited<typeof highlighterPromise> | null = null
highlighterPromise.then((hl) => {
	highlighter = hl
	if (pendingTheme) {
		const theme = pendingTheme
		pendingTheme = null
		loadCustomTheme(hl, theme)
	}
	requestRefresh?.()
})

const loadedLangs = new Set<string>()
const loadingLangs = new Set<string>()
const loadedThemes = new Set<string>()
// Set by the live view (treeBlocks) so async work (highlighter/language load, theme change) can force a rebuild.
let requestRefresh: (() => void) | null = null

// Effect the tree renderer listens for to rebuild when Shiki state changes; and the hook to wire the refresh.
export const refresh = StateEffect.define<null>()
export const setCodeRefresh = (fn: (() => void) | null) => {
	requestRefresh = fn
}

// The user's active VS Code theme, resolved host-side and loaded into Shiki; null → fall back by kind.
let customThemeName: string | null = null
let pendingTheme: Record<string, unknown> | null = null

export const getTheme = () =>
	customThemeName ?? (document.body.dataset.vscodeThemeKind?.includes('light') ? 'light-plus' : 'dark-plus')

export type Token = { offset: number; length: number; style: string }
const tokenCache = new Map<string, Token[]>()

// Tokenize a block's code with Shiki. Returns null (and kicks off an async language load + refresh) until the
// highlighter and language are ready; results are cached by lang+theme+code. Offsets are absolute into `code`.
export function tokenize(lang: string, code: string, theme: string): Token[] | null {
	const hl = highlighter
	if (!hl || !(lang in bundledLanguages)) return null
	if (!loadedLangs.has(lang)) {
		if (!loadingLangs.has(lang)) {
			loadingLangs.add(lang)
			hl.loadLanguage(bundledLanguages[lang as BundledLanguage]).then(() => {
				loadedLangs.add(lang)
				loadingLangs.delete(lang)
				requestRefresh?.()
			})
		}
		return null
	}

	const key = `${lang} ${theme} ${code}`
	const cached = tokenCache.get(key)
	if (cached) return cached

	const result: Token[] = []
	for (const line of hl.codeToTokens(code, { lang, theme }).tokens) {
		for (const token of line) {
			if (!token.content) continue
			const parts: string[] = []
			if (token.color) parts.push(`color:${token.color}`)
			const fontStyle = token.fontStyle ?? 0
			if (fontStyle & FONT_ITALIC) parts.push('font-style:italic')
			if (fontStyle & FONT_BOLD) parts.push('font-weight:600')
			if (fontStyle & FONT_UNDERLINE) parts.push('text-decoration:underline')
			result.push({ offset: token.offset, length: token.content.length, style: parts.join(';') })
		}
	}
	tokenCache.set(key, result)
	return result
}

async function loadCustomTheme(hl: Awaited<typeof highlighterPromise>, theme: Record<string, unknown>) {
	const name = typeof theme.name === 'string' ? theme.name : ''
	try {
		if (name && !loadedThemes.has(name)) {
			await hl.loadTheme(theme as Parameters<typeof hl.loadTheme>[number])
			loadedThemes.add(name)
		}
		customThemeName = name || null
	} catch {
		customThemeName = null
	}
	tokenCache.clear()
	requestRefresh?.()
}

/** Apply the user's active VS Code theme (resolved host-side) to Shiki, or fall back to dark/light-plus. */
export function setShikiTheme(theme: Record<string, unknown> | null) {
	if (!theme) {
		customThemeName = null
		pendingTheme = null
	} else if (highlighter) {
		loadCustomTheme(highlighter, theme)
		return
	} else {
		pendingTheme = theme
		return
	}
	tokenCache.clear()
	requestRefresh?.()
}

// ---------- Copy / delete tools ----------

export const toolButton = (label: string, title: string, onClick: () => void) => {
	const button = document.createElement('button')
	button.type = 'button'
	button.className = 'md-cb-btn'
	button.textContent = label
	button.title = title
	// Don't let interacting with a tool move the cursor into the block.
	button.addEventListener('mousedown', (event) => event.stopPropagation())
	button.addEventListener('click', (event) => {
		event.stopPropagation()
		onClick()
	})
	return button
}

export const toolsWidget = defineWidget<{ code: string; from: number; to: number }>({
	eq: (a, b) => a.from === b.from && a.to === b.to && a.code === b.code,
	toDOM: (value, view) => {
		const tools = document.createElement('span')
		tools.className = 'md-cb-tools'
		tools.contentEditable = 'false'
		const copy = toolButton('Copy', 'Copy code', () => {
			navigator.clipboard.writeText(value.code).then(() => {
				copy.textContent = 'Copied!'
				setTimeout(() => (copy.textContent = 'Copy'), 1500)
			})
		})
		const remove = toolButton('Delete', 'Delete code block', () => {
			const to = Math.min(value.to + 1, view.state.doc.length) // also eat the trailing newline
			view.dispatch({ changes: { from: value.from, to, insert: '' } })
		})
		tools.append(copy, remove)
		return tools
	},
})

// ---------- Horizontal scroll sync ----------

// A code block is many separate line elements, each its own overflow-x scroller (so code doesn't wrap). Walk
// the contiguous `.md-cb` siblings that make up one block.
const codeBlockLines = (line: HTMLElement) => {
	const lines = [line]
	for (
		let s = line.previousElementSibling;
		s instanceof HTMLElement && s.classList.contains('md-cb');
		s = s.previousElementSibling
	)
		lines.push(s)
	for (
		let s = line.nextElementSibling;
		s instanceof HTMLElement && s.classList.contains('md-cb');
		s = s.nextElementSibling
	)
		lines.push(s)
	return lines
}

// Keep every line of a code block at the same horizontal scroll, so the block scrolls (and follows the caret)
// as one unit rather than line-by-line.
export const codeScrollSync = ViewPlugin.fromClass(
	class {
		scroller: HTMLElement
		syncing = false
		onScroll = (event: Event) => {
			const line = event.target
			if (this.syncing || !(line instanceof HTMLElement) || !line.classList.contains('md-cb')) return
			this.syncing = true
			const left = line.scrollLeft
			for (const sibling of codeBlockLines(line))
				if (sibling !== line && sibling.scrollLeft !== left) sibling.scrollLeft = left
			this.syncing = false
		}
		constructor(view: EditorView) {
			this.scroller = view.scrollDOM
			this.scroller.addEventListener('scroll', this.onScroll, true) // capture — scroll events don't bubble
		}
		destroy() {
			this.scroller.removeEventListener('scroll', this.onScroll, true)
		}
	},
)
