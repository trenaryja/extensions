import * as vscode from 'vscode'

export function getNonce() {
	let text = ''
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
	for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length))
	return text
}

export type WebviewHtmlOptions = {
	webview: vscode.Webview
	scriptUri: vscode.Uri
	title?: string
	headStyles?: string
	bodyHtml?: string
	/** Extra CSP directives appended after the defaults, e.g. `" font-src https:;"` */
	cspAddons?: string
}

export function createWebviewHtml({
	webview,
	scriptUri,
	title = 'Extension',
	headStyles,
	bodyHtml,
	cspAddons = '',
}: WebviewHtmlOptions) {
	const src = webview.asWebviewUri(scriptUri)
	const nonce = getNonce()
	const csp = `default-src 'none'; img-src ${webview.cspSource} vscode-resource: https: data:; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';${cspAddons}`
	const styleTag = headStyles ? `\n  <style>\n${headStyles}\n  </style>` : ''
	const bodyContent = bodyHtml ? `${bodyHtml}\n  ` : ''
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />${styleTag}
  <title>${title}</title>
</head>
<body>
  ${bodyContent}<script nonce="${nonce}" src="${src}"></script>
</body>
</html>`
}

export function defaultWebviewOptions(extensionUri: vscode.Uri, extraRoots: vscode.Uri[] = []): vscode.WebviewOptions {
	return {
		enableScripts: true,
		localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist'), ...extraRoots],
	}
}
