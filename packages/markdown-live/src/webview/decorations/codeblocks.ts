import { syntaxTree } from '@codemirror/language'
import { type EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { type BundledLanguage, bundledLanguages, bundledThemes, createHighlighterCore } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { defineWidget } from '../lib/widget'
import { docOrSelectionChanged, selectionTouches } from './active'

// Shiki service + read-mode render for code blocks. With the cursor inside a block it's editable text (the
// tree renderer in treeBlocks.ts paints Shiki colors as inline marks — no palette shift on focus); with the
// cursor away, codeRenderPlugin (below) replaces the whole block with a self-contained, colored <pre> panel so
// long lines scroll as one unit. This module owns the highlighter, tokenization, theme bridge, tools, and that
// read-mode widget; the editable-state decorations come from the tree.

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

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char] ?? char)

// Render code to a colored HTML string for the read-mode <pre> widget. Returns null until the highlighter and
// language are ready (kicking off the async load + refresh, like tokenize).
export function renderCodeHtml(lang: string, code: string, theme: string): string | null {
	const hl = highlighter
	if (!hl || !(lang in bundledLanguages) || !loadedLangs.has(lang)) {
		tokenize(lang, code, theme) // kicks off the language load + refresh
		return null
	}
	return hl
		.codeToTokens(code, { lang, theme })
		.tokens.map((line) =>
			line.map((token) => `<span style="${styleFor(token)}">${escapeHtml(token.content)}</span>`).join(''),
		)
		.join('\n')
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

// ---------- Read-mode render (a scrollable panel when the cursor is away) ----------

// A code block only scrolls as one unit if it's a single scroll container. So when the cursor isn't inside it,
// replace the whole fenced block with a self-contained, Shiki-colored <pre> panel that scrolls horizontally on
// its own. Editing (cursor inside) falls back to the editable text + chrome from treeBlocks.
// `html` is the pre-rendered colored markup (or null until Shiki is ready). Carrying it in the value makes it
// part of the widget's identity, so the panel re-renders once coloring arrives instead of reusing stale DOM.
const codeRenderWidget = defineWidget<{ html: string | null; code: string; from: number; to: number }>({
	eq: (a, b) => a.html === b.html && a.code === b.code && a.from === b.from && a.to === b.to,
	// Let a mousedown through so clicking the panel places the cursor and reveals the editable source.
	ignoreEvent: (event) => event.type !== 'mousedown',
	toDOM: (value, view) => {
		const wrap = document.createElement('div')
		wrap.className = 'md-code-render'

		const tools = document.createElement('div')
		tools.className = 'md-cb-tools'
		tools.contentEditable = 'false'
		const copy = toolButton('Copy', 'Copy code', () => {
			navigator.clipboard.writeText(value.code).then(() => {
				copy.textContent = 'Copied!'
				setTimeout(() => (copy.textContent = 'Copy'), 1500)
			})
		})
		const remove = toolButton('Delete', 'Delete code block', () =>
			view.dispatch({ changes: { from: value.from, to: Math.min(value.to + 1, view.state.doc.length), insert: '' } }),
		)
		tools.append(copy, remove)

		const pre = document.createElement('pre')
		pre.className = 'md-code-pre'
		if (value.html) pre.innerHTML = value.html
		else pre.textContent = value.code

		wrap.append(tools, pre)
		return wrap
	},
})

const RENDER_SKIP = new Set(['mermaid', 'math', 'latex', 'tex']) // these fences are owned by their own plugins

function buildCodeRender(state: EditorState): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const doc = state.doc
	const theme = getTheme()
	syntaxTree(state).iterate({
		enter: (node) => {
			if (node.name !== 'FencedCode') return
			if (selectionTouches(state, node.from, node.to)) return // editing → editable text (treeBlocks chrome)
			const info = node.node.getChild('CodeInfo')
			const lang = info ? doc.sliceString(info.from, info.to).trim().toLowerCase() : ''
			if (RENDER_SKIP.has(lang)) return
			const chunks: string[] = []
			for (let child = node.node.firstChild; child; child = child.nextSibling)
				if (child.name === 'CodeText') chunks.push(doc.sliceString(child.from, child.to))
			const code = chunks.join('')
			const widget = codeRenderWidget({ html: renderCodeHtml(lang, code, theme), code, from: node.from, to: node.to })
			builder.add(node.from, node.to, Decoration.replace({ widget }))
		},
	})
	return builder.finish()
}

// A StateField (not the tree ViewPlugin) so it can emit the multi-line block replacement.
export const codeRenderPlugin = StateField.define<DecorationSet>({
	create: buildCodeRender,
	update(decorations, transaction) {
		const refreshed = transaction.effects.some((effect) => effect.is(refresh))
		if (!refreshed && !docOrSelectionChanged(transaction)) return decorations
		return buildCodeRender(transaction.state)
	},
	provide: (field) => EditorView.decorations.from(field),
})
