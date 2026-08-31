import type { z } from 'zod'
import * as vscode from 'vscode'
import type { CommandEntry } from './registry'

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
	/** Stylesheets linked via `<link>` (resolved with `asWebviewUri`), e.g. a compiled Tailwind bundle. */
	styleUris?: vscode.Uri[]
	headStyles?: string
	bodyHtml?: string
	/** Attributes for the root `<html>` element, e.g. `data-theme="vscode"`. */
	htmlAttrs?: string
	/** Extra CSP directives appended after the defaults, e.g. `" font-src https:;"` */
	cspAddons?: string
}

export function createWebviewHtml({
	webview,
	scriptUri,
	title = 'Extension',
	styleUris = [],
	headStyles,
	bodyHtml,
	htmlAttrs = '',
	cspAddons = '',
}: WebviewHtmlOptions) {
	const src = webview.asWebviewUri(scriptUri)
	const nonce = getNonce()
	const csp = `default-src 'none'; img-src ${webview.cspSource} vscode-resource: https: data:; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';${cspAddons}`
	const linkTags = styleUris.map((uri) => `\n  <link rel="stylesheet" href="${webview.asWebviewUri(uri)}" />`).join('')
	const styleTag = headStyles ? `\n  <style>\n${headStyles}\n  </style>` : ''
	const bodyContent = bodyHtml ? `${bodyHtml}\n  ` : ''
	return `<!DOCTYPE html>
<html lang="en"${htmlAttrs ? ` ${htmlAttrs}` : ''}>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />${linkTags}${styleTag}
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

/** Register every command in a `defineCommands` registry, injecting the extension context into each handler. */
export const registerCommands = (context: vscode.ExtensionContext, commands: readonly CommandEntry[]) => {
	for (const { command, handler } of commands)
		context.subscriptions.push(
			vscode.commands.registerCommand(command, (...args) => handler({ vscode, context }, ...args)),
		)
}

/**
 * Build a typed config accessor from a Zod schema. Reads the setting, validates it, and falls back
 * to the schema default if the stored value is missing or invalid — so a bad setting never throws.
 */
export const createConfig =
	<S extends z.ZodObject>(schema: S) =>
	<K extends string & keyof z.infer<S>>(key: K): z.infer<S>[K] => {
		const field = schema.shape[key] as z.ZodType
		const parsed = field.safeParse(vscode.workspace.getConfiguration().get(key))
		return (parsed.success ? parsed.data : field.parse(undefined)) as z.infer<S>[K]
	}
