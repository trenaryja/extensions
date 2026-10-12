import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import * as R from 'remeda'
import { correct } from './native'
import type { Dictionary } from './types'

/** Where Superwhisper's macOS app keeps its settings. */
export const SUPERWHISPER_SETTINGS = join(homedir(), 'Documents', 'superwhisper', 'settings', 'settings.json')

type SuperwhisperSettings = { vocabulary?: string[]; replacements?: { original: string; with: string }[] }

/**
 * Superwhisper's words merged into `current`. Every replacement's target joins the vocabulary, and a
 * replacement the vocabulary then already produces on its own is left behind — Superwhisper needs one
 * rule per spelling of `CLAUDE.md`, hearsay's vocabulary needs none.
 */
export const importSuperwhisper = async (binary: string, current: Dictionary, path = SUPERWHISPER_SETTINGS) => {
	const settings: SuperwhisperSettings = JSON.parse(await readFile(path, 'utf8'))
	const rules = (settings.replacements ?? []).filter((rule) => rule.original.trim() && rule.with.trim())
	const vocabulary = R.unique([
		...(current.vocabulary ?? []),
		...(settings.vocabulary ?? []),
		...rules.map((rule) => rule.with),
	])
	const produced = await correct(
		binary,
		{ vocabulary },
		rules.map((rule) => rule.original),
	)
	const kept = rules.filter((rule, index) => produced[index] !== rule.with)
	return {
		dictionary: {
			vocabulary,
			replacements: { ...current.replacements, ...R.fromEntries(kept.map((rule) => [rule.original, rule.with])) },
		},
		words: vocabulary.length - (current.vocabulary?.length ?? 0),
		replacements: kept.length,
		covered: rules.length - kept.length,
	}
}
