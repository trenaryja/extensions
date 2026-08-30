import { describe, expect, test } from 'bun:test'

import { chunk } from './chunk'

const texts = (input: string, options?: { maxChars?: number }) => chunk(input, options).map((part) => part.text)

const words = (input: string) => input.split(/\s+/).filter(Boolean)

const wordyParagraph = (separator: string) =>
	Array.from({ length: 520 }, (_, i) => `word${i}`)
		.join(separator)
		.trim()

describe('sentence boundaries', () => {
	test('splits on . ! and ?', () => {
		expect(texts('Really? Yes! Great.')).toEqual(['Really?', 'Yes!', 'Great.'])
	})

	test('keeps a closing quote with the sentence it ends', () => {
		expect(texts('He said "stop." Then left.')).toEqual(['He said "stop."', 'Then left.'])
	})

	test('keeps a closing quote after an exclamation', () => {
		expect(texts('She yelled "Go!" He ran.')).toEqual(['She yelled "Go!"', 'He ran.'])
	})

	test('keeps a closing paren with the sentence it ends', () => {
		expect(texts('It works (mostly.) Then it broke.')).toEqual(['It works (mostly.)', 'Then it broke.'])
	})

	test('treats every newline as a boundary', () => {
		expect(texts('One two\nthree four')).toEqual(['One two', 'three four'])
	})

	test('separates paragraphs and drops the blank line', () => {
		expect(texts('First para.\n\nSecond para. Third one.')).toEqual(['First para.', 'Second para.', 'Third one.'])
	})

	test('needs an uppercase, digit, or quote to open the next sentence', () => {
		expect(texts('Ends. then continues.')).toEqual(['Ends. then continues.'])
		expect(texts('Ends. 42 follows.')).toEqual(['Ends.', '42 follows.'])
	})
})

describe('non-terminating dots', () => {
	test('version numbers', () => {
		expect(texts('We shipped v1.2.3 today. It works.')).toEqual(['We shipped v1.2.3 today.', 'It works.'])
		expect(texts('Version v1.2.3. Next up.')).toEqual(['Version v1.2.3.', 'Next up.'])
	})

	test('decimals', () => {
		expect(texts('Pi is 3.14 exactly. Really.')).toEqual(['Pi is 3.14 exactly.', 'Really.'])
	})

	test('filenames', () => {
		expect(texts('Open sayx.tsx and edit index.ts now. Then build.')).toEqual([
			'Open sayx.tsx and edit index.ts now.',
			'Then build.',
		])
	})

	test('e.g. and i.e.', () => {
		expect(texts('Use a formatter, e.g. Prettier, before you commit.')).toEqual([
			'Use a formatter, e.g. Prettier, before you commit.',
		])
		expect(texts('One tool, i.e. Bun, handles it all.')).toEqual(['One tool, i.e. Bun, handles it all.'])
	})

	test('etc.', () => {
		expect(texts('Bring cats, dogs, etc. Everyone is welcome.')).toEqual([
			'Bring cats, dogs, etc. Everyone is welcome.',
		])
	})

	test('Dr. Mr. Mrs. vs. and St.', () => {
		expect(texts('Dr. Smith arrived. He left.')).toEqual(['Dr. Smith arrived.', 'He left.'])
		expect(texts('Mr. and Mrs. Green left. They waved.')).toEqual(['Mr. and Mrs. Green left.', 'They waved.'])
		expect(texts('Bun vs. Node is settled. Bun wins.')).toEqual(['Bun vs. Node is settled.', 'Bun wins.'])
		expect(texts('We met on Elm St. Then we walked.')).toEqual(['We met on Elm St. Then we walked.'])
	})

	test('dotted acronyms and initials', () => {
		expect(texts('The U.S. Government acted. Then it stopped.')).toEqual([
			'The U.S. Government acted.',
			'Then it stopped.',
		])
		expect(texts('J. R. R. Tolkien wrote books. He was British.')).toEqual([
			'J. R. R. Tolkien wrote books.',
			'He was British.',
		])
	})

	test('ellipses', () => {
		expect(texts('Wait... Then he left.')).toEqual(['Wait... Then he left.'])
		expect(texts('Hello ... World is here.')).toEqual(['Hello ... World is here.'])
	})

	test('urls and domains', () => {
		expect(texts('Read https://example.com/docs.html now. Then stop.')).toEqual([
			'Read https://example.com/docs.html now.',
			'Then stop.',
		])
		expect(texts('Visit example.com and nodejs.org for docs.')).toEqual(['Visit example.com and nodejs.org for docs.'])
	})
})

describe('non-prose lines', () => {
	test('a table row survives intact', () => {
		const table = '| Name | Version |\n| --- | --- |\n| sayx.tsx | v1.2.3 |'
		expect(texts(table)).toEqual(['| Name | Version |', '| --- | --- |', '| sayx.tsx | v1.2.3 |'])
	})

	test('a code-fence block survives intact', () => {
		const code = 'Here is code:\n```ts\nconst path = join(dir, "a.txt")\n```\nDone.'
		expect(texts(code)).toEqual(['Here is code:', '```ts', 'const path = join(dir, "a.txt")', '```', 'Done.'])
	})
})

describe('long sentences', () => {
	const maxChars = 400

	test('a 3000-char paragraph with no period splits at whitespace only', () => {
		const paragraph = wordyParagraph(' ')
		expect(paragraph.length).toBeGreaterThan(3000)
		const parts = texts(paragraph)
		for (const part of parts) expect(part.length).toBeLessThanOrEqual(maxChars)
		expect(parts.flatMap(words)).toEqual(words(paragraph))
	})

	test('a 3000-char paragraph with commas splits at clause boundaries', () => {
		const paragraph = wordyParagraph(', ')
		expect(paragraph.length).toBeGreaterThan(3000)
		const parts = texts(paragraph)
		for (const part of parts) expect(part.length).toBeLessThanOrEqual(maxChars)
		expect(parts.flatMap(words)).toEqual(words(paragraph))
		expect(parts.slice(0, -1).filter((part) => part.endsWith(',')).length).toBeGreaterThan(0)
	})

	test('never cuts a word in half', () => {
		const paragraph = wordyParagraph(' ')

		for (const part of texts(paragraph, { maxChars: 50 })) {
			expect(part).toBe(part.trim())
			expect(paragraph).toInclude(part)
		}
	})

	test('a word longer than maxChars overruns rather than being cut', () => {
		const parts = texts(`short ${'x'.repeat(60)} tail`, { maxChars: 20 })
		expect(parts.flatMap(words)).toEqual(['short', 'x'.repeat(60), 'tail'])
	})

	test('splits at semicolons, colons, and dashes', () => {
		const sentence = `${'a'.repeat(30)}; ${'b'.repeat(30)}: ${'c'.repeat(30)} — ${'d'.repeat(30)} end`
		const parts = texts(sentence, { maxChars: 40 })
		for (const part of parts) expect(part.length).toBeLessThanOrEqual(40)
		expect(parts[0]).toBe(`${'a'.repeat(30)};`)
		expect(parts[1]).toBe(`${'b'.repeat(30)}:`)
	})
})

describe('lead chunk', () => {
	const opener =
		'The quick brown fox jumps over the lazy dog by the river, and then it bolts far away into the dark woods beyond the hill without ever stopping.'

	test('carves a short lead off a long first sentence', () => {
		const parts = texts(opener)
		expect(parts.length).toBe(2)
		expect(parts[0]!.length).toBeGreaterThanOrEqual(40)
		expect(parts[0]!.length).toBeLessThanOrEqual(120)
		expect(parts.flatMap(words)).toEqual(words(opener))
	})

	test('leaves a short first sentence alone', () => {
		expect(
			texts('Short opener. A much longer follow-up sentence that runs well past any lead limit, and keeps going.'),
		).toEqual([
			'Short opener.',
			'A much longer follow-up sentence that runs well past any lead limit, and keeps going.',
		])
	})

	test('leaves a long first sentence alone when it has no clause boundary in range', () => {
		const clauseless = `${'word '.repeat(40)}end`.trim()
		expect(texts(clauseless, { maxChars: 4000 })).toEqual([clauseless])
	})
})

describe('output shape', () => {
	test('indexes chunks from zero in order, tagged with their paragraph', () => {
		const parts = chunk('One. Two. Three.')
		expect(parts).toEqual([
			{ index: 0, text: 'One.', line: 0 },
			{ index: 1, text: 'Two.', line: 0 },
			{ index: 2, text: 'Three.', line: 0 },
		])
	})

	test('numbers paragraphs contiguously, skipping the blank lines between them', () => {
		const parts = chunk('One. Two.\n\n\nThree.\n   \nFour. Five.')
		expect(parts.map((part) => [part.text, part.line])).toEqual([
			['One.', 0],
			['Two.', 0],
			['Three.', 1],
			['Four.', 2],
			['Five.', 2],
		])
	})

	test('keeps the paragraph of a sentence split for length', () => {
		const parts = chunk(`First.\n${'word '.repeat(200)}end.`, { maxChars: 100 })
		expect(parts.filter((part) => part.line === 1).length).toBeGreaterThan(1)
		expect(new Set(parts.map((part) => part.line))).toEqual(new Set([0, 1]))
	})

	test('drops empty and whitespace-only chunks and trims the rest', () => {
		expect(texts('  \n\n   Padded sentence.   \n \t \n Another one.  \n\n')).toEqual([
			'Padded sentence.',
			'Another one.',
		])
	})

	test('returns nothing for empty input', () => {
		expect(chunk('')).toEqual([])
		expect(chunk('   \n\t\n  ')).toEqual([])
	})

	test('honours a custom maxChars', () => {
		const sentence = `${'word '.repeat(120)}end.`.trim()
		expect(texts(sentence).every((part) => part.length <= 400)).toBe(true)
		expect(texts(sentence, { maxChars: 100 }).every((part) => part.length <= 100)).toBe(true)
	})
})
