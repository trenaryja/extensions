import { appendFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import * as R from 'remeda'
import { getBackend } from './backends'
import { pruneAudioCache } from './cache'
import { chunk } from './chunk'
import { appendHistory, pruneHistory } from './history'
import { playWav } from './player'
import { ensureStateDirs, paths, readState, requestStop, writeState } from './state'
import { isLivePhase } from './types'
import type { BackendId, Chunk, Origin, PlaybackState, SeekTarget, SpeechBackend } from './types'
import type { Wav, WavFormat } from './wav'
import { concatWav, readWav, silentWav, sliceWav, wavSeconds, writeWav } from './wav'

const POLL_MS = 100
const POSITION_MS = 250
const TAKEOVER_TIMEOUT_MS = 3000
const SEGMENTS_AHEAD = 1

// A sentence that failed to synthesize is heard as this much silence, so every later timestamp still lines
// up with the audio.
const SKIP_SECONDS = 0.3

// Only reached when the first paragraph fails outright: something has to define the silence standing in for it.
const FALLBACK_FORMAT: WavFormat = { sampleRate: 24_000, channels: 1, bitsPerSample: 16 }

type RunOptions = {
	text: string
	label: string
	origin: Origin
	backend: BackendId
	voiceId: string
	speed: number
	startIndex?: number
	maxChars?: number
}

type RunDeps = { backend?: SpeechBackend; play?: typeof playWav }

type Control =
	| { type: 'rate'; speed: number }
	| { type: 'seek'; target: SeekTarget }
	| { type: 'stop' }
	| { type: 'pause' }
	| { type: 'resume' }

type Segment = { wavPath: string; offset: number; duration: number }

// Where playback should pick up: a sentence, plus how far into it a `seek --time` landed.
type Cursor = { sentence: number; skew: number }

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

const wait = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve) => {
		const done = () => {
			// eslint-disable-next-line @typescript-eslint/no-use-before-define -- done and timer are a cycle: done clears the timer that calls it. Hoisting timer to a `let` is the only reordering, and it is worse
			clearTimeout(timer)
			signal.removeEventListener('abort', done)
			resolve()
		}

		const timer = setTimeout(done, ms)
		signal.addEventListener('abort', done, { once: true })
	})

const isAlive = (pid: number) => {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

// Two runners sharing one state file and one pid file would fight over afplay, so the newcomer
// stops the incumbent and waits for it to exit before claiming the state dir.
const takeOverSession = async () => {
	const existing = await readState()
	if (!existing || existing.pid === process.pid) return
	if (!isLivePhase(existing.phase)) return
	if (!isAlive(existing.pid)) return

	await requestStop()
	const deadline = Date.now() + TAKEOVER_TIMEOUT_MS
	while (Date.now() < deadline && isAlive(existing.pid)) await Bun.sleep(POLL_MS)
}

const SIGNALS = [paths.stop, paths.pause, paths.resume, paths.seek, paths.rate]

const clearSignals = () => Promise.all(SIGNALS.map((path) => rm(path, { force: true })))

const parseSeekTarget = (raw: string): SeekTarget | null => {
	try {
		const parsed = JSON.parse(raw)
		if (Number.isInteger(parsed?.sentence)) return { sentence: Math.max(0, parsed.sentence) }
		if (Number.isFinite(parsed?.seconds)) return { seconds: Math.max(0, parsed.seconds) }
		return null
	} catch {
		return null
	}
}

const takeSentinel = async (path: string) => {
	const file = Bun.file(path)
	if (!(await file.exists())) return null
	const contents = await file.text()
	await rm(path, { force: true })
	return contents
}

const readControl = async (): Promise<Control | null> => {
	if ((await takeSentinel(paths.stop)) !== null) return { type: 'stop' }
	if ((await takeSentinel(paths.pause)) !== null) return { type: 'pause' }
	if ((await takeSentinel(paths.resume)) !== null) return { type: 'resume' }

	const seek = await takeSentinel(paths.seek)

	if (seek !== null) {
		const target = parseSeekTarget(seek)
		return target ? { type: 'seek', target } : null
	}

	const rate = await takeSentinel(paths.rate)
	if (rate === null) return null
	const speed = Number(rate.trim())
	return Number.isFinite(speed) && speed > 0 ? { type: 'rate', speed } : null
}

const pollControl = async (signal: AbortSignal) => {
	while (!signal.aborted) {
		const control = await readControl()
		if (control) return control
		await Bun.sleep(POLL_MS)
	}

	return null
}

type Raced<T> = { control: Control; value: null } | { control: null; value: T }

// Runs `work` while watching the sentinel files, so a stop or seek lands mid-synthesis or
// mid-segment instead of at the next segment boundary.
const raceControl = async <T>(work: Promise<T>): Promise<Raced<T>> => {
	const watcher = new AbortController()
	const poller = pollControl(watcher.signal)
	const completed: Promise<Raced<T>> = work.then((value) => ({ control: null, value }))
	const raced = await Promise.race<Raced<T>>([
		completed,
		poller.then((control) => (control ? { control, value: null } : completed)),
	])
	watcher.abort()
	if (raced.control) return raced
	// `narrate stop` kills afplay before the poller sees the sentinel; drain the poller so its read isn't lost
	const control = (await poller) ?? (await readControl())
	return control ? { control, value: null } : raced
}

// Sentences are synthesized one at a time — cache reuse, and the first paragraph starts sooner — but they
// are played back as one wav per paragraph, so afplay only respawns at a paragraph boundary.
const toSegments = (chunks: Chunk[]) => {
	const segments: Chunk[][] = []

	for (const part of chunks) {
		const last = segments.at(-1)
		if (last?.[0]?.line === part.line) last.push(part)
		else segments.push([part])
	}

	return segments
}

// afplay cannot start at an offset, so anything but a segment from its first sample is played from a slice.
const audioFor = async (segment: Segment, startTime: number) => {
	if (startTime <= 0) return segment.wavPath
	await writeWav(paths.seekAudio, sliceWav(await readWav(segment.wavPath), startTime))
	return paths.seekAudio
}

type RendererOptions = {
	segments: Chunk[][]
	startSegment: number
	state: PlaybackState
	controller: AbortController
	backend: SpeechBackend
	voiceId: string
}

// Owns everything the audio side of the run mutates: the queue, the running offset, and the format
// every later segment inherits. The runner only ever asks for a segment and whether one has landed.
const createRenderer = ({ segments, startSegment, state, controller, backend, voiceId }: RendererOptions) => {
	const rendering = new Map<number, Promise<Segment>>()
	const settled = new Set<number>()
	let renderQueue: Promise<unknown> = Promise.resolve()
	let nextToRender = startSegment
	let renderedSeconds = 0
	let format: WavFormat | null = null

	const skipSentence = async (index: number, error: unknown) => {
		state.skipped.push(index)
		await appendFile(paths.log, `${new Date().toISOString()}\t${index}\t${message(error)}\n`)
	}

	const synthesizeSentence = async (part: Chunk) => {
		try {
			const synthesis = await backend.synthesize(part.text, voiceId, controller.signal)
			return { part, wav: await readWav(synthesis.wavPath), words: synthesis.words }
		} catch (error) {
			controller.signal.throwIfAborted()
			await skipSentence(part.index, error)
			return { part, wav: null, words: [] }
		}
	}

	const renderSegment = async (index: number): Promise<Segment> => {
		const parts = segments[index] ?? []
		const pieces = await Promise.all(R.map(parts, synthesizeSentence))
		controller.signal.throwIfAborted()

		const segmentFormat = pieces.find((piece) => piece.wav)?.wav?.format ?? format ?? FALLBACK_FORMAT
		format = segmentFormat
		const offset = renderedSeconds
		const audio: Wav[] = []
		let played = 0

		for (const piece of pieces) {
			const sentence = state.sentences[piece.part.index]
			const wav = piece.wav ?? silentWav(segmentFormat, SKIP_SECONDS)
			const start = offset + played
			played += wavSeconds(wav)
			if (sentence) Object.assign(sentence, { start, end: offset + played })
			for (const word of piece.words) state.words.push({ ...word, start: start + word.start, end: start + word.end })
			audio.push(wav)
		}

		const wavPath = join(paths.segments, `${index}.wav`)
		await writeWav(wavPath, concatWav(audio))
		/* eslint-disable require-atomic-updates -- render() chains every renderSegment onto renderQueue, so no second one is ever in flight to interleave with this write */
		renderedSeconds = offset + played
		state.duration = renderedSeconds
		/* eslint-enable require-atomic-updates */
		settled.add(index)
		await writeState(state)
		return { wavPath, offset, duration: played }
	}

	// Segments render in order: a segment's offset is only knowable once every earlier one has been measured.
	const render = (index: number) => {
		while (nextToRender <= index && nextToRender < segments.length) {
			const target = nextToRender++
			const segment = renderQueue.then(() => renderSegment(target))
			// A render nobody awaits — read-ahead, or anything in flight when a stop lands — must not
			// surface as an unhandled rejection.
			segment.catch(() => undefined)
			rendering.set(target, segment)
			renderQueue = segment.catch(() => undefined)
		}

		return rendering.get(index) ?? null
	}

	return { render, isSettled: (index: number) => settled.has(index) }
}

type CursorOptions = { state: PlaybackState; chunks: Chunk[]; firstSentence: number }

// Reads the sentence map; holds nothing of its own, so a cursor is always derived from current state.
const createCursors = ({ state, chunks, firstSentence }: CursorOptions) => {
	const sentenceAt = (position: number) => {
		const index = R.findLastIndex(state.sentences, (sentence) => sentence.start >= 0 && sentence.start <= position)
		return index < 0 ? firstSentence : index
	}

	const toCursor = (target: SeekTarget): Cursor => {
		if ('sentence' in target)
			return { sentence: Math.min(Math.max(target.sentence, firstSentence), chunks.length - 1), skew: 0 }

		const index = sentenceAt(target.seconds)
		const sentence = state.sentences[index]
		if (!sentence || sentence.start < 0) return { sentence: index, skew: 0 }
		return { sentence: index, skew: Math.max(0, Math.min(target.seconds, sentence.end) - sentence.start) }
	}

	const cursorPosition = (cursor: Cursor) => {
		const sentence = state.sentences[cursor.sentence]
		return sentence && sentence.start >= 0 ? sentence.start + cursor.skew : state.position
	}

	return { sentenceAt, toCursor, cursorPosition }
}

type PlayerOptions = {
	state: PlaybackState
	controller: AbortController
	play: typeof playWav
	segments: Chunk[][]
	chunks: Chunk[]
	cursors: ReturnType<typeof createCursors>
}

// Everything between handing a rendered segment to afplay and knowing where to pick up next:
// the position clock, the paused park, and how each control moves the cursor.
const createPlayer = ({ state, controller, play, segments, chunks, cursors }: PlayerOptions) => {
	const publishPosition = (position: number) => {
		state.position = position
		state.sentenceIndex = cursors.sentenceAt(position)
		return writeState(state)
	}

	const trackPosition = async (segment: Segment, startTime: number, signal: AbortSignal) => {
		const startedAt = Date.now()

		while (!signal.aborted) {
			await wait(POSITION_MS, signal)
			if (signal.aborted) return
			const heard = startTime + ((Date.now() - startedAt) / 1000) * state.speed
			await publishPosition(segment.offset + Math.min(heard, segment.duration))
		}
	}

	// afplay has been killed and the position tracker is stopped, so nothing moves until a control lands.
	// Seeking stays parked: it moves where resume will re-enter, it does not start playing again.
	const parkPaused = async (resumeAt: Cursor) => {
		let cursor = resumeAt
		state.phase = 'paused'
		await writeState(state)

		for (;;) {
			const control = await pollControl(controller.signal)
			if (!control || control.type === 'stop') return null
			if (control.type === 'resume') return cursor

			if (control.type === 'seek') {
				cursor = cursors.toCursor(control.target)
				await publishPosition(cursors.cursorPosition(cursor))
			}

			if (control.type === 'rate') {
				// eslint-disable-next-line require-atomic-updates -- state is this run's only playback record and this loop is its only writer while parked
				state.speed = control.speed
				await writeState(state)
			}
		}
	}

	const applyControl = async (control: Control, cursor: Cursor): Promise<Cursor | null> => {
		if (control.type === 'stop') return null
		if (control.type === 'seek') return cursors.toCursor(control.target)
		// Resume re-enters at the position already reached, so pausing mid-sentence does not replay it.
		if (control.type === 'pause')
			return parkPaused(state.phase === 'playing' ? cursors.toCursor({ seconds: state.position }) : cursor)
		if (control.type === 'resume') return cursor

		state.speed = control.speed
		await writeState(state)
		// Only the sentence being heard restarts; a rate change during synthesis leaves the cursor where it was.
		return state.phase === 'playing' ? { sentence: state.sentenceIndex, skew: 0 } : cursor
	}

	// Resolves to where playback picks up next, or null once a stop has been requested.
	const playSegment = async (index: number, segment: Segment, cursor: Cursor): Promise<Cursor | null> => {
		const sentence = state.sentences[cursor.sentence]
		const startTime = Math.max(0, (sentence && sentence.start >= 0 ? sentence.start : segment.offset) - segment.offset)
		const path = await audioFor(segment, startTime + cursor.skew)

		// eslint-disable-next-line require-atomic-updates -- state is this run's only playback record and the runner drives one segment at a time
		state.phase = 'playing'
		await publishPosition(segment.offset + startTime + cursor.skew)

		const playing = new AbortController()
		const tracking = new AbortController()
		const played = play(path, state.speed, AbortSignal.any([controller.signal, playing.signal]))
		const tracker = trackPosition(segment, startTime + cursor.skew, tracking.signal)
		const raced = await raceControl(played)
		tracking.abort()
		await tracker

		if (!raced.control) {
			await publishPosition(segment.offset + segment.duration)
			return { sentence: segments[index + 1]?.[0]?.index ?? chunks.length, skew: 0 }
		}

		playing.abort()
		// The next afplay may be handed the same seek.wav, so the one being killed has to be gone first.
		await played.catch(() => undefined)
		return applyControl(raced.control, cursor)
	}

	return { playSegment, applyControl }
}

export const runNarration = async (options: RunOptions, deps: RunDeps = {}) => {
	const { text, label, origin, voiceId, speed, maxChars } = options
	const backend = deps.backend ?? getBackend(options.backend)
	const play = deps.play ?? playWav

	await takeOverSession()
	await clearSignals()
	// The previous narration's paragraph wavs are dead weight, and its indices collide with this one's.
	await rm(paths.segments, { recursive: true, force: true })
	ensureStateDirs()

	const chunks = chunk(text, { maxChars })
	const segments = toSegments(chunks)
	const segmentOfSentence = R.pipe(
		segments,
		R.flatMap((parts, index) => R.map(parts, () => index)),
	)

	const firstSentence = Math.min(Math.max(options.startIndex ?? 0, 0), Math.max(chunks.length - 1, 0))
	const startSegment = segmentOfSentence[firstSentence] ?? 0

	const state: PlaybackState = {
		phase: 'synthesizing',
		pid: process.pid,
		label,
		origin,
		backend: options.backend,
		voiceId,
		speed,
		sentences: R.map(chunks, (part) => ({ text: part.text, start: -1, end: -1 })),
		words: [],
		duration: 0,
		position: 0,
		sentenceIndex: firstSentence,
		skipped: [],
		updatedAt: new Date().toISOString(),
	}
	await writeState(state)

	const controller = new AbortController()
	const renderer = createRenderer({ segments, startSegment, state, controller, backend, voiceId })
	const cursors = createCursors({ state, chunks, firstSentence })
	const player = createPlayer({ state, controller, play, segments, chunks, cursors })

	const finish = async (phase: PlaybackState['phase'], error?: string) => {
		controller.abort()
		state.phase = phase
		if (error) state.error = error
		await writeState(state)
		await rm(paths.pid, { force: true })
		await appendHistory(state, text)
		await pruneHistory()
		// Pruning after the narration keeps the wavs this run just played among the newest.
		await pruneAudioCache()
		return state
	}

	try {
		let cursor: Cursor | null = { sentence: firstSentence, skew: 0 }

		while (cursor && cursor.sentence < chunks.length) {
			const index = segmentOfSentence[cursor.sentence] ?? startSegment
			const segment = renderer.render(index)
			if (!segment) break

			if (!renderer.isSettled(index)) {
				state.phase = 'synthesizing'
				await writeState(state)
			}

			const raced = await raceControl(segment)

			if (raced.control) {
				cursor = await player.applyControl(raced.control, cursor)
				continue
			}

			void renderer.render(index + SEGMENTS_AHEAD)
			cursor = await player.playSegment(index, raced.value, cursor)
		}

		return await finish(cursor ? 'done' : 'stopped')
	} catch (error) {
		return await finish('error', message(error))
	}
}
