import * as R from 'remeda'
import { defineCommands } from '@repo/vscode-utils/registry'
import { CATALOG, importSuperwhisper, megabytes, NATIVE_BINARY, SUPERWHISPER_SETTINGS } from '@repo/hearsay-core'
import { recordingsDir } from './paths'

export const TOGGLE = 'hearsay.toggle'
export const CANCEL = 'hearsay.cancel'

/** Where focus was when the key was pressed. `activeTextEditor` stays set behind the terminal and the commit box, so only a keybinding's `when` can tell. */
export const FOCUSES = ['input', 'terminal'] as const
export type Focus = (typeof FOCUSES)[number]

/** Takes over VS Code's own Start Dictation in Editor: installing Hearsay is choosing it over the built-in. */
const TOGGLE_KEY = { key: 'ctrl+alt+v', mac: 'cmd+alt+v' }
/** Editor widgets that are not a `TextEditor` — the commit box, chat, a comment — reachable only through `type`. Never `editorTextFocus`: it is false in all of them. */
const INPUT_FOCUS = 'scmRepository || inChatInput || commentEditorFocused'

export const commands = defineCommands([
	{
		command: TOGGLE,
		title: 'Hearsay: Toggle Dictation',
		keybindings: [
			TOGGLE_KEY,
			{ ...TOGGLE_KEY, when: INPUT_FOCUS, args: { focus: 'input' } },
			{ ...TOGGLE_KEY, when: 'terminalFocus', args: { focus: 'terminal' } },
		],
		// Lazy import keeps this module (and the contributes codegen) free of any top-level `vscode` import.
		handler: async ({ context }, args) =>
			(await import('./session'))
				.session(context)
				.toggle(FOCUSES.find((focus) => R.isPlainObject(args) && args.focus === focus)),
	},

	{
		command: CANCEL,
		title: 'Hearsay: Cancel Dictation',
		// Bound bare, so the context key is the only thing keeping `escape` its usual self the rest of the time.
		keybindings: [{ key: 'escape', when: 'hearsay.recording' }],
		handler: async ({ context }) => (await import('./session')).session(context).cancel(),
	},

	{
		command: 'hearsay.selectModel',
		title: 'Hearsay: Select Model',
		handler: async ({ vscode, context }) => {
			const settings = vscode.workspace.getConfiguration()
			const current = settings.get<string>('hearsay.model')
			const { Separator } = vscode.QuickPickItemKind
			const items = CATALOG.flatMap((entry, index) => [
				// A named separator is the only right-aligned text a quick pick draws: the language groups ride on it.
				...(entry.english === CATALOG[index - 1]?.english
					? []
					: [{ label: entry.english ? 'English only' : 'Every language', kind: Separator }]),
				{
					id: entry.id,
					label: entry.label,
					// Not `iconPath`: an icon indents the label but not the detail line under it.
					description: `${megabytes(entry.bytes)}${entry.id === current ? '  $(check)' : ''}`,
					detail: entry.note,
				},
			])
			const pick = vscode.window.createQuickPick<(typeof items)[number]>()
			pick.items = items
			pick.placeholder = 'Choose the model Hearsay transcribes with'
			pick.activeItems = items.filter((item) => 'id' in item && item.id === current)
			pick.show()
			const picked = await new Promise<(typeof items)[number] | undefined>((resolve) => {
				pick.onDidAccept(() => resolve(pick.selectedItems[0]))
				pick.onDidHide(() => resolve(undefined))
			})
			pick.dispose()
			if (!picked || !('id' in picked)) return
			// Global, because the model is machine-scoped — a workspace cannot own a 1.6 GB download.
			await settings.update('hearsay.model', picked.id, vscode.ConfigurationTarget.Global)
			// Also on re-picking the current model, whose download a cancel may have left undone.
			await (await import('./session')).session(context).prepareModel()
		},
	},

	{
		command: 'hearsay.importSuperwhisper',
		title: 'Hearsay: Import from Superwhisper',
		handler: async ({ vscode, context }) => {
			const found = await vscode.workspace.fs.stat(vscode.Uri.file(SUPERWHISPER_SETTINGS)).then(
				() => SUPERWHISPER_SETTINGS,
				() => undefined,
			)
			const path =
				found ??
				(
					await vscode.window.showOpenDialog({
						title: 'Hearsay: where is Superwhisper’s settings.json?',
						filters: { 'Superwhisper settings': ['json'] },
					})
				)?.[0]?.fsPath
			if (!path) return

			const settings = vscode.workspace.getConfiguration('hearsay')
			const binary = vscode.Uri.joinPath(context.extensionUri, 'assets', NATIVE_BINARY).fsPath
			const current = {
				vocabulary: settings.inspect<string[]>('vocabulary')?.globalValue ?? [],
				replacements: settings.inspect<Record<string, string>>('replacements')?.globalValue ?? {},
			}
			const result = await importSuperwhisper(binary, current, path)
			// Global: the words are the speaker's, and a vocabulary that needs copying per repo is not one.
			await settings.update('vocabulary', result.dictionary.vocabulary, vscode.ConfigurationTarget.Global)
			await settings.update('replacements', result.dictionary.replacements, vscode.ConfigurationTarget.Global)
			const opened = await vscode.window.showInformationMessage(
				`Hearsay: ${result.words} new word(s) and ${result.replacements} replacement(s). ${result.covered} of Superwhisper’s replacements weren’t needed — the vocabulary already fixes those.`,
				'Open Settings',
			)
			if (opened) await vscode.commands.executeCommand('workbench.action.openSettings', 'hearsay.vocabulary')
		},
	},

	{
		command: 'hearsay.openRecordings',
		title: 'Hearsay: Open Recordings Folder',
		handler: async ({ vscode, context }) => {
			const dir = recordingsDir(vscode, context)
			await vscode.workspace.fs.createDirectory(dir)
			const newest = (await vscode.workspace.fs.readDirectory(dir))
				.map(([name]) => name)
				.sort()
				.at(-1)
			// Revealing the folder only selects it in its parent, so point at a recording inside it — the same
			// trick VS Code's own "Open Logs Folder" uses. `revealFileInOS` is Finder, Explorer and xdg-open.
			await vscode.commands.executeCommand('revealFileInOS', newest ? vscode.Uri.joinPath(dir, newest) : dir)
		},
	},
])
