import { createWebviewHtml } from '@repo/vscode-utils'
import * as vscode from 'vscode'
import { getConfig } from './config'
import { EDITOR_VIEW_TYPE } from './contributes'
import { resolveShikiThemeByName } from './shikiTheme'

type WebviewMessage =
	| { type: 'ready' }
	| { type: 'edit'; content: string }
	| { type: 'navigate'; url: string }
	| { type: 'webviewError'; message: string; stack: string }
	| { type: 'requestShikiTheme'; name: string }

const readSettings = () => ({
	mermaidRenderMode: getConfig('markdownLive.mermaidRenderMode'),
	callouts: getConfig('markdownLive.callouts'),
})

// The most recently active Markdown Live editor — the target for insert commands, since custom editors
// don't set vscode.window.activeTextEditor. It persists while a picker is open (which deactivates the webview).
let activePanel: vscode.WebviewPanel | null = null

export const insertIntoActiveEditor = (text: string) => {
	const panel = activePanel
	if (!panel) return void vscode.window.showWarningMessage('Markdown Live: open a markdown file to insert into.')
	panel.webview.postMessage({ type: 'insert', text })
}

const headStyles = `    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overflow: hidden; }
    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
    }
    #editor { height: 100vh; overflow-y: auto; }
    .cm-editor { height: 100%; }
    .cm-scroller { overflow: auto; }`

const getHtml = (context: vscode.ExtensionContext, webview: vscode.Webview) =>
	createWebviewHtml({
		webview,
		scriptUri: vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.js'),
		styleUris: [
			vscode.Uri.joinPath(context.extensionUri, 'dist', 'codicon.css'),
			vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.css'),
		],
		cspAddons: ' font-src data:;',
		htmlAttrs: 'data-theme="vscode"',
		title: 'Markdown Live',
		headStyles,
		bodyHtml: '<div id="editor"></div>',
	})

const resolveEditor = (
	context: vscode.ExtensionContext,
	document: vscode.TextDocument,
	webviewPanel: vscode.WebviewPanel,
) => {
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
	webviewPanel.webview.options = {
		enableScripts: true,
		localResourceRoots: [
			vscode.Uri.joinPath(context.extensionUri, 'dist'),
			...(workspaceFolder ? [workspaceFolder.uri] : []),
			vscode.Uri.joinPath(document.uri, '..'),
		],
	}
	webviewPanel.webview.html = getHtml(context, webviewPanel.webview)
	activePanel = webviewPanel

	// True while we apply an edit that came from the webview — prevents echoing it back and resetting the cursor.
	let pendingWebviewEdit = false
	const sendUpdate = () => webviewPanel.webview.postMessage({ type: 'update', content: document.getText() })
	// Resolve a VS Code theme (by the name the webview observed, else the setting) to a Shiki theme.
	const sendShikiTheme = async (name: string) =>
		webviewPanel.webview.postMessage({ type: 'shikiTheme', theme: await resolveShikiThemeByName(name) })

	webviewPanel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
		if (msg.type === 'ready')
			return webviewPanel.webview.postMessage({ type: 'init', content: document.getText(), settings: readSettings() })

		if (msg.type === 'requestShikiTheme') return sendShikiTheme(msg.name)

		if (msg.type === 'edit') {
			pendingWebviewEdit = true
			try {
				const edit = new vscode.WorkspaceEdit()
				edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), msg.content)
				await vscode.workspace.applyEdit(edit)
			} finally {
				pendingWebviewEdit = false
			}
			return
		}

		if (msg.type === 'webviewError') {
			vscode.window.showErrorMessage(`Markdown Live (webview): ${msg.message}`)
			return console.error('[Markdown Live] Webview error:', msg.message, msg.stack)
		}

		if (msg.type === 'navigate') {
			if (/^https?:\/\//i.test(msg.url)) return vscode.env.openExternal(vscode.Uri.parse(msg.url))
			const resolved = vscode.Uri.joinPath(document.uri, '..', msg.url)
			// Open .md targets in Markdown Live; everything else (images, etc.) with the default editor/viewer.
			if (/\.md$/i.test(resolved.path))
				return vscode.commands.executeCommand('vscode.openWith', resolved, EDITOR_VIEW_TYPE)
			return vscode.commands.executeCommand('vscode.open', resolved)
		}
	})

	// Push external changes (undo/redo, edits from another editor) back into the webview; skip our own.
	const changeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
		if (e.document.uri.toString() !== document.uri.toString() || pendingWebviewEdit) return
		sendUpdate()
	})
	const configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration('markdownLive'))
			webviewPanel.webview.postMessage({ type: 'settingsUpdate', settings: readSettings() })
	})
	// Backup for committed theme changes (the webview also drives this live via requestShikiTheme).
	const themeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration('workbench.colorTheme')) sendShikiTheme('')
	})
	const viewStateDisposable = webviewPanel.onDidChangeViewState(() => {
		if (webviewPanel.active) activePanel = webviewPanel
	})
	webviewPanel.onDidDispose(() => {
		changeDisposable.dispose()
		configDisposable.dispose()
		themeDisposable.dispose()
		viewStateDisposable.dispose()
		if (activePanel === webviewPanel) activePanel = null
	})
}

/** Register the Markdown Live custom editor — a plain object implementing the provider interface, no class. */
export const registerMarkdownLiveEditor = (context: vscode.ExtensionContext) =>
	vscode.window.registerCustomEditorProvider(
		EDITOR_VIEW_TYPE,
		{ resolveCustomTextEditor: (document, webviewPanel) => resolveEditor(context, document, webviewPanel) },
		{ webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: false },
	)
