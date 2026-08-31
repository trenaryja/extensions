import { describe, expect, test } from 'bun:test'
import { formatterProfile } from '../src/webview/decorations/tableFormat'
import { parseRow, parseTable, serialize } from '../src/webview/decorations/tables'

type Align = 'left' | 'center' | 'right' | null

const model = (headers: string[], aligns: Align[], rows: string[][]) => ({ headers, aligns, rows, from: 0, to: 0 })

const parse = (source: string) => {
	const parsed = parseTable(source)
	if (!parsed) throw new Error(`not a table: ${source}`)
	return parsed
}

describe('escaped-pipe round-trip', () => {
	test('parseRow keeps an escaped pipe inside its cell and unescapes it', () => {
		expect(parseRow('| a \\| b | c |')).toEqual(['a | b', 'c'])
	})
	test('parseRow still splits on unescaped pipes', () => {
		expect(parseRow('| a | b | c |')).toEqual(['a', 'b', 'c'])
	})
	test('serialize escapes a literal pipe in cell content', () => {
		expect(serialize(model(['h'], [null], [['a | b']]))).toContain('a \\| b')
	})
	test('parse → serialize → parse preserves a pipe-bearing cell (no data loss)', () => {
		const source = serialize(model(['k', 'v'], [null, null], [['x', 'a | b']]))
		expect(parseTable(source)?.rows).toEqual([['x', 'a | b']])
	})
	test('an escaped backslash before a pipe still splits the column', () => {
		// `\\` is a literal backslash, so the following `|` is a real separator.
		expect(parseRow('| a \\\\ | b |')).toEqual(['a \\\\', 'b'])
	})
})

// Editing a table produces `serialize(parseTable(source))` (minimal GFM). The debounced finalizer then runs prettier
// over it. These lock the two guarantees: that finalized output is a prettier fixed point, and that editing a table
// never changes what the user's own prettier would produce.
describe('prettier parity', () => {
	const CORPUS = [
		'| a | b |\n| - | - |\n| 1 | 2 |',
		'| name | status |\n| - | - |\n| tables | ✅ |\n| math | 日本 |', // wide emoji + CJK
		'| a | b | c |\n| :- | :-: | -: |\n| left | center | right |', // all three alignments
		'| k | v |\n| - | - |\n| pipe | a \\| b |', // escaped pipe survives prettier
		'| k | v |\n| - | - |\n| emph | *italic* and **bold** |\n| ws | x   y |', // content normalization
		'| who | icon |\n| - | - |\n| family | 👨‍👩‍👧 |\n| flag | 🇯🇵 |', // ZWJ + flag graphemes
	]

	test.each(CORPUS)('finalized output is a prettier fixed point: %p', async (source) => {
		const pretty = await formatterProfile.formatTable(source)
		expect(await formatterProfile.formatTable(pretty)).toBe(pretty)
	})

	test.each(CORPUS)('editing does not change prettier output: %p', async (source) => {
		const edited = serialize(parse(source)) // what an edit leaves in the doc
		expect(await formatterProfile.formatTable(edited)).toBe(await formatterProfile.formatTable(source))
	})

	test.each(CORPUS)('full round-trip through prettier drifts nothing: %p', async (source) => {
		const pretty = await formatterProfile.formatTable(source)
		const reEdited = serialize(parse(pretty)) // re-open prettier output, edit, re-serialize
		expect(await formatterProfile.formatTable(reEdited)).toBe(pretty)
	})
})
