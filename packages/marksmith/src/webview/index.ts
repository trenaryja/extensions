import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { syntaxTree } from '@codemirror/language'
import { marksmithTheme } from './theme'
import { marksmithFind, openFind } from './find'
import { createDecorationExtensions } from './decorations/index'
import { setShikiTheme } from './decorations/codeblocks'
import { applyCallouts } from './decorations/callouts'
import { setMathExportColor } from './decorations/math'
import { setFormatTablesOnEdit } from './decorations/tables'
import { CURSOR } from '../snippets'
import type { CalloutConfig } from '../callouts.data'
import { type MermaidRenderMode, refreshMermaidTheme } from './decorations/mermaid'

declare function acquireVsCodeApi(): {
	postMessage: (msg: unknown) => void
	getState: () => unknown
	setState: (state: unknown) => void
}

const vscode = acquireVsCodeApi()

// Toggle a class while ⌘/Ctrl is held, so links only show the pointer cursor then (a plain click edits).
const syncModifier = (event: KeyboardEvent | MouseEvent) =>
	document.documentElement.classList.toggle('md-mod-held', event.metaKey || event.ctrlKey)
window.addEventListener('keydown', syncModifier)
window.addEventListener('keyup', syncModifier)
window.addEventListener('blur', () => document.documentElement.classList.remove('md-mod-held'))

// Mod+F anywhere in the webview opens find — even when focus is outside CodeMirror (e.g. the table grid).
window.addEventListener('keydown', (event) => {
	if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.key.toLowerCase() !== 'f') return
	if (!view) return
	event.preventDefault()
	openFind(view, event.altKey)
})

// Ask the host to resolve the active VS Code theme to a Shiki theme, and re-ask whenever it changes.
// `data-vscode-theme-name` updates on the body for both committed themes AND live previews.
const requestShikiTheme = () =>
	vscode.postMessage({ type: 'requestShikiTheme', name: document.body.dataset.vscodeThemeName ?? '' })
// On any theme change, re-request the Shiki theme AND re-theme mermaid (which reads --vscode-* CSS vars directly).
const onThemeChange = () => {
	requestShikiTheme()
	if (view) refreshMermaidTheme(view)
}
new MutationObserver(onThemeChange).observe(document.body, {
	attributes: true,
	attributeFilter: ['data-vscode-theme-name', 'data-vscode-theme-kind'],
})
requestShikiTheme()

type Settings = {
	mermaidRenderMode: MermaidRenderMode
	callouts: CalloutConfig
	calloutDefaultTitle: boolean
	mathExportColor: string
	formatTablesOnEdit: boolean
}

type InitMessage = { type: 'init'; content: string; settings: Settings }
type UpdateMessage = { type: 'update'; content: string }
type SettingsUpdateMessage = { type: 'settingsUpdate'; settings: Settings }
type ShikiThemeMessage = { type: 'shikiTheme'; theme: Record<string, unknown> | null }
type InsertMessage = { type: 'insert'; text: string }
type ExtensionMessage = InitMessage | UpdateMessage | SettingsUpdateMessage | ShikiThemeMessage | InsertMessage

let currentSettings: Settings = {
	mermaidRenderMode: 'inline',
	callouts: {},
	calloutDefaultTitle: true,
	mathExportColor: 'currentColor',
	formatTablesOnEdit: true,
}
let view: EditorView | null = null
let sendTimer: ReturnType<typeof setTimeout> | null = null

function getMermaidMode(): MermaidRenderMode {
	return currentSettings.mermaidRenderMode
}

// SyntaxNode type derived from syntaxTree so we don't need a direct @lezer/common dependency.
type MarkdownNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>

// Walk up from a document position to the enclosing Link/Image (or bare autolink URL) and return its URL.
function linkUrlAt(editorView: EditorView, pos: number): string | null {
	let node: MarkdownNode | null = syntaxTree(editorView.state).resolveInner(pos, 0)
	while (node) {
		if (node.name === 'URL') return editorView.state.sliceDoc(node.from, node.to)
		if (node.name === 'Link' || node.name === 'Image') {
			const urlNode = node.getChild('URL')
			return urlNode ? editorView.state.sliceDoc(urlNode.from, urlNode.to) : null
		}
		node = node.parent
	}
	return null
}

function createEditor(content: string): EditorView {
	const container = document.getElementById('editor')
	if (!container) throw new Error('No #editor element')

	const state = EditorState.create({
		doc: content,
		extensions: [
			history(),
			keymap.of([...defaultKeymap, ...historyKeymap]),
			EditorView.lineWrapping,
			markdown({ base: markdownLanguage, codeLanguages: languages }),
			marksmithTheme,
			...marksmithFind,
			...createDecorationExtensions(getMermaidMode),
			EditorView.domEventHandlers({
				// Cmd/Ctrl+click a link to follow it. A plain click just places the cursor (and reveals the
				// raw source), so links stay editable — this works whether the link is rendered or revealed.
				mousedown(event, editorView) {
					if (!event.metaKey && !event.ctrlKey) return false
					const pos = editorView.posAtCoords({ x: event.clientX, y: event.clientY })
					if (pos == null) return false
					const url = linkUrlAt(editorView, pos)
					if (!url) return false
					vscode.postMessage({ type: 'navigate', url })
					event.preventDefault()
					return true
				},
			}),
			EditorView.updateListener.of((update) => {
				if (!update.docChanged) return
				if (sendTimer) clearTimeout(sendTimer)
				sendTimer = setTimeout(() => {
					vscode.postMessage({ type: 'edit', content: update.state.doc.toString() })
				}, 300)
			}),
		],
	})

	return new EditorView({ state, parent: container })
}

function applyExternalUpdate(content: string) {
	if (!view) return
	const currentContent = view.state.doc.toString()
	if (currentContent === content) return

	// Replace entire doc while preserving scroll position as much as possible
	const scrollTop = view.scrollDOM.scrollTop
	view.dispatch({
		changes: { from: 0, to: view.state.doc.length, insert: content },
	})
	view.scrollDOM.scrollTop = scrollTop
}

window.addEventListener('error', (event) => {
	vscode.postMessage({
		type: 'webviewError',
		message: event.message,
		stack: (event.error as Error | null)?.stack ?? '',
	})
})

window.addEventListener('unhandledrejection', (event) => {
	vscode.postMessage({ type: 'webviewError', message: String(event.reason), stack: '' })
})

window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
	const msg = event.data

	if (msg.type === 'shikiTheme') {
		setShikiTheme(msg.theme)
		return
	}

	if (msg.type === 'insert') {
		if (view) {
			const { from, to } = view.state.selection.main
			const atLineStart = from === 0 || view.state.doc.sliceString(from - 1, from) === '\n'
			const raw = (atLineStart ? '' : '\n') + msg.text
			const marker = raw.indexOf(CURSOR)
			const text = marker >= 0 ? raw.replace(CURSOR, '') : raw
			view.dispatch({
				changes: { from, to, insert: text },
				selection: { anchor: from + (marker >= 0 ? marker : text.length) },
			})
			view.focus()
		}
		return
	}

	if (msg.type === 'init') {
		currentSettings = msg.settings
		setMathExportColor(currentSettings.mathExportColor)
		setFormatTablesOnEdit(currentSettings.formatTablesOnEdit)
		if (view) {
			// Already have an editor — just update content and settings
			applyExternalUpdate(msg.content)
		} else {
			try {
				view = createEditor(msg.content)
				view.focus()
				// Harness-only: expose the view so the headless driver can assert caret/selection state.
				if ((window as unknown as { HARNESS_CONTENT?: string }).HARNESS_CONTENT !== undefined)
					(window as unknown as { __mdView?: EditorView }).__mdView = view
			} catch (err) {
				const container = document.getElementById('editor')
				if (container) {
					container.style.cssText = 'padding:2rem;color:#ff6464;font-family:monospace;white-space:pre-wrap'
					container.textContent = `Editor init failed:\n${err instanceof Error ? (err.stack ?? err.message) : String(err)}`
				}
				vscode.postMessage({
					type: 'webviewError',
					message: String(err),
					stack: err instanceof Error ? (err.stack ?? '') : '',
				})
			}
		}
		if (view) applyCallouts(view, currentSettings.callouts, currentSettings.calloutDefaultTitle)
		return
	}

	if (msg.type === 'update') {
		applyExternalUpdate(msg.content)
		return
	}

	if (msg.type === 'settingsUpdate') {
		currentSettings = msg.settings
		setMathExportColor(currentSettings.mathExportColor)
		setFormatTablesOnEdit(currentSettings.formatTablesOnEdit)
		if (view) {
			applyCallouts(view, currentSettings.callouts, currentSettings.calloutDefaultTitle)
			// Mermaid's field only rebuilds on doc/selection changes or its refresh effect — without this,
			// a mermaidRenderMode change wouldn't apply until the next edit or caret move.
			refreshMermaidTheme(view)
		}
	}
})

// Signal ready — the extension will respond with `init`
vscode.postMessage({ type: 'ready' })
