import { defineCommands } from '@repo/vscode-utils/registry'

/** Custom-editor view type — the id VS Code opens `.md` files with. */
export const EDITOR_VIEW_TYPE = 'markdownLive.editor'

/** Static `contributes.customEditors` entry, fed to the codegen alongside the command registry. */
export const customEditors = [
	{
		viewType: EDITOR_VIEW_TYPE,
		displayName: 'Markdown Live',
		selector: [{ filenamePattern: '*.md' }],
		priority: 'default',
	},
]

// Tracks each document's current mode so the toggle command can flip between the live editor and raw text.
const modeMap = new Map<string, 'preview' | 'raw'>()

/** The command registry — the single source of truth for commands, keybindings, and menu placements. */
export const commands = defineCommands([
	{
		command: 'markdownLive.toggle',
		title: 'Toggle Raw/Preview',
		category: 'Markdown Live',
		icon: '$(book)',
		key: 'ctrl+shift+m',
		mac: 'cmd+shift+m',
		when: 'resourceExtname == .md',
		menus: [{ id: 'editor/title', group: 'navigation', when: 'resourceExtname == .md' }],
		handler: async ({ vscode }) => {
			const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab
			const input = activeTab?.input
			const uri = input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom ? input.uri : undefined
			if (!uri || !uri.path.endsWith('.md')) return

			const next = (modeMap.get(uri.toString()) ?? 'preview') === 'preview' ? 'raw' : 'preview'
			modeMap.set(uri.toString(), next)
			await vscode.commands.executeCommand('vscode.openWith', uri, next === 'raw' ? 'default' : EDITOR_VIEW_TYPE, {
				viewColumn: vscode.ViewColumn.Active,
			})
		},
	},
] as const)

export type CommandId = (typeof commands)[number]['command']
