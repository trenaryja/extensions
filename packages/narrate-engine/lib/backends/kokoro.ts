import type { Socket } from 'bun'
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as R from 'remeda'
import workerScript from '../../worker/kokoro_worker.py' with { type: 'text' }
import workerProject from '../../worker/pyproject.toml' with { type: 'text' }
import { ensureStateDirs, paths } from '../state'
import type { SpeechBackend, Synthesis, Voice, VoiceGender, WorkerStatus } from '../types'
import { cachePath, readCachedSynthesis, writeCachedSynthesis } from './shared'

// Voice ids are <language><gender>_<name>, so the first two letters carry the locale and the gender.
const LOCALE_BY_PREFIX: Record<string, string> = {
	a: 'en-US',
	b: 'en-GB',
	e: 'es-ES',
	f: 'fr-FR',
	h: 'hi-IN',
	i: 'it-IT',
	p: 'pt-BR',
}

const DEFAULT_LOCALE = 'en-US'

// Kokoro-82M's VOICES.md, minus its Japanese and Mandarin voices: those need misaki[ja] and misaki[zh],
// which the worker doesn't install.
const VOICE_IDS = [
	'af_heart',
	'af_alloy',
	'af_aoede',
	'af_bella',
	'af_jessica',
	'af_kore',
	'af_nicole',
	'af_nova',
	'af_river',
	'af_sarah',
	'af_sky',
	'am_adam',
	'am_echo',
	'am_eric',
	'am_fenrir',
	'am_liam',
	'am_michael',
	'am_onyx',
	'am_puck',
	'am_santa',
	'bf_alice',
	'bf_emma',
	'bf_isabella',
	'bf_lily',
	'bm_daniel',
	'bm_fable',
	'bm_george',
	'bm_lewis',
	'ef_dora',
	'em_alex',
	'em_santa',
	'ff_siwis',
	'hf_alpha',
	'hf_beta',
	'hm_omega',
	'hm_psi',
	'if_sara',
	'im_nicola',
	'pf_dora',
	'pm_alex',
	'pm_santa',
]

const displayName = (voiceId: string) =>
	voiceId.replace(/^[a-z]{2}_/, '').replace(/^./, (initial) => initial.toUpperCase())

const GENDER_BY_PREFIX: Record<string, VoiceGender> = { f: 'female', m: 'male' }

const toVoice = (id: string): Voice => ({
	id,
	name: displayName(id),
	language: LOCALE_BY_PREFIX[id[0] ?? ''] ?? DEFAULT_LOCALE,
	gender: GENDER_BY_PREFIX[id[1] ?? ''],
})

const WORKER_SCRIPT = 'kokoro_worker.py'

// The compiled binary carries the worker as text: it has to reach disk before uv can run it, and a
// stale copy on disk would keep running yesterday's protocol.
const WORKER_FILES: Record<string, string> = { [WORKER_SCRIPT]: workerScript, 'pyproject.toml': workerProject }

const UV_FALLBACK = '/opt/homebrew/bin/uv'

// Raycast launches the engine with its own PATH, which has no homebrew bin on it.
const findUv = () => Bun.which('uv') ?? (existsSync(UV_FALLBACK) ? UV_FALLBACK : null)

const writeWorkerFiles = () => {
	mkdirSync(paths.worker, { recursive: true })

	for (const [name, content] of R.entries(WORKER_FILES)) {
		const path = join(paths.worker, name)
		if (existsSync(path) && readFileSync(path, 'utf8') === content) continue
		writeFileSync(path, content)
	}
}

// One request per connection, so a reply needs no correlation id.
type Connection = { socket: Socket; reply: Promise<string> }

const SOCKET_POLL_MS = 100
// Worst measured cold start is 5.2 s, and a first-ever voice download from Hugging Face adds several more.
const SPAWN_TIMEOUT_MS = 30_000

const openConnection = async (): Promise<Connection | null> => {
	const { promise: reply, resolve, reject } = Promise.withResolvers<string>()
	let buffer = ''

	const handlers = {
		data: (_socket: Socket, chunk: Buffer) => {
			buffer += chunk.toString()
			const end = buffer.indexOf('\n')
			if (end !== -1) resolve(buffer.slice(0, end))
		},
		close: () => reject(new Error('kokoro worker closed the connection without replying')),
		error: (_socket: Socket, error: Error) => reject(error),
	}

	// A probe connection is closed without reading, and an unhandled rejection would take the runner down.
	reply.catch(() => undefined)

	try {
		return { socket: await Bun.connect({ unix: paths.workerSocket, socket: handlers }), reply }
	} catch {
		// Nothing is listening: no socket file, or one left behind by a worker that was killed.
		return null
	}
}

// Warm spawn to a ready worker is 3.7 s (1.7 s of it loading the model) and a first-ever run downloads
// the model, so the worker outlives the runner that started it and every later caller reuses it.
const spawnWorker = async () => {
	const uv = findUv()
	if (!uv) throw new Error('the kokoro backend needs `uv` on PATH: brew install uv')
	writeWorkerFiles()

	const log = openSync(paths.workerLog, 'a')
	const child = Bun.spawn(
		[uv, 'run', '--project', paths.worker, 'python', join(paths.worker, WORKER_SCRIPT), paths.workerSocket],
		{ detached: true, stdin: 'ignore', stdout: log, stderr: log },
	)

	let exitCode: number | null = null
	void child.exited.then((code) => (exitCode = code))

	// The worker binds its socket before loading the model, so connecting is what "ready" means. A worker
	// that lost the race for the socket exits at once, which is why a dead child is not on its own a failure.
	const deadline = Date.now() + SPAWN_TIMEOUT_MS

	// eslint-disable-next-line no-unmodified-loop-condition -- exitCode is set from child.exited's continuation, which the rule cannot see
	while (exitCode === null) {
		const probe = await openConnection()

		if (probe) {
			probe.socket.end()
			child.unref()
			return
		}
		if (Date.now() > deadline)
			throw new Error(`nothing accepted a connection on ${paths.workerSocket}; see ${paths.workerLog}`)
		await Bun.sleep(SOCKET_POLL_MS)
	}
}

// A narration renders every segment at once, so without this the first one to find no worker would be
// joined by twenty more, each spawning a `uv` of its own and starving the one that wins the socket.
let starting: Promise<void> | null = null

const connectToWorker = async () => {
	const existing = await openConnection()
	if (existing) return existing

	starting ??= spawnWorker().finally(() => (starting = null))
	await starting

	const connection = await openConnection()
	if (!connection) throw new Error(`the kokoro worker did not come up; see ${paths.workerLog}`)
	return connection
}

const exchange = async <Reply>({ socket, reply }: Connection, request: object, signal?: AbortSignal) => {
	// `reply` rejects on close, which says nothing about why, so the abort carries its own reason.
	const { promise: cancelled, reject } = Promise.withResolvers<never>()
	cancelled.catch(() => undefined)

	// The worker can't cancel a synthesis in flight, so an abort just drops the connection and lets it finish.
	const abandon = () => {
		socket.end()
		reject(signal?.reason)
	}

	signal?.addEventListener('abort', abandon, { once: true })

	try {
		signal?.throwIfAborted()
		socket.write(`${JSON.stringify(request)}\n`)
		const response = JSON.parse(await Promise.race([reply, cancelled]))
		if ('error' in response) throw new Error(`kokoro worker: ${response.error}`)
		return response as Reply
	} finally {
		signal?.removeEventListener('abort', abandon)
		socket.end()
	}
}

const request = async <Reply>(payload: object, signal?: AbortSignal) =>
	exchange<Reply>(await connectToWorker(), payload, signal)

// Answers null when no worker is running, rather than starting one to ask.
export const workerStatus = async () => {
	const connection = await openConnection()
	if (!connection) return null
	return exchange<WorkerStatus>(connection, { op: 'status' })
}

export const stopWorker = async () => {
	const connection = await openConnection()
	if (!connection) return false
	await exchange<{ stopping: true }>(connection, { op: 'stop' })
	return true
}

export const kokoroBackend: SpeechBackend = {
	id: 'kokoro',
	defaultVoiceId: 'af_heart',

	voices: async () => R.map(VOICE_IDS, toVoice),

	synthesize: async (text, voiceId, signal) => {
		ensureStateDirs()
		const wavPath = cachePath(`kokoro${voiceId}${text}`, '.wav')
		const cached = await readCachedSynthesis(wavPath)
		if (cached) return cached

		const synthesis = await request<Synthesis>({ text, voice: voiceId, out: wavPath }, signal)
		// The sidecar is what makes a wav cacheable, so one left behind by an abandoned request is never served.
		await writeCachedSynthesis(synthesis)
		return synthesis
	},
}
