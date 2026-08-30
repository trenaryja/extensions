import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { paths } from '../state'
import { listMessages, transcriptSource } from './transcript'

const LONG = 'The quick brown fox jumps over the lazy dog. '.repeat(6)

type Block = { type: string; text?: string; id?: string; thinking?: string }

const line = (fields: Record<string, unknown>, blocks: Block[]) =>
	JSON.stringify({
		type: 'assistant',
		isSidechain: false,
		message: { role: 'assistant', content: blocks },
		...fields,
	})

const text = (value: string) => ({ type: 'text', text: value })

let root = ''

const write = (relativePath: string, lines: string[], mtime: string) => {
	const filePath = join(root, relativePath)
	mkdirSync(dirname(filePath), { recursive: true })
	writeFileSync(filePath, `${lines.join('\n')}\n`)
	utimesSync(filePath, new Date(mtime), new Date(mtime))
}

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), 'narrate-transcripts-'))

	write(
		'-Users-justin-Git-alpha/session-alpha.jsonl',
		[
			line(
				{
					uuid: 'a1',
					sessionId: 'session-alpha',
					cwd: '/Users/justin/Git/alpha',
					timestamp: '2026-03-01T00:00:01.000Z',
				},
				[text(`first\n\n${LONG}`)],
			),
			line(
				{
					uuid: 'a2',
					sessionId: 'session-alpha',
					cwd: '/Users/justin/Git/alpha/nested',
					timestamp: '2026-03-01T00:00:02.000Z',
				},
				[text(`head ${LONG}`), { type: 'thinking', thinking: 'hidden reasoning' }, text(`tail ${LONG}`)],
			),
			line(
				{
					uuid: 'a3',
					sessionId: 'session-alpha',
					cwd: '/Users/justin/Git/alpha',
					timestamp: '2026-03-01T00:00:03.000Z',
					isSidechain: true,
				},
				[text(`sidechain ${LONG}`)],
			),
			line(
				{
					uuid: 'a4',
					sessionId: 'session-alpha',
					cwd: '/Users/justin/Git/alpha',
					timestamp: '2026-03-01T00:00:04.000Z',
				},
				[text('too short')],
			),
			line(
				{
					uuid: 'a5',
					sessionId: 'session-alpha',
					cwd: '/Users/justin/Git/alpha',
					timestamp: '2026-03-01T00:00:05.000Z',
				},
				[
					{ type: 'tool_use', id: 'tool-1' },
					{ type: 'thinking', thinking: LONG },
				],
			),
			line({ uuid: 'a6', sessionId: 'session-alpha', cwd: paths.scratch, timestamp: '2026-03-01T00:00:06.000Z' }, [
				text(`scratch ${LONG}`),
			]),
			JSON.stringify({
				type: 'user',
				uuid: 'a7',
				sessionId: 'session-alpha',
				cwd: '/Users/justin/Git/alpha',
				isSidechain: false,
				message: { role: 'user', content: [{ type: 'text', text: `assistant ${LONG}` }] },
			}),
			'{ not json at all',
		],
		'2026-06-03T00:00:00Z',
	)

	write(
		'-Users-justin-Git-beta/session-beta.jsonl',
		[
			line(
				{ uuid: 'b1', sessionId: 'session-beta', cwd: '/Users/justin/Git/beta', timestamp: '2026-02-01T00:00:01.000Z' },
				[text(`beta one ${LONG}`)],
			),
			line(
				{ uuid: 'b2', sessionId: 'session-beta', cwd: '/Users/justin/Git/beta', timestamp: '2026-02-01T00:00:02.000Z' },
				[text(`beta two ${LONG}`)],
			),
		],
		'2026-06-02T00:00:00Z',
	)

	// Oldest mtime but the newest timestamp of any message: an implementation that
	// scanned every file and only then truncated would surface this one first.
	write(
		'-Users-justin-Git-gamma/session-gamma.jsonl',
		[
			line(
				{
					uuid: 'g1',
					sessionId: 'session-gamma',
					cwd: '/Users/justin/Git/gamma',
					timestamp: '2026-09-09T00:00:00.000Z',
				},
				[text(`gamma ${LONG}`)],
			),
		],
		'2026-06-01T00:00:00Z',
	)
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('listMessages', () => {
	test('keeps only non-sidechain assistant messages with enough text', async () => {
		const messages = await listMessages({ root })
		expect(messages.map((message) => message.id)).toEqual([
			'session-gamma:g1',
			'session-alpha:a2',
			'session-alpha:a1',
			'session-beta:b2',
			'session-beta:b1',
		])
	})

	test('orders newest first and reads files newest-mtime-first', async () => {
		const messages = await listMessages({ root, limit: 3 })
		expect(messages.map((message) => message.id)).toEqual(['session-alpha:a2', 'session-alpha:a1', 'session-beta:b2'])
	})

	test('stops scanning once the limit is reached', async () => {
		const messages = await listMessages({ root, limit: 2 })
		expect(messages.map((message) => message.id)).toEqual(['session-alpha:a2', 'session-alpha:a1'])
		expect(messages.map((message) => message.sessionId)).not.toContain('session-gamma')
	})

	test('filters by exact project cwd', async () => {
		const messages = await listMessages({ root, project: '/Users/justin/Git/beta' })
		expect(messages.map((message) => message.id)).toEqual(['session-beta:b2', 'session-beta:b1'])
	})

	test('filters by project prefix at a path boundary', async () => {
		const messages = await listMessages({ root, project: '/Users/justin/Git/alpha' })
		expect(messages.map((message) => message.cwd)).toEqual([
			'/Users/justin/Git/alpha/nested',
			'/Users/justin/Git/alpha',
		])
		expect(await listMessages({ root, project: '/Users/justin/Git/alph' })).toEqual([])
	})

	test('honours minChars', async () => {
		const messages = await listMessages({ root, minChars: 5 })
		expect(messages.map((message) => message.id)).toContain('session-alpha:a4')
	})

	test('builds a single-line preview capped at 120 chars', async () => {
		const [first] = await listMessages({ root, limit: 1 })
		expect(first?.preview).not.toContain('\n')
		expect(first?.preview.length).toBe(120)
		expect(first?.preview.startsWith('head The quick brown fox')).toBe(true)
	})

	test('returns nothing for a missing root', async () => {
		expect(await listMessages({ root: join(root, 'nope') })).toEqual([])
	})
})

describe('transcriptSource', () => {
	test('resolves to the full text with the preview as label', async () => {
		const resolved = await transcriptSource('session-beta:b1', { root }).resolve()
		expect(resolved.origin).toBe('transcript')
		expect(resolved.text).toBe(`beta one ${LONG}`.trim())
		expect(resolved.label).toBe(`beta one ${LONG}`.trim().slice(0, 120))
	})

	test('joins multiple text blocks and drops thinking and tool_use', async () => {
		const resolved = await transcriptSource('session-alpha:a2', { root }).resolve()
		expect(resolved.text).toBe(`head ${LONG}\n\ntail ${LONG}`.trim())
		expect(resolved.text).not.toContain('hidden reasoning')
	})

	test('throws when the id is unknown', async () => {
		await expect(transcriptSource('session-beta:missing', { root }).resolve()).rejects.toThrow(
			'No transcript message with id session-beta:missing',
		)
	})
})
