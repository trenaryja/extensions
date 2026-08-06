import { describe, expect, test } from 'bun:test'
import { SearchQuery } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { countMatches } from '../src/webview/searchMatches'

const state = (doc: string, anchor = 0, head = anchor) => EditorState.create({ doc, selection: { anchor, head } })

describe('countMatches', () => {
	test('empty query matches nothing', () => {
		expect(countMatches(state('fox fox'), new SearchQuery({ search: '' }))).toEqual({ total: 0, current: 0 })
	})

	test('counts literal matches case-insensitively by default', () => {
		const query = new SearchQuery({ search: 'fox', literal: true })
		expect(countMatches(state('Fox fox FOX'), query).total).toBe(3)
	})

	test('caseSensitive narrows matches', () => {
		const query = new SearchQuery({ search: 'fox', literal: true, caseSensitive: true })
		expect(countMatches(state('Fox fox FOX'), query).total).toBe(1)
	})

	test('reports the current match when the selection sits on one', () => {
		// 'fox fox fox' — second match spans 4..7
		const query = new SearchQuery({ search: 'fox', literal: true })
		expect(countMatches(state('fox fox fox', 4, 7), query)).toEqual({ total: 3, current: 2 })
	})

	test('current is 0 when the selection is not on a match', () => {
		const query = new SearchQuery({ search: 'fox', literal: true })
		expect(countMatches(state('fox fox', 1), query).current).toBe(0)
	})

	test('wholeWord excludes substrings', () => {
		const query = new SearchQuery({ search: 'fox', literal: true, wholeWord: true })
		expect(countMatches(state('fox foxes fox'), query).total).toBe(2)
	})

	test('regexp queries count per match', () => {
		const query = new SearchQuery({ search: 'f.x', regexp: true })
		expect(countMatches(state('fox fix fax'), query).total).toBe(3)
	})

	test('invalid regexp yields zero instead of throwing', () => {
		const query = new SearchQuery({ search: '(', regexp: true })
		expect(countMatches(state('((('), query)).toEqual({ total: 0, current: 0 })
	})
})
