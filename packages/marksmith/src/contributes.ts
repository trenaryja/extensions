import { defineCommands } from '@repo/vscode-utils/registry'
import { type CalloutConfig, CALLOUT_PRIMARIES, resolveCallout } from './callouts.data'
import { CODE_LANGUAGES, CURSOR, MERMAID_EXAMPLES } from './snippets'

// Lazy import keeps this module (and the contributes codegen) free of any top-level `vscode` import.
const insert = async (text: string) => (await import('./editorProvider')).insertIntoActiveEditor(text)
const PALETTE_MD = [{ id: 'commandPalette' as const, when: 'resourceExtname == .md' }]

type CalloutPickItem = import('vscode').QuickPickItem & { type: string }

/** Custom-editor view type — the id VS Code opens `.md` files with. */
export const EDITOR_VIEW_TYPE = 'marksmith.editor'

/** Static `contributes.customEditors` entry, fed to the codegen alongside the command registry. */
export const customEditors = [
	{
		viewType: EDITOR_VIEW_TYPE,
		displayName: 'Marksmith',
		selector: [{ filenamePattern: '*.md' }],
		priority: 'default',
	},
]

/** Get Started walkthrough — surfaced in VS Code's welcome area on install (non-obtrusive), fed via `extra`. */
export const walkthroughs = [
	{
		id: 'marksmith.gettingStarted',
		title: 'Get Started with Marksmith',
		description: 'A live markdown editor that treats your notes like a craft.',
		steps: [
			{
				id: 'playground',
				title: 'Open the playground',
				description:
					'Marksmith renders markdown live and in place — tables, callouts, math, and diagrams, all editable. Open the playground to try it hands-on.\n[Open Playground](command:marksmith.openPlayground)',
				media: { markdown: 'assets/walkthrough/playground.md' },
				completionEvents: ['onCommand:marksmith.openPlayground'],
			},
			{
				id: 'editing',
				title: "It's your markdown editor now",
				description:
					'Marksmith is the default editor for every `.md` file — just open one. Toggle to raw text anytime with ⌘⇧M (Ctrl+Shift+M).',
				media: { markdown: 'assets/walkthrough/editing.md' },
			},
		],
	},
]

// Tracks each document's current mode so the toggle command can flip between the live editor and raw text.
const modeMap = new Map<string, 'preview' | 'raw'>()

/** The command registry — the single source of truth for commands, keybindings, and menu placements. */
export const commands = defineCommands([
	{
		command: 'marksmith.toggle',
		title: 'Toggle Raw/Preview',
		category: 'Marksmith',
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
		command: 'marksmith.insertCodeBlock',
		title: 'Insert Code Block',
		category: 'Marksmith',
		menus: PALETTE_MD,
		handler: async ({ vscode }) => {
			const lang = await vscode.window.showQuickPick(CODE_LANGUAGES, { placeHolder: 'Code block language' })
			if (!lang) return
			await insert(`\`\`\`${lang}\n${CURSOR}\n\`\`\`\n`)
		},
	},
	{
		command: 'marksmith.insertCallout',
		title: 'Insert Callout',
		category: 'Marksmith',
		menus: PALETTE_MD,
		handler: async ({ vscode }) => {
			const config = vscode.workspace.getConfiguration().get<CalloutConfig>('marksmith.callouts') ?? {}
			const types = [...new Set([...CALLOUT_PRIMARIES, ...Object.keys(config)])].filter((t) => t !== 'default')
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
		command: 'marksmith.insertMermaid',
		title: 'Insert Mermaid Diagram',
		category: 'Marksmith',
		menus: PALETTE_MD,
		handler: async ({ vscode }) => {
			const choice = await vscode.window.showQuickPick(Object.keys(MERMAID_EXAMPLES), { placeHolder: 'Diagram type' })
			const example = choice ? MERMAID_EXAMPLES[choice] : undefined
			if (!example) return
			await insert(`\`\`\`mermaid\n${example}${CURSOR}\n\`\`\`\n`)
		},
	},
	{
		command: 'marksmith.openPlayground',
		title: 'Open Playground',
		category: 'Marksmith',
		icon: '$(rocket)',
		// No `menus` → always available in the palette, even with no markdown file open (that's the whole point).
		handler: async ({ vscode, context }) => {
			const source = vscode.Uri.joinPath(context.extensionUri, 'assets', 'playground.md')
			const scratch = vscode.Uri.joinPath(context.globalStorageUri, 'Marksmith Playground.md')
			// Seed an editable scratch copy on first open (never in the user's workspace); keep their edits afterward.
			await vscode.workspace.fs.createDirectory(context.globalStorageUri)
			const exists = await vscode.workspace.fs.stat(scratch).then(
				() => true,
				() => false,
			)
			if (!exists) await vscode.workspace.fs.copy(source, scratch)
			await vscode.commands.executeCommand('vscode.openWith', scratch, EDITOR_VIEW_TYPE)
		},
	},
] as const)
