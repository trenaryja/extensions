// Shared callout data (import-safe — no vscode/DOM), used by the config, the renderer, and the picker.

export type CalloutStyle = { icon?: string; color?: string }
export type CalloutConfig = Record<string, CalloutStyle>

type CalloutDef = { icon: string; color: string; aliases?: string[] }

/**
 * Built-in callout types. The primary/alias taxonomy follows Obsidian's "Supported types" so Obsidian docs
 * render identically — aliases render exactly like their primary. (This is NOT GitHub's 5-type alert set;
 * where they diverge — GitHub's `important`/`caution` are their own types — we follow Obsidian, and users can
 * override via the `markslate.callouts` setting.) Icons are VS Code codicons; `color` is applied inline as
 * `--callout-color`, which is the single source of truth for a callout's accent (no per-type CSS).
 */
export const CALLOUTS: Record<string, CalloutDef> = {
	note: { icon: '$(info)', color: '#4fc1ff' },
	abstract: { icon: '$(book)', color: '#00c8b4', aliases: ['summary', 'tldr'] },
	info: { icon: '$(info)', color: '#4fc1ff' },
	todo: { icon: '$(checklist)', color: '#4fc1ff' },
	tip: { icon: '$(lightbulb)', color: '#53c578', aliases: ['hint', 'important'] },
	success: { icon: '$(pass)', color: '#53c578', aliases: ['check', 'done'] },
	question: { icon: '$(question)', color: '#b478ff', aliases: ['help', 'faq'] },
	warning: { icon: '$(warning)', color: '#ffc83c', aliases: ['caution', 'attention'] },
	failure: { icon: '$(error)', color: '#ff6464', aliases: ['fail', 'missing'] },
	danger: { icon: '$(flame)', color: '#ff6464', aliases: ['error'] },
	bug: { icon: '$(bug)', color: '#ff6464' },
	example: { icon: '$(beaker)', color: '#b478ff' },
	quote: { icon: '$(quote)', color: 'var(--vscode-descriptionForeground, #9aa0aa)', aliases: ['cite'] },
}

/** The primary type names, in order — for the insert picker (aliases resolve to these, so they're omitted). */
export const CALLOUT_PRIMARIES = Object.keys(CALLOUTS)

const ALIAS_TO_PRIMARY: Record<string, string> = {}
for (const [primary, def] of Object.entries(CALLOUTS))
	for (const alias of def.aliases ?? []) ALIAS_TO_PRIMARY[alias] = primary

const FALLBACK_ICON = '$(note)'

/**
 * Resolve a callout's icon + color. Layering: user config (by the exact name, then its primary) → the built-in
 * definition (aliases map to their primary) → the user's `default` override. Unknown types get the fallback
 * icon and no color, so the renderer falls back to its neutral accent.
 */
export const resolveCallout = (config: CalloutConfig, type: string) => {
	const name = type.toLowerCase()
	const primary = ALIAS_TO_PRIMARY[name] ?? name
	const builtin = CALLOUTS[primary]
	return {
		icon: config[name]?.icon ?? config[primary]?.icon ?? builtin?.icon ?? config.default?.icon ?? FALLBACK_ICON,
		color: config[name]?.color ?? config[primary]?.color ?? builtin?.color ?? config.default?.color,
	}
}
