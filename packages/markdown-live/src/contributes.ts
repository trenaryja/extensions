import { defineCommands } from '@repo/vscode-utils/registry'
import { type CalloutConfig, DEFAULT_CALLOUTS, resolveCallout } from './callouts.data'
import { CODE_LANGUAGES, CURSOR, MERMAID_EXAMPLES } from './snippets'

// Lazy import keeps this module (and the contributes codegen) free of any top-level `vscode` import.
const insert = async (text: string) => (await import('./editorProvider')).insertIntoActiveEditor(text)
const PALETTE_MD = [{ id: 'commandPalette' as const, when: 'resourceExtname == .md' }]

type CalloutPickItem = import('vscode').QuickPickItem & { type: string }

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
	{
		command: 'markdownLive.insertCodeBlock',
		title: 'Insert Code Block',
		category: 'Markdown Live',
		menus: PALETTE_MD,
		handler: async ({ vscode }) => {
			const lang = await vscode.window.showQuickPick(CODE_LANGUAGES, { placeHolder: 'Code block language' })
			if (!lang) return
			await insert(`\`\`\`${lang}\n${CURSOR}\n\`\`\`\n`)
		},
	},
	{
		command: 'markdownLive.insertCallout',
		title: 'Insert Callout',
		category: 'Markdown Live',
		menus: PALETTE_MD,
		handler: async ({ vscode }) => {
			const config = vscode.workspace.getConfiguration().get<CalloutConfig>('markdownLive.callouts') ?? {}
			const types = [...new Set([...Object.keys(DEFAULT_CALLOUTS), ...Object.keys(config)])].filter(
				(t) => t !== 'default',
			)
			const items: CalloutPickItem[] = types.map((type) => {
				const icon = resolveCallout(config, type).icon.trim()
				if (icon.startsWith('$(') && icon.endsWith(')'))
					return { label: type, type, iconPath: new vscode.ThemeIcon(icon.slice(2, -1)) }
				if (icon.startsWith('<svg')) return { label: type, type, description: 'custom SVG' }
				return { label: `${icon} ${type}`, type }
			})
			const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Callout type' })
			if (!picked) return
			await insert(`> [!${picked.type}] ${CURSOR}\n> \n`)
		},
	},
	{
		command: 'markdownLive.insertMermaid',
		title: 'Insert Mermaid Diagram',
		category: 'Markdown Live',
		menus: PALETTE_MD,
		handler: async ({ vscode }) => {
			const choice = await vscode.window.showQuickPick(Object.keys(MERMAID_EXAMPLES), { placeHolder: 'Diagram type' })
			const example = choice ? MERMAID_EXAMPLES[choice] : undefined
			if (!example) return
			await insert(`\`\`\`mermaid\n${example}${CURSOR}\n\`\`\`\n`)
		},
	},
] as const)

export type CommandId = (typeof commands)[number]['command']
