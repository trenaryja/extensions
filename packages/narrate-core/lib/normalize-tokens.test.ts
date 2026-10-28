import { describe, expect, test } from 'bun:test'
import { normalize } from './normalize'

describe('cli flags', () => {
	test('reads a hyphenated flag literally', () => {
		expect(normalize('Pass `--strict-mcp-config` to the CLI.')).toBe('Pass dash dash strict mcp config to the CLI.')
	})

	test('reads a single-word flag literally', () => {
		expect(normalize('Run it with `--json`.')).toBe('Run it with dash dash json.')
	})

	test('leaves a preceding article alone', () => {
		expect(normalize('Use the `--no-color` here.')).toBe('Use the dash dash no color here.')
	})

	test('leaves a following noun alone', () => {
		expect(normalize('The `--raw` flag skips normalization.')).toBe('The dash dash raw flag skips normalization.')
	})

	test('reads a sentence-initial flag literally', () => {
		expect(normalize('`--dry-run` skips the write.')).toBe('dash dash dry run skips the write.')
	})

	test('reads a short flag as one dash and its letter', () => {
		expect(normalize('Pass `-h` for help.')).toBe('Pass dash h for help.')
	})

	test('spells out every letter of a multi-letter short flag', () => {
		expect(normalize('Use `-rf` to force it.')).toBe('Use dash r f to force it.')
	})

	test('reads a flag written inside a command', () => {
		expect(normalize('Use `bun --smol` for the worker.')).toBe('Use bun dash dash smol for the worker.')
	})

	test('reads a bare argument separator literally', () => {
		expect(normalize('Everything after `--` is passed through.')).toBe('Everything after dash dash is passed through.')
	})

	test('reads an uppercase short flag', () => {
		expect(normalize('Copy it with `cp -R` instead.')).toBe('Copy it with cp dash r instead.')
	})

	test('leaves a hyphenated word alone', () => {
		expect(normalize('This is a well-known issue.')).toBe('This is a well-known issue.')
	})

	test('leaves a numeric range alone', () => {
		expect(normalize('It takes 3-5 seconds.')).toBe('It takes 3-5 seconds.')
	})

	test('leaves a prose dash before a single letter alone', () => {
		expect(normalize('wait - I think so')).toBe('wait - I think so')
	})
})

describe('version strings', () => {
	test('says version before the number', () => {
		expect(normalize('Upgraded to v0.29.14 today.')).toBe('Upgraded to version 0.29.14 today.')
	})
})

describe('block structure', () => {
	test('turns a heading into a sentence', () => {
		expect(normalize('## Getting started')).toBe('Getting started.')
	})

	test('leaves heading punctuation alone when it already ends a sentence', () => {
		expect(normalize('## Ready?')).toBe('Ready?')
	})

	test('turns list items into sentences, one per line', () => {
		expect(normalize('- install bun\n- run the tests\n- ship it')).toBe('install bun.\nrun the tests.\nship it.')
	})

	test('turns ordered list items into sentences', () => {
		expect(normalize('1. first step\n2. second step')).toBe('first step.\nsecond step.')
	})

	test('separates paragraphs with a newline', () => {
		expect(normalize('First paragraph.\n\nSecond paragraph.')).toBe('First paragraph.\nSecond paragraph.')
	})

	test('joins a soft-wrapped paragraph into one line', () => {
		expect(normalize('one line\nwrapped here')).toBe('one line wrapped here')
	})

	test('drops emphasis markers, thematic breaks and html tags', () => {
		expect(normalize('# Title\n\n---\n\n**Bold** and _italic_ and <span>markup</span>.')).toBe(
			'Title.\nBold and italic and markup.',
		)
	})
})

describe('images', () => {
	test('speaks an image', () => {
		expect(normalize('![a chart of latency](chart.png)')).toBe('an image')
	})

	test('speaks an image inline in a sentence', () => {
		expect(normalize('Here is ![alt text](chart.png) for you.')).toBe('Here is an image for you.')
	})
})

describe('whitespace', () => {
	test('collapses runs of whitespace and trims', () => {
		expect(normalize('  spaced    out\t\ttext  \n\n\n\n')).toBe('spaced out text')
	})
})

describe('secret redaction', () => {
	const cases: [string, string][] = [
		['github classic token', 'Use ghp_16C7e42F292c6912E7710c838347Ae178B4a here'],
		['github oauth token', 'Use gho_16C7e42F292c6912E7710c838347Ae178B4a here'],
		['github server token', 'Use ghs_16C7e42F292c6912E7710c838347Ae178B4a here'],
		['github fine-grained token', 'Use github_pat_11ABCDEFG0abcdefghijkl_ABCDEFGHIJK here'],
		['openai key', 'Use sk-proj-abc123DEF456ghi789JKL here'],
		['anthropic key', 'Use sk-ant-api03-AbCdEf123456 here'],
		['aws access key id', 'Use AKIAIOSFODNN7EXAMPLE here'],
		['bearer token', 'Use Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature here'],
	]

	for (const [label, markdown] of cases)
		test(`redacts a ${label}`, () => {
			expect(normalize(markdown)).toBe(`Use a redacted secret here`)
		})

	test('redacts only the value of an env assignment', () => {
		expect(normalize('GITHUB_TOKEN=ghp_16C7e42F292c6912E7710c838347Ae178B4a')).toBe('GITHUB_TOKEN=a redacted secret')
	})

	test('redacts an assignment wrapped in bold without leaking the markers', () => {
		expect(normalize('Set **GITHUB_TOKEN=ghp_16C7e42F292c6912E7710c838347Ae178B4a** first.')).toBe(
			'Set GITHUB_TOKEN=a redacted secret first.',
		)
	})

	test('redacts only the value of a yaml-style key', () => {
		expect(normalize('api_key: hunter2sekrit')).toBe('api_key: a redacted secret')
	})

	test('redacts a password and a secret key by name', () => {
		expect(normalize('PASSWORD=correcthorse\n\nMY_SECRET: battery-staple')).toBe(
			'PASSWORD=a redacted secret\nMY_SECRET: a redacted secret',
		)
	})

	test('leaves unrelated assignments alone', () => {
		expect(normalize('LOG_LEVEL=debug')).toBe('LOG_LEVEL=debug')
	})

	test('survives bold markers around the token', () => {
		const spoken = normalize('The key is **ghp_16C7e42F292c6912E7710c838347Ae178B4a** okay')
		expect(spoken).toBe('The key is a redacted secret okay')
		expect(spoken).not.toContain('16C7e42F')
		expect(spoken).not.toContain('ghp')
	})

	test('survives underscore italics around the token', () => {
		const spoken = normalize('The key is _ghp_16C7e42F292c6912E7710c838347Ae178B4a_ okay')
		expect(spoken).toBe('The key is a redacted secret okay')
		expect(spoken).not.toContain('16C7e42F')
		expect(spoken).not.toContain('ghp')
	})

	test('redacts a secret inside a table cell', () => {
		const spoken = normalize('| Name | Value |\n| - | - |\n| prod | sk-proj-abc123DEF456ghi789 |')
		expect(spoken).toBe('Name: prod. Value: a redacted secret.')
		expect(spoken).not.toContain('abc123')
	})
})
