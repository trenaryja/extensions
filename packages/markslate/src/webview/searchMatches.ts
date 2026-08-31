import type { SearchQuery } from '@codemirror/search'
import type { EditorState } from '@codemirror/state'

const MAX_MATCHES = 10_000

/** Count a query's matches and which one the main selection sits on (1-based; 0 = none). */
export function countMatches(state: EditorState, query: SearchQuery) {
	if (!query.search || !query.valid) return { total: 0, current: 0 }
	const { from, to } = state.selection.main
	let total = 0
	let current = 0
	const cursor = query.getCursor(state)

	for (let match = cursor.next(); !match.done && total < MAX_MATCHES; match = cursor.next()) {
		total++
		if (match.value.from === from && match.value.to === to) current = total
	}

	return { total, current }
}
