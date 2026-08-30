import { expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PlaybackState } from './types'

process.env.NARRATE_STATE_DIR = mkdtempSync(join(tmpdir(), 'narrate-state-'))

const { ensureStateDirs, readState, writeState } = await import('./state')

ensureStateDirs()

const stateOf = (sentences: number): PlaybackState => ({
	phase: 'playing',
	pid: process.pid,
	label: 'test',
	origin: 'stdin',
	backend: 'say',
	voiceId: 'fake',
	speed: 1,
	sentences: Array.from({ length: sentences }, (_, index) => ({
		text: `sentence ${index}`,
		start: index,
		end: index + 1,
	})),
	words: [],
	duration: sentences,
	position: 0,
	sentenceIndex: 0,
	skipped: [],
	updatedAt: new Date().toISOString(),
})

// `narrate status` polls this file while the runner rewrites it four times a second. A truncating
// write or a read sized from a stale stat hands the poller a torn document.
test('a reader polling a state that is being rewritten never sees a torn document', async () => {
	// Sizes vary so every read straddles a length change — a torn read shows up as a short one.
	const sizes = [1, 400, 5, 900, 30, 1500, 2, 700]
	let reads = 0

	const writing = (async () => {
		for (let round = 0; round < 40; round++) await writeState(stateOf(sizes[round % sizes.length]!))
	})()

	const reading = (async () => {
		while (reads < 400) {
			const state = await readState()
			reads++
			if (!state) continue
			expect(sizes).toContain(state.sentences.length)
			expect(state.sentences.at(-1)?.text).toBe(`sentence ${state.sentences.length - 1}`)
		}
	})()

	await Promise.all([writing, reading])
	expect(await readState()).not.toBeNull()
})
