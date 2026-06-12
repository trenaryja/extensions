import { createWebviewHtml } from '@repo/vscode-utils'
import * as vscode from 'vscode'

type WebviewMessage =
	| { type: 'ready' }
	| { type: 'edit'; content: string }
	| { type: 'navigate'; url: string }
	| { type: 'webviewError'; message: string; stack: string }

type Settings = {
	mermaidRenderMode: string
}

function readSettings(): Settings {
	const config = vscode.workspace.getConfiguration('markdownLive')
	return {
		mermaidRenderMode: config.get<string>('mermaidRenderMode', 'inline'),
	}
}

export class MarkdownLiveEditorProvider implements vscode.CustomTextEditorProvider {
	static readonly viewType = 'markdownLive.editor'

	static register(context: vscode.ExtensionContext): vscode.Disposable {
		return vscode.window.registerCustomEditorProvider(
			MarkdownLiveEditorProvider.viewType,
			new MarkdownLiveEditorProvider(context),
			{
				webviewOptions: { retainContextWhenHidden: true },
				supportsMultipleEditorsPerDocument: false,
			},
		)
	}

	constructor(private readonly context: vscode.ExtensionContext) {}

	async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
		const localRoots = [
			vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
			...(workspaceFolder ? [workspaceFolder.uri] : []),
			vscode.Uri.joinPath(document.uri, '..'),
		]

		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: localRoots,
		}
		webviewPanel.webview.html = this.getHtml(webviewPanel.webview)

		// True while we're applying an edit that originated from the webview.
		// Prevents echoing our own changes back and resetting the cursor.
		let pendingWebviewEdit = false

		const sendUpdate = () => {
			webviewPanel.webview.postMessage({ type: 'update', content: document.getText() })
		}

		webviewPanel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
			if (msg.type === 'ready') {
				webviewPanel.webview.postMessage({
					type: 'init',
					content: document.getText(),
					settings: readSettings(),
				})
				return
			}
			if (msg.type === 'edit') {
				pendingWebviewEdit = true
				try {
					const edit = new vscode.WorkspaceEdit()
					edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), msg.content)
					await vscode.workspace.applyEdit(edit)
				} finally {
					pendingWebviewEdit = false
				}
			}
			if (msg.type === 'webviewError') {
				vscode.window.showErrorMessage(`Markdown Live (webview): ${msg.message}`)
				console.error('[Markdown Live] Webview error:', msg.message, msg.stack)
			}
			if (msg.type === 'navigate') {
				const url = msg.url
				if (/^https?:\/\//i.test(url)) {
					vscode.env.openExternal(vscode.Uri.parse(url))
				} else {
					// Relative path — resolve relative to the current document's directory
					const resolved = vscode.Uri.joinPath(document.uri, '..', url)
					vscode.commands.executeCommand('vscode.openWith', resolved, MarkdownLiveEditorProvider.viewType)
				}
			}
		})

		// Only push external changes (undo/redo, edits from another editor) back into the webview.
		// Changes we caused ourselves are skipped to avoid resetting the cursor.
		const changeDisposable = vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
			if (e.document.uri.toString() !== document.uri.toString()) return
			if (pendingWebviewEdit) return
			sendUpdate()
		})

		// Watch for settings changes and push them to the webview.
		const configDisposable = vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
			if (!e.affectsConfiguration('markdownLive')) return
			webviewPanel.webview.postMessage({ type: 'settingsUpdate', settings: readSettings() })
		})

		webviewPanel.onDidDispose(() => {
			changeDisposable.dispose()
			configDisposable.dispose()
		})
	}

	private getHtml(webview: vscode.Webview): string {
		return createWebviewHtml({
			webview,
			scriptUri: vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'),
			title: 'Markdown Live',
			headStyles: `    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overflow: hidden; }
    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
    }
    #editor { height: 100vh; overflow-y: auto; }
    .cm-editor { height: 100%; }
    .cm-scroller { overflow: auto; }`,
			bodyHtml: '<div id="editor"></div>',
		})
	}
}
