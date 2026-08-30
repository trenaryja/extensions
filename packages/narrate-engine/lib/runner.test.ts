import { afterAll, beforeEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { PlaybackState, SpeechBackend } from './types'
import { silentWav, wavDuration, writeWav } from './wav'

const STATE_DIR = mkdtempSync(join(tmpdir(), 'narrate-runner-'))
process.env.NARRATE_STATE_DIR = STATE_DIR

// Loaded after the env var so `paths` resolves to the temp dir instead of the real state dir.
const { paths, readState } = await import('./state')
const { readHistory } = await import('./history')
const { runNarration } = await import('./runner')

const SENTENCES = ['Alpha zero.', 'Bravo one.', 'Charlie two.', 'Delta three.', 'Echo four.'] as const
const SECONDS = [0.4, 0.6, 0.2, 0.5, 0.3]
const TEXT = `${SENTENCES.slice(0, 3).join(' ')}\n${SENTENCES.slice(3).join(' ')}`

const FORMAT = { sampleRate: 8000, channels: 1, bitsPerSample: 16 }
const SOURCE_DIR = join(STATE_DIR, 'fake-audio')
mkdirSync(SOURCE_DIR, { recursive: true })

const fakeBackend = (failing?: string): SpeechBackend => ({
	id: 'say',
	defaultVoiceId: 'fake',
	voices: async () => [],
	synthesize: async (text) => {
		if (text === failing) throw new Error(`synthesis failed for ${text}`)
		const index = SENTENCES.findIndex((sentence) => sentence === text)
		const duration = SECONDS[index] ?? 0.1
		const wavPath = join(SOURCE_DIR, `${index}.wav`)
		await writeWav(wavPath, silentWav(FORMAT, duration))
		return { wavPath, duration, words: [{ text: `word${index}`, start: 0, end: duration }] }
	},
})

type Played = { name: string; speed: number; seconds: number; position: number }

const fakePlayer = (onPlay: (index: number) => void = () => undefined) => {
	const played: Played[] = []

	const play = async (path: string, speed: number) => {
		played.push({
			name: basename(path),
			speed,
			seconds: await wavDuration(path),
			position: (await readState())?.position ?? -1,
		})
		onPlay(played.length - 1)
		await Bun.sleep(20)
	}

	return { played, play }
}

const run = (options: Partial<Parameters<typeof runNarration>[0]>, deps: Parameters<typeof runNarration>[1]) =>
	runNarration(
		{ text: TEXT, label: 'test', origin: 'stdin', backend: 'say', voiceId: 'fake', speed: 1, ...options },
		deps,
	)

const spans = (state: Awaited<ReturnType<typeof run>>) =>
	state.sentences.map((sentence) => [sentence.start, sentence.end])

const closeTo = (actual: number[][], expected: number[][]) => {
	expect(actual.length).toBe(expected.length)
	actual.forEach((span, index) => span.forEach((value, edge) => expect(value).toBeCloseTo(expected[index]![edge]!, 6)))
}

const WAIT_TIMEOUT_MS = 2000

// Polls the state file rather than the runner's internals; a control that never lands fails an
// assertion instead of parking the test forever.
const waitForState = async (ready: (state: PlaybackState) => boolean) => {
	const deadline = Date.now() + WAIT_TIMEOUT_MS
	while (Date.now() < deadline) {
		const state = await readState()
		if (state && ready(state)) return state
		await Bun.sleep(5)
	}
	return null
}

// Pauses during the first paragraph, runs `whileParked` once the runner has parked, and plays
// everything after that normally.
const pausingPlayer = (whileParked: (paused: PlaybackState | null) => Promise<void>) => {
	const played: string[] = []

	const play = async (path: string, _speed: number, signal: AbortSignal) => {
		played.push(basename(path))
		if (played.length > 1) return Bun.sleep(20)

		writeFileSync(paths.pause, '')
		void waitForState((state) => state.phase === 'paused').then(whileParked)
		return new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
	}

	return { played, play }
}

beforeEach(() => {
	for (const path of [
		paths.state,
		paths.stop,
		paths.pause,
		paths.resume,
		paths.seek,
		paths.rate,
		paths.pid,
		paths.log,
		paths.history,
	])
		rmSync(path, { force: true })
})

test('plays one contiguous wav per paragraph and ends done', async () => {
	const { played, play } = fakePlayer()
	const state = await run({}, { backend: fakeBackend(), play })

	expect(played.map((entry) => entry.name)).toEqual(['0.wav', '1.wav'])
	expect(played[0]!.seconds).toBeCloseTo(1.2, 6)
	expect(played[1]!.seconds).toBeCloseTo(0.8, 6)
	expect(state.phase).toBe('done')
	expect(state.skipped).toEqual([])
	expect((await readState())?.phase).toBe('done')
})

test('sentence times run cumulatively through a paragraph and on into the next', async () => {
	const state = await run({}, { backend: fakeBackend(), play: fakePlayer().play })

	closeTo(spans(state), [
		[0, 0.4],
		[0.4, 1.0],
		[1.0, 1.2],
		[1.2, 1.7],
		[1.7, 2.0],
	])
	expect(state.duration).toBeCloseTo(2.0, 6)
	expect(state.position).toBeCloseTo(2.0, 6)
	expect(state.sentenceIndex).toBe(4)
	expect(state.words.map((word) => word.text)).toEqual(SENTENCES.map((_, index) => `word${index}`))
	// Every fake word covers its whole sentence, so the word map has to land on the sentence map.
	expect(state.words.map((word) => [word.start, word.end])).toEqual(spans(state))
})

test('seek to a sentence restarts playback at that sentence, mid-paragraph', async () => {
	const { played, play } = fakePlayer((index) => {
		if (index === 0) writeFileSync(paths.seek, JSON.stringify({ sentence: 4 }))
	})
	const state = await run({}, { backend: fakeBackend(), play })

	expect(played.map((entry) => entry.name)).toEqual(['0.wav', 'seek.wav'])
	expect(played[1]!.position).toBeCloseTo(1.7, 6)
	// Sentence 4 starts 0.5 s into a 0.8 s paragraph.
	expect(played[1]!.seconds).toBeCloseTo(0.3, 6)
	expect(state.phase).toBe('done')
	expect(state.sentenceIndex).toBe(4)
})

test('seek to a time starts part-way through the sentence holding it', async () => {
	const { played, play } = fakePlayer((index) => {
		if (index === 0) writeFileSync(paths.seek, JSON.stringify({ seconds: 1.5 }))
	})
	const state = await run({}, { backend: fakeBackend(), play })

	expect(played.map((entry) => entry.name)).toEqual(['0.wav', 'seek.wav'])
	expect(played[1]!.position).toBeCloseTo(1.5, 6)
	expect(played[1]!.seconds).toBeCloseTo(0.5, 6)
	expect(state.sentenceIndex).toBe(4)
})

test('rate replays the current sentence at the new speed and keeps going', async () => {
	const played: { name: string; speed: number }[] = []
	let bumped = false

	const play = async (path: string, speed: number, signal: AbortSignal) => {
		played.push({ name: basename(path), speed })

		if (!bumped) {
			bumped = true
			writeFileSync(paths.rate, '1.5')
			await new Promise<void>((resolve) => {
				signal.addEventListener('abort', () => resolve(), { once: true })
			})
			return
		}

		await Bun.sleep(20)
	}

	const state = await run({}, { backend: fakeBackend(), play })

	expect(played).toEqual([
		{ name: '0.wav', speed: 1 },
		{ name: '0.wav', speed: 1.5 },
		{ name: '1.wav', speed: 1.5 },
	])
	expect(state.speed).toBe(1.5)
	expect(state.phase).toBe('done')
})

test('pause parks the runner with the clock stopped, and resume plays on', async () => {
	const positions: number[] = []

	const { played, play } = pausingPlayer(async (paused) => {
		positions.push(paused?.position ?? -1)
		// Longer than the runner's 250 ms position tick, so a clock still running would show up here.
		await Bun.sleep(400)
		positions.push((await readState())?.position ?? -1)
		writeFileSync(paths.resume, '')
	})

	const state = await run({}, { backend: fakeBackend(), play })

	expect(positions).toEqual([0, 0])
	expect(played).toEqual(['0.wav', '0.wav', '1.wav'])
	expect(state.phase).toBe('done')
})

test('seek while paused moves the position and stays paused', async () => {
	const seeked: PlaybackState[] = []

	const { played, play } = pausingPlayer(async () => {
		writeFileSync(paths.seek, JSON.stringify({ sentence: 4 }))
		const landed = await waitForState((current) => current.sentenceIndex === 4)
		if (landed) seeked.push(landed)
		writeFileSync(paths.resume, '')
	})

	const state = await run({}, { backend: fakeBackend(), play })

	expect(seeked[0]?.phase).toBe('paused')
	// Sentence 4 starts 0.5 s into the second paragraph, so resuming plays a slice.
	expect(played).toEqual(['0.wav', 'seek.wav'])
	expect(state.sentenceIndex).toBe(4)
	expect(state.phase).toBe('done')
})

test('a paused runner still stops', async () => {
	const { played, play } = pausingPlayer(async () => {
		writeFileSync(paths.stop, '')
	})

	const state = await run({}, { backend: fakeBackend(), play })

	expect(played).toEqual(['0.wav'])
	expect(state.phase).toBe('stopped')
})

test('stop mid-paragraph leaves the position where it was heard', async () => {
	const { played, play } = fakePlayer((index) => {
		if (index === 0) writeFileSync(paths.stop, '')
	})
	const state = await run({}, { backend: fakeBackend(), play })

	expect(played.map((entry) => entry.name)).toEqual(['0.wav'])
	expect(state.phase).toBe('stopped')
	expect(state.sentenceIndex).toBe(0)
	expect(state.position).toBeLessThan(state.sentences[1]!.start)
})

test('a sentence whose synthesis fails becomes a 0.3 s gap in the same wav', async () => {
	const { played, play } = fakePlayer()
	const state = await run({}, { backend: fakeBackend(SENTENCES[1]), play })

	expect(state.skipped).toEqual([1])
	closeTo(spans(state), [
		[0, 0.4],
		[0.4, 0.7],
		[0.7, 0.9],
		[0.9, 1.4],
		[1.4, 1.7],
	])
	expect(played.map((entry) => entry.name)).toEqual(['0.wav', '1.wav'])
	expect(played[0]!.seconds).toBeCloseTo(0.9, 6)
	expect(state.phase).toBe('done')
	expect(await Bun.file(paths.log).text()).toContain('synthesis failed for Bravo one.')
})

test('a finished narration appends one history entry holding its own input text', async () => {
	await run({}, { backend: fakeBackend(), play: fakePlayer().play })

	expect(await readHistory()).toMatchObject([
		{ phase: 'done', label: 'test', origin: 'stdin', backend: 'say', voiceId: 'fake', speed: 1, text: TEXT },
	])
})

test('a narration cut short by stop is history too', async () => {
	const { play } = fakePlayer((index) => {
		if (index === 0) writeFileSync(paths.stop, '')
	})
	await run({}, { backend: fakeBackend(), play })

	expect((await readHistory())[0]?.phase).toBe('stopped')
})

test('startIndex renders and plays only from that sentence on', async () => {
	const { played, play } = fakePlayer()
	const state = await run({ startIndex: 3 }, { backend: fakeBackend(), play })

	expect(played.map((entry) => entry.name)).toEqual(['1.wav'])
	closeTo(spans(state).slice(3), [
		[0, 0.5],
		[0.5, 0.8],
	])
	expect(spans(state).slice(0, 3)).toEqual([
		[-1, -1],
		[-1, -1],
		[-1, -1],
	])
	expect(state.phase).toBe('done')
})

afterAll(() => rmSync(STATE_DIR, { recursive: true, force: true }))
