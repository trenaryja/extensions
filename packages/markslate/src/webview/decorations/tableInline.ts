const INLINE_RE = /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|~~([^~]+)~~|\[([^\]]+)\]\(([^)]+)\)/g

const inlineEl = (tag: string, text: string, className?: string) => {
	const el = document.createElement(tag)
	el.textContent = text
	if (className) el.className = className
	return el
}

const inlineMatchEl = (match: RegExpExecArray) => {
	if (match[1] != null) return inlineEl('code', match[1], 'md-code-inline')
	if (match[2] != null || match[3] != null) return inlineEl('strong', match[2] ?? match[3] ?? '')
	if (match[4] != null || match[5] != null) return inlineEl('em', match[4] ?? match[5] ?? '')
	if (match[6] != null) return inlineEl('del', match[6])
	if (match[7] == null) return null
	const link = inlineEl('a', match[7], 'md-link-text')
	link.title = `⌘/Ctrl-click to open · ${match[8]}`
	return link
}

export function appendInline(parent: HTMLElement, text: string) {
	INLINE_RE.lastIndex = 0
	let last = 0

	for (let match = INLINE_RE.exec(text); match; match = INLINE_RE.exec(text)) {
		if (match.index > last) parent.append(text.slice(last, match.index))
		const el = inlineMatchEl(match)
		if (el) parent.append(el)
		last = INLINE_RE.lastIndex
	}

	if (last < text.length) parent.append(text.slice(last))
}
