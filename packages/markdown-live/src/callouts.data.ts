// Shared callout data (import-safe — no vscode/DOM), used by the config, the renderer, and the picker.

export type CalloutStyle = { icon?: string; color?: string }
export type CalloutConfig = Record<string, CalloutStyle>

/**
 * Fallback callout icons (VS Code codicons). The `default` entry is used for any callout type that
 * isn't listed here or overridden in the `markdownLive.callouts` setting. Override or extend via that
 * setting; omit `icon` in your override to keep the built-in icon and only change the color.
 */
export const DEFAULT_CALLOUTS: Record<string, { icon: string }> = {
	default: { icon: '$(note)' },
	note: { icon: '$(info)' },
	info: { icon: '$(info)' },
	todo: { icon: '$(checklist)' },
	tip: { icon: '$(lightbulb)' },
	hint: { icon: '$(lightbulb)' },
	important: { icon: '$(lightbulb)' },
	success: { icon: '$(pass)' },
	check: { icon: '$(pass)' },
	done: { icon: '$(pass)' },
	question: { icon: '$(question)' },
	help: { icon: '$(question)' },
	faq: { icon: '$(question)' },
	warning: { icon: '$(warning)' },
	caution: { icon: '$(warning)' },
	attention: { icon: '$(warning)' },
	failure: { icon: '$(error)' },
	fail: { icon: '$(error)' },
	missing: { icon: '$(error)' },
	danger: { icon: '$(flame)' },
	error: { icon: '$(flame)' },
	bug: { icon: '$(bug)' },
	example: { icon: '$(beaker)' },
	quote: { icon: '$(quote)' },
	cite: { icon: '$(quote)' },
	abstract: { icon: '$(book)' },
	summary: { icon: '$(book)' },
	tldr: { icon: '$(book)' },
}

/** Resolve a callout's icon + color, layering: user config → built-in default → the `default` fallback. */
export const resolveCallout = (config: CalloutConfig, type: string) => ({
	icon:
		config[type]?.icon ??
		DEFAULT_CALLOUTS[type]?.icon ??
		config.default?.icon ??
		DEFAULT_CALLOUTS.default?.icon ??
		'$(note)',
	color: config[type]?.color ?? config.default?.color,
})
