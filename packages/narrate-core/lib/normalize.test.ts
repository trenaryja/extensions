import { describe, expect, test } from 'bun:test'
import { normalize } from './normalize'

describe('code blocks', () => {
	test('names the language and the line count', () => {
		expect(normalize('```typescript\nconst a = 1\nconst b = 2\nconst c = 3\n```')).toBe(
			'a typescript snippet, 3 lines, on screen.',
		)
	})

	test('omits the language when the fence has none', () => {
		expect(normalize('```\nmake build\nmake test\n```')).toBe('a snippet, 2 lines, on screen.')
	})

	test('says line singular for one line', () => {
		expect(normalize('```sh\nbun test\n```')).toBe('a sh snippet, 1 line, on screen.')
	})

	test('speaks the sentence in place among paragraphs', () => {
		expect(normalize('Before.\n\n```go\nfmt.Println("hi")\n```\n\nAfter.')).toBe(
			'Before.\na go snippet, 1 line, on screen.\nAfter.',
		)
	})
})

describe('tables', () => {
	const table = ['| Tool | Status |', '| ---- | ------ |', '| bun | ready |', '| tsc | pending |'].join('\n')

	test('speaks one line per body row, pairing each header with its cell', () => {
		expect(normalize(table)).toBe('Tool: bun. Status: ready.\nTool: tsc. Status: pending.')
	})

	test('does not speak the header row on its own', () => {
		expect(normalize(table)).not.toContain('Tool: Status')
	})

	test('skips empty cells', () => {
		expect(normalize('| A | B |\n| - | - |\n| 1 |  |')).toBe('A: 1.')
	})
})

describe('inline code', () => {
	test('keeps the text verbatim', () => {
		expect(normalize('Run `bun run build` first.')).toBe('Run bun run build first.')
	})

	test('survives inside a table cell', () => {
		expect(normalize('| Command | Meaning |\n| - | - |\n| `bun run build` | compiles |')).toBe(
			'Command: bun run build. Meaning: compiles.',
		)
	})
})

describe('links', () => {
	test('keeps the link text', () => {
		expect(normalize('See [the docs](https://bun.sh/docs) for more.')).toBe('See the docs for more.')
	})

	test('speaks the domain of a bare domain', () => {
		expect(normalize('Read <https://google.com> today.')).toBe('Read google dot com today.')
	})

	test('speaks the domain of an autolink with a short path', () => {
		expect(normalize('See <https://bun.sh/docs> for more.')).toBe('See bun dot sh for more.')
	})

	test('speaks the domain of a raw url', () => {
		expect(normalize('Read https://bun.sh/docs today.')).toBe('Read bun dot sh today.')
	})

	test('speaks the domain of a url used as its own link text', () => {
		expect(normalize('[https://bun.sh](https://bun.sh)')).toBe('bun dot sh')
	})

	test('names only the domain of a long path', () => {
		expect(normalize('See <https://github.com/trenaryja/extensions/pull/42> here.')).toBe(
			'See a link to github dot com here.',
		)
	})

	test('names only the domain of a url with a query string', () => {
		expect(normalize('Search <https://google.com/search?q=narrate> now.')).toBe('Search a link to google dot com now.')
	})

	test('drops the www prefix', () => {
		expect(normalize('Open www.npmjs.com now.')).toBe('Open npmjs dot com now.')
	})
})

describe('commit shas', () => {
	test('calls a lone sha the commit', () => {
		expect(normalize('Reverted in `a1b2c3d` this morning.')).toBe('Reverted in the commit this morning.')
	})

	test('calls a full forty character sha the commit', () => {
		expect(normalize('See e3b0c44298fc1c149afbf4c8996fb92427ae41e4 for the diff.')).toBe('See the commit for the diff.')
	})

	test('letters distinct shas by first appearance and reuses the letter', () => {
		expect(normalize('Cherry-pick a1b2c3d onto main, then revert 9f8e7d6. a1b2c3d is the fix.')).toBe(
			'Cherry-pick commit "A" onto main, then revert commit "B". commit "A" is the fix.',
		)
	})

	test('absorbs a sentence-initial commit and keeps the capital', () => {
		expect(normalize('Commit `653d2e0` on branch `lint-size-caps`.')).toBe('The commit on branch lint-size-caps.')
	})

	test('absorbs a mid-sentence commit', () => {
		expect(normalize('Reverted in commit `a1b2c3d` this morning.')).toBe('Reverted in the commit this morning.')
	})

	test('absorbs the plural noun in front of two shas', () => {
		expect(normalize('Squash commits `a1b2c3d` and `9f8e7d6` together.')).toBe(
			'Squash commit "A" and commit "B" together.',
		)
	})

	test('says the letter once when a commit precedes each sha', () => {
		expect(normalize('The fix is in commit `df807a9`, and commit `8c08420` reverts it.')).toBe(
			'The fix is in commit "A", and commit "B" reverts it.',
		)
	})

	test('leaves a sha with no preceding noun alone', () => {
		expect(normalize('Cherry-pick a1b2c3d onto main, then revert 9f8e7d6.')).toBe(
			'Cherry-pick commit "A" onto main, then revert commit "B".',
		)
	})

	test('absorbs a commit hash pair without stuttering', () => {
		expect(normalize('The commit hash `a1b2c3d` is stale.')).toBe('The commit is stale.')
	})

	test('leaves a hex colour alone', () => {
		expect(normalize('The accent is #ff00aa today.')).toBe('The accent is #ff00aa today.')
	})

	test('leaves a hyphenated id alone', () => {
		expect(normalize('Ticket abc-1234567 is closed.')).toBe('Ticket abc-1234567 is closed.')
	})

	test('leaves a plain number alone', () => {
		expect(normalize('Order 1234567 shipped.')).toBe('Order 1234567 shipped.')
	})
})

describe('file paths', () => {
	test('speaks a path inside inline code as basename and extension', () => {
		expect(normalize('Edit `packages/narrate-core/lib/normalize.ts` next.')).toBe('Edit normalize dot t s next.')
	})

	test('speaks a bare filename in prose', () => {
		expect(normalize('Check README.md first.')).toBe('Check README dot m d first.')
	})

	test('speaks each dot of a compound filename', () => {
		expect(normalize('Run `lib/normalize.test.ts`.')).toBe('Run normalize dot test dot t s.')
	})

	test('speaks the extensions that have a word', () => {
		expect(normalize('Compare `package.json` with `scripts/seed.py` and `db/schema.sql`.')).toBe(
			'Compare package dot jaysahn with seed dot pie and schema dot sequel.',
		)
	})

	test('speaks a home relative path', () => {
		expect(normalize('Read `~/.claude/hooks/context-nudge.sh` now.')).toBe('Read context-nudge dot s h now.')
	})

	test('speaks an absolute path', () => {
		expect(normalize('Open /Users/justin/notes.txt later.')).toBe('Open notes dot text later.')
	})

	test('spells an unknown extension letter by letter', () => {
		expect(normalize('Open `config/app.conf` now.')).toBe('Open app dot c o n f now.')
	})

	test('leaves ordinary prose with dots and slashes alone', () => {
		expect(normalize('It takes 3.5 seconds, e.g. for input/output.')).toBe(
			'It takes 3.5 seconds, e.g. for input/output.',
		)
	})
})

describe('file and line references', () => {
	test('speaks a single line', () => {
		expect(normalize('See `normalize.ts:33` for the guard.')).toBe('See normalize dot t s, line 33 for the guard.')
	})

	test('speaks a line range', () => {
		expect(normalize('Delete `lib/cleanup.ts:33-36` next.')).toBe('Delete cleanup dot t s, lines 33 to 36 next.')
	})
})

describe('identifiers', () => {
	test('splits camel case into words', () => {
		expect(normalize('Call runNarration when ready.')).toBe('Call run narration when ready.')
	})

	test('splits const case into words', () => {
		expect(normalize('It reads MAX_THINKING_TOKENS at startup.')).toBe('It reads max thinking tokens at startup.')
	})

	test('splits a camel case basename after the path is spoken', () => {
		expect(normalize('Open `lib/runNarration.ts`.')).toBe('Open run narration dot t s.')
	})

	test('leaves capitalized prose and acronyms alone', () => {
		expect(normalize('The Narration Engine speaks over HTTP.')).toBe('The Narration Engine speaks over HTTP.')
	})
})

describe('dashes', () => {
	test('turns an em dash into a comma', () => {
		expect(normalize('The engine is a library — every view is a consumer.')).toBe(
			'The engine is a library, every view is a consumer.',
		)
	})

	test('turns an en dash into a comma', () => {
		expect(normalize('Chunking – one sentence – is the unit.')).toBe('Chunking, one sentence, is the unit.')
	})

	test('turns a trailing dash into a full stop', () => {
		expect(normalize('Then it stopped —')).toBe('Then it stopped.')
	})

	test('reads an en dash between numbers as a range', () => {
		expect(normalize('Latency is 3–5 seconds per call now.')).toBe('Latency is 3 to 5 seconds per call now.')
	})

	test('leaves an en dash between non-numbers as a pause', () => {
		expect(normalize('Kokoro – the better voice – needs python.')).toBe('Kokoro, the better voice, needs python.')
	})

	test('leaves a hyphenated word intact', () => {
		expect(normalize('This is a well-known issue — really.')).toBe('This is a well-known issue, really.')
	})
})

describe('arrows', () => {
	test('reads an ascii arrow as becomes', () => {
		expect(normalize('Draft -> review -> ship.')).toBe('Draft becomes review becomes ship.')
	})

	test('reads a fat arrow as becomes', () => {
		expect(normalize('The map is key => value here.')).toBe('The map is key becomes value here.')
	})

	test('reads a unicode arrow as becomes', () => {
		expect(normalize('Idle → speaking.')).toBe('Idle becomes speaking.')
	})

	test('reads an arrow between numbers as to', () => {
		expect(normalize('Lines 33 -> 36 moved.')).toBe('Lines 33 to 36 moved.')
	})

	test('reads a left arrow as from', () => {
		expect(normalize('Audio ← synthesis.')).toBe('Audio from synthesis.')
	})

	test('reads a double headed arrow as to and from', () => {
		expect(normalize('Engine ↔ view.')).toBe('Engine to and from view.')
	})
})

describe('status marks', () => {
	test('speaks ticks, crosses, warnings and question marks', () => {
		expect(normalize('✅ ready, ✓ done, ❌ broken, ✗ gone, ⚠️ careful, ❓ unclear.')).toBe(
			'yes ready, yes done, no broken, no gone, warning careful, unknown unclear.',
		)
	})
})

describe('modifier keys', () => {
	test('names each mac modifier', () => {
		expect(normalize('Press ⌘⇧⌥⌃⏎ to run.')).toBe('Press command shift option control return to run.')
	})

	test('names the other return symbol', () => {
		expect(normalize('Press ⌘↵ to pause.')).toBe('Press command return to pause.')
	})

	test('names the remaining key symbols', () => {
		expect(normalize('Press ⎋ then ⇥, ⌫, ⌦, ⇪, ␣, ⇞, ⇟.')).toBe(
			'Press escape then tab, delete, forward delete, caps lock, space, page up, page down.',
		)
	})

	test('names a punctuation key held with a modifier', () => {
		expect(normalize('⌘= and ⌘- change the rate.')).toBe('command equals and command minus change the rate.')
	})

	test('names the other shortcut punctuation', () => {
		expect(normalize('Use ⌘. to stop, ⌘, for settings, ⌘/ for help, ⌘+ and ⌘[ and ⌘] to move.')).toBe(
			'Use command period to stop, command comma for settings, command slash for help, command plus and command left bracket and command right bracket to move.',
		)
	})

	test('names an arrow key held with a modifier', () => {
		expect(normalize('⌘↑ goes up, ⌘↓ goes down, ⌘← and ⌘→ jump.')).toBe(
			'command up arrow goes up, command down arrow goes down, command left arrow and command right arrow jump.',
		)
	})

	test('leaves the same characters alone outside shortcut position', () => {
		expect(normalize('LOG_LEVEL=debug')).toBe('LOG_LEVEL=debug')
		expect(normalize('This is a well-known issue — really.')).toBe('This is a well-known issue, really.')
		expect(normalize('pick 3 - 4 of them')).toBe('pick 3 - 4 of them')
	})
})

describe('decorative characters', () => {
	test('drops an emoji and its variation selector', () => {
		expect(normalize('Great ❤️ work.')).toBe('Great work.')
	})

	test('reads a multiplication sign between numbers as by', () => {
		expect(normalize('The canvas is 1920×1080 pixels.')).toBe('The canvas is 1920 by 1080 pixels.')
	})

	test('reads a multiplication sign after a number as times', () => {
		expect(normalize('call it 12× faster')).toBe('call it 12 times faster')
		expect(normalize('2× the cost')).toBe('2 times the cost')
	})

	test('drops a multiplication sign that follows no number', () => {
		expect(normalize('The × marks the spot.')).toBe('The marks the spot.')
	})

	test('speaks approximately and section signs', () => {
		expect(normalize('It takes ≈ 6 seconds, see § 4.')).toBe('It takes about 6 seconds, see section 4.')
	})

	test('speaks stars and degrees', () => {
		expect(normalize('Rated ★ at 72° today.')).toBe('Rated star at 72 degrees today.')
	})

	test('turns a middle dot into a pause and an ellipsis into dots', () => {
		expect(normalize('One · two … three.')).toBe('One, two... three.')
	})
})
