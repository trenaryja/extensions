import { describe, expect, test } from 'bun:test'
import { parseFlags, pickId } from './cli-args'

const SPEC = { json: 'boolean', voice: 'string', speed: 'number' } as const

describe('parseFlags', () => {
	test('defaults booleans to false and leaves valued flags undefined', () => {
		expect(parseFlags([], SPEC)).toEqual({ flags: { json: false }, positional: [] })
	})

	test('reads values from the next argument and from --flag=value', () => {
		expect(parseFlags(['--voice', 'Ava', '--speed=1.5', '--json'], SPEC).flags).toEqual({
			json: true,
			voice: 'Ava',
			speed: 1.5,
		})
	})

	test('collects positionals in order', () => {
		expect(parseFlags(['12', '--json', 'tail'], SPEC).positional).toEqual(['12', 'tail'])
	})

	test('takes a dashed value when it follows a valued flag', () => {
		expect(parseFlags(['--voice', '--weird'], SPEC).flags.voice).toBe('--weird')
	})

	test('rejects unknown flags, short or long', () => {
		expect(() => parseFlags(['--nope'], SPEC)).toThrow('unknown flag: --nope')
		expect(() => parseFlags(['-j'], SPEC)).toThrow('unknown flag: -j')
	})

	test('rejects a value on a boolean flag and a missing value on a valued flag', () => {
		expect(() => parseFlags(['--json=yes'], SPEC)).toThrow('--json takes no value')
		expect(() => parseFlags(['--voice'], SPEC)).toThrow('--voice requires a value')
	})

	test('rejects a non-numeric number', () => {
		expect(() => parseFlags(['--speed', 'fast'], SPEC)).toThrow('--speed expects a number, got: fast')
	})
})

describe('pickId', () => {
	const IDS = ['kokoro', 'say'] as const

	test('falls back when the flag is absent', () => {
		expect(pickId(IDS, undefined, { fallback: 'kokoro', flag: 'backend' })).toBe('kokoro')
	})

	test('returns a member of the union', () => {
		expect(pickId(IDS, 'say', { fallback: 'kokoro', flag: 'backend' })).toBe('say')
	})

	test('rejects a value outside the union', () => {
		expect(() => pickId(IDS, 'espeak', { fallback: 'kokoro', flag: 'backend' })).toThrow(
			'--backend must be one of: kokoro, say',
		)
	})
})
