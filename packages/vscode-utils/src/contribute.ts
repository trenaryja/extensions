import { promises as fs } from 'node:fs'
import { configToContributes } from './config'
import type { ConfigSchema } from './config'
import type { CommandEntry } from './registry'

export type ContributeInput = {
	commands?: readonly CommandEntry[]
	config?: { schema: ConfigSchema; title: string }
	customEditors?: unknown[]
	/** Merged verbatim into `contributes` — for static blocks (languages, grammars, walkthroughs, …). */
	extra?: Record<string, unknown>
}

const omitUndefined = (obj: Record<string, unknown>) =>
	Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined))

/** Build the full `contributes` block from a typed registry. Pure — no I/O, no `vscode`. */
export const buildContributes = ({ commands = [], config, customEditors, extra }: ContributeInput) => {
	const contributes: Record<string, unknown> = { ...extra }

	if (commands.length)
		contributes.commands = commands.map(({ command, title, category, icon }) =>
			omitUndefined({ command, title, category, icon }),
		)

	const keybindings = commands
		.filter((entry) => entry.key)
		.map(({ command, key, mac, when }) => omitUndefined({ command, key, mac, when }))
	if (keybindings.length) contributes.keybindings = keybindings

	const menus: Record<string, unknown[]> = {}
	for (const entry of commands)
		for (const menu of entry.menus ?? [])
			(menus[menu.id] ??= []).push(omitUndefined({ command: entry.command, group: menu.group, when: menu.when }))
	if (Object.keys(menus).length) contributes.menus = menus

	if (customEditors?.length) contributes.customEditors = customEditors
	if (config) contributes.configuration = configToContributes(config.schema, config.title)

	return contributes
}

/**
 * Sync a package.json's `contributes` from the registry.
 * `check: true` throws on drift instead of writing — wire it into the package's `check` script for CI.
 */
export const syncContributes = async (
	packageJsonPath: string,
	input: ContributeInput,
	{ check = false }: { check?: boolean } = {},
) => {
	const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
	const next = buildContributes(input)
	const drifted = JSON.stringify(pkg.contributes ?? null) !== JSON.stringify(next)

	if (check) {
		if (drifted)
			throw new Error(`contributes drift in ${packageJsonPath} — run the package's 'contribute' script to regenerate.`)
		return { drifted: false }
	}

	if (drifted) {
		pkg.contributes = next
		await fs.writeFile(packageJsonPath, `${JSON.stringify(pkg, null, '\t')}\n`)
	}

	return { drifted }
}
