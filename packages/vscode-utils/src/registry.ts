import type * as vscode from 'vscode'

/** VS Code menu contribution points a command can be placed into. */
export const MENU_IDS = [
	'commandPalette',
	'editor/title',
	'editor/title/context',
	'editor/context',
	'explorer/context',
] as const

export type MenuId = (typeof MENU_IDS)[number]

export type CommandMenu = {
	id: MenuId
	group?: string
	when?: string
}

/**
 * Injected into every command handler. Because the `vscode` namespace is passed in (not imported),
 * the registry module never imports `vscode` at top level — so the codegen script can `import` it
 * directly, with no `fake-vscode` stub.
 */
export type CommandApi = {
	vscode: typeof import('vscode')
	context: vscode.ExtensionContext
}

export type CommandEntry = {
	/** Fully-qualified command id, e.g. `myExtension.doThing`. */
	command: string
	title: string
	category?: string
	/** Codicon reference for menu/title buttons, e.g. `$(book)`. */
	icon?: string
	/** Keybinding for all platforms unless `mac` overrides it. */
	key?: string
	mac?: string
	when?: string
	menus?: CommandMenu[]
	/** The command implementation. Gets `vscode` + `context` injected — never import `vscode` here. */
	handler: (api: CommandApi, ...args: unknown[]) => unknown
}

/** Identity helper that preserves literal types so a `CommandId` union can be derived from the array. */
export const defineCommands = <const T extends readonly CommandEntry[]>(entries: T) => entries
