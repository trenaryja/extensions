import * as vscode from 'vscode'
import { MarkdownLiveEditorProvider } from './editorProvider'

// Tracks whether each document is currently in live-preview or raw mode.
// Key: document URI string, Value: 'preview' | 'raw'
const modeMap = new Map<string, 'preview' | 'raw'>()

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(MarkdownLiveEditorProvider.register(context))

	context.subscriptions.push(
		vscode.commands.registerCommand('markdownLive.toggle', async () => {
			const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab
			if (!activeTab) return

			const uri = getUriFromTab(activeTab)
			if (!uri || uri.path.slice(-3) !== '.md') return

			const current = modeMap.get(uri.toString()) ?? 'preview'

			if (current === 'preview') {
				modeMap.set(uri.toString(), 'raw')
				await vscode.commands.executeCommand('vscode.openWith', uri, 'default', {
					viewColumn: vscode.ViewColumn.Active,
				})
			} else {
				modeMap.set(uri.toString(), 'preview')
				await vscode.commands.executeCommand('vscode.openWith', uri, 'markdownLive.editor', {
					viewColumn: vscode.ViewColumn.Active,
				})
			}
		}),
	)
}

function getUriFromTab(tab: vscode.Tab): vscode.Uri | undefined {
	const input = tab.input
	if (input instanceof vscode.TabInputText) return input.uri
	if (input instanceof vscode.TabInputCustom) return input.uri
	return undefined
}

export function deactivate() {}
