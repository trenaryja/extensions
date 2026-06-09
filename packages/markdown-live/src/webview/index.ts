import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { markdownLiveTheme } from './theme'
import { createDecorationExtensions } from './decorations/index'
import type { MermaidRenderMode } from './decorations/mermaid'

declare function acquireVsCodeApi(): {
	postMessage: (msg: unknown) => void
	getState: () => unknown
	setState: (state: unknown) => void
}

const vscode = acquireVsCodeApi()

type Settings = {
	mermaidRenderMode: MermaidRenderMode
}

type InitMessage = { type: 'init'; content: string; settings: Settings }
type UpdateMessage = { type: 'update'; content: string }
type SettingsUpdateMessage = { type: 'settingsUpdate'; settings: Settings }
type ExtensionMessage = InitMessage | UpdateMessage | SettingsUpdateMessage

let currentSettings: Settings = { mermaidRenderMode: 'inline' }
let view: EditorView | null = null
let sendTimer: ReturnType<typeof setTimeout> | null = null

function getMermaidMode(): MermaidRenderMode {
	return currentSettings.mermaidRenderMode
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
			markdownLiveTheme,
			...createDecorationExtensions(getMermaidMode),
			EditorView.domEventHandlers({
				click(event) {
					const target = event.target as HTMLElement
					const linkEl = target.closest('.md-link-text') as HTMLElement | null
					if (!linkEl) return
					const url = linkEl.getAttribute('title') ?? ''
					if (url) vscode.postMessage({ type: 'navigate', url })
					event.preventDefault()
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

	if (msg.type === 'init') {
		currentSettings = msg.settings
		if (view) {
			// Already have an editor — just update content and settings
			applyExternalUpdate(msg.content)
		} else {
			try {
				view = createEditor(msg.content)
				view.focus()
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
		return
	}

	if (msg.type === 'update') {
		applyExternalUpdate(msg.content)
		return
	}

	if (msg.type === 'settingsUpdate') {
		currentSettings = msg.settings
		// Re-apply decorations by forcing a viewport update
		if (view) {
			// Dispatching an empty transaction triggers a redraw with the new settings
			view.dispatch({})
		}
	}
})

// Signal ready — the extension will respond with `init`
vscode.postMessage({ type: 'ready' })
