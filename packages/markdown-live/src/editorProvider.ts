import * as vscode from 'vscode'

type WebviewMessage = { type: 'ready' } | { type: 'edit'; content: string }

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
		webviewPanel.webview.options = { enableScripts: true }
		webviewPanel.webview.html = this.getHtml(webviewPanel.webview)

		// True while we're applying an edit that originated from the webview.
		// Prevents echoing our own changes back and resetting the cursor.
		let pendingWebviewEdit = false

		const sendContent = () => {
			webviewPanel.webview.postMessage({ type: 'update', content: document.getText() })
		}

		webviewPanel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
			if (msg.type === 'ready') {
				sendContent()
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
		})

		// Only push external changes (undo/redo, edits from another editor) back into the webview.
		// Changes we caused ourselves are skipped to avoid resetting the cursor.
		const changeDisposable = vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
			if (e.document.uri.toString() !== document.uri.toString()) return
			if (pendingWebviewEdit) return
			sendContent()
		})

		webviewPanel.onDidDispose(() => changeDisposable.dispose())
	}

	private getHtml(webview: vscode.Webview): string {
		const webviewUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'))
		const nonce = getNonce()

		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';" />
  <title>Markdown Live</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { height: 100%; }
    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${webviewUri}"></script>
</body>
</html>`
	}
}

function getNonce(): string {
	let text = ''
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
	for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length))
	return text
}
