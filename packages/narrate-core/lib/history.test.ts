import { afterAll, beforeEach, expect, test } from 'bun:test'
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PlaybackState } from './types'

const STATE_DIR = mkdtempSync(join(tmpdir(), 'narrate-history-'))
process.env.NARRATE_STATE_DIR = STATE_DIR

// Loaded after the env var so `paths` resolves to the temp dir instead of the real state dir.
const { paths } = await import('./state')
const { appendHistory, historyLimitEntries, pruneHistory, readHistory } = await import('./history')

afterAll(() => rmSync(STATE_DIR, { recursive: true, force: true }))

beforeEach(() => {
	mkdirSync(paths.root, { recursive: true })
	rmSync(paths.history, { force: true })
})

const finished = (label: string): PlaybackState => ({
	phase: 'done',
	pid: 1,
	label,
	origin: 'stdin',
	backend: 'say',
	voiceId: 'fake',
	speed: 1,
	sentences: [],
	words: [],
	duration: 0,
	position: 0,
	sentenceIndex: 0,
	skipped: [],
	updatedAt: new Date().toISOString(),
})

const record = (label: string) => appendHistory(finished(label), `${label} text.`)

const labels = async (limit?: number) => (await readHistory({ limit })).map((entry) => entry.label)

test('an empty state dir has no history', async () => {
	expect(await readHistory()).toEqual([])
})

test('entries come back newest first, and --limit takes them from that end', async () => {
	for (const label of ['alpha', 'bravo', 'charlie']) await record(label)

	expect(await labels()).toEqual(['charlie', 'bravo', 'alpha'])
	expect(await labels(2)).toEqual(['charlie', 'bravo'])
})

test('an entry carries what it takes to say it again', async () => {
	const written = await record('alpha')
	const [read] = await readHistory()

	expect(read).toEqual(written)
	expect(read).toMatchObject({ phase: 'done', origin: 'stdin', backend: 'say', voiceId: 'fake', speed: 1 })
	expect(read?.text).toBe('alpha text.')
	expect(Date.parse(read?.finishedAt ?? '')).toBeGreaterThan(0)
})

test('pruning drops the oldest entries past the cap', async () => {
	for (const label of ['alpha', 'bravo', 'charlie', 'delta']) await record(label)

	expect(await pruneHistory(2)).toEqual({ removed: 2 })
	expect(await labels()).toEqual(['delta', 'charlie'])
	// The file is still append-order, so the next narration lands on the end and still reads newest first.
	await record('echo')
	expect(await labels()).toEqual(['echo', 'delta', 'charlie'])
})

test('pruning under the cap rewrites nothing', async () => {
	await record('alpha')
	expect(await pruneHistory(2)).toEqual({ removed: 0 })
	expect(await labels()).toEqual(['alpha'])
})

test('a zero cap keeps everything', async () => {
	for (const label of ['alpha', 'bravo']) await record(label)
	expect(await pruneHistory(0)).toEqual({ removed: 0 })
	expect(await labels()).toEqual(['bravo', 'alpha'])
})

test('a line torn by a crash mid-append costs its own entry, not the file', async () => {
	await record('alpha')
	await record('bravo')
	appendFileSync(paths.history, '{"finishedAt":"2024-01-0')

	expect(await labels()).toEqual(['bravo', 'alpha'])
	expect(await pruneHistory(1)).toEqual({ removed: 1 })
	expect(await labels()).toEqual(['bravo'])
})

test('NARRATE_HISTORY_ENTRIES overrides the default, and junk falls back to it', () => {
	const original = process.env.NARRATE_HISTORY_ENTRIES
	process.env.NARRATE_HISTORY_ENTRIES = '5'
	expect(historyLimitEntries()).toBe(5)
	process.env.NARRATE_HISTORY_ENTRIES = 'wat'
	expect(historyLimitEntries()).toBe(200)
	delete process.env.NARRATE_HISTORY_ENTRIES
	expect(historyLimitEntries()).toBe(200)
	if (original !== undefined) process.env.NARRATE_HISTORY_ENTRIES = original
})
