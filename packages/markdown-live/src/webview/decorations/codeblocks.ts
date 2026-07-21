import { StateEffect } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
import { type BundledLanguage, bundledLanguages, bundledThemes, createHighlighterCore } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { defineWidget } from '../lib/widget'

// Shiki service for code blocks (Model C+): the fenced block stays real, editable CodeMirror text; the tree
// renderer (treeBlocks.ts) paints Shiki colors as inline-style marks — so the editable text is color-identical
// to a Shiki render with no palette shift on focus. This module owns the highlighter, tokenization, the theme
// bridge, and the copy/delete tools; the decorations themselves are emitted from the tree.

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

type ShikiToken = { content: string; color?: string; fontStyle?: number }
const styleFor = (token: ShikiToken) => {
	const parts: string[] = []
	if (token.color) parts.push(`color:${token.color}`)
	const fontStyle = token.fontStyle ?? 0
	if (fontStyle & FONT_ITALIC) parts.push('font-style:italic')
	if (fontStyle & FONT_BOLD) parts.push('font-weight:600')
	if (fontStyle & FONT_UNDERLINE) parts.push('text-decoration:underline')
	return parts.join(';')
}

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
	for (const line of hl.codeToTokens(code, { lang, theme }).tokens)
		for (const token of line)
			if (token.content) result.push({ offset: token.offset, length: token.content.length, style: styleFor(token) })
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

// ---------- Hover-to-reveal tools ----------

// The tools live on the opening fence line, but a code block is many flat sibling lines with no container, so
// CSS can't reveal them on hover of the whole block. Tag the block's `.md-cb-open` line with `md-cb-hovered`
// while the pointer is anywhere over that block; the CSS shows the tools when that class is present.
export const codeHoverTools = ViewPlugin.fromClass(
	class {
		dom: HTMLElement
		hovered: HTMLElement | null = null
		setHovered = (open: HTMLElement | null) => {
			if (open === this.hovered) return
			this.hovered?.classList.remove('md-cb-hovered')
			open?.classList.add('md-cb-hovered')
			this.hovered = open
		}
		onOver = (event: Event) => {
			const line = (event.target as HTMLElement).closest?.('.cm-line') as HTMLElement | null
			if (!line?.classList.contains('md-cb')) return this.setHovered(null)
			// Walk back to the block's opening fence line (where the tools live).
			let open: HTMLElement | null = line
			while (open?.classList.contains('md-cb') && !open.classList.contains('md-cb-open'))
				open = open.previousElementSibling as HTMLElement | null
			this.setHovered(open?.classList.contains('md-cb-open') ? open : null)
		}
		onLeave = () => this.setHovered(null)
		constructor(view: EditorView) {
			this.dom = view.scrollDOM
			this.dom.addEventListener('mouseover', this.onOver)
			this.dom.addEventListener('mouseleave', this.onLeave)
		}
		destroy() {
			this.dom.removeEventListener('mouseover', this.onOver)
			this.dom.removeEventListener('mouseleave', this.onLeave)
		}
	},
)
