// Shared callout data (import-safe — no vscode/DOM), used by the config default, the renderer, and the picker.

export type CalloutStyle = { icon: string; color?: string }
export type CalloutConfig = Record<string, CalloutStyle>

/**
 * Default callout icons (emoji). Users override any of these, or add their own types, via the
 * `markdownLive.callouts` setting. An `icon` can be an emoji, a `$(codicon)` name, or a raw <svg> string.
 */
export const DEFAULT_CALLOUTS: CalloutConfig = {
	note: { icon: 'ℹ️' },
	info: { icon: 'ℹ️' },
	todo: { icon: '✅' },
	tip: { icon: '💡' },
	hint: { icon: '💡' },
	important: { icon: '💡' },
	success: { icon: '✅' },
	check: { icon: '✅' },
	done: { icon: '✅' },
	question: { icon: '❓' },
	help: { icon: '❓' },
	faq: { icon: '❓' },
	warning: { icon: '⚠️' },
	caution: { icon: '⚠️' },
	attention: { icon: '⚠️' },
	failure: { icon: '❌' },
	fail: { icon: '❌' },
	missing: { icon: '❌' },
	danger: { icon: '🔥' },
	error: { icon: '🔥' },
	bug: { icon: '🐛' },
	example: { icon: '📌' },
	quote: { icon: '💬' },
	cite: { icon: '💬' },
	abstract: { icon: '📋' },
	summary: { icon: '📋' },
	tldr: { icon: '📋' },
}
