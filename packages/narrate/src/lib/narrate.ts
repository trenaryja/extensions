import { environment, getPreferenceValues, LocalStorage } from '@raycast/api'
import type { BackendId, Origin } from '@repo/narrate-core/types'
import { HistoryEntry, isLivePhase, PlaybackState, TranscriptMessage, Voice } from '@repo/narrate-core/types'
import { spawn } from 'node:child_process'
import { chmodSync, statSync } from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import * as R from 'remeda'
import { z } from 'zod'

const Status = z.union([PlaybackState, z.object({ phase: z.literal('idle') })])
export type Status = z.infer<typeof Status>

const Started = z.object({ pid: z.number(), label: z.string(), sentenceTotal: z.number() })

export const RATE_STEP = 0.25
const RATE_MIN = 0.25
const RATE_MAX = 4

let binary: string | undefined

// @repo/narrate-core compiles the CLI into assets/, which Raycast copies into the built extension.
const resolveBinary = () => {
	if (binary) return binary
	binary = join(environment.assetsPath, 'narrate')
	// Raycast copies assets without the exec bit.
	if (!(statSync(binary).mode & 0o111)) chmodSync(binary, 0o755)
	return binary
}

const { username } = userInfo()

// Raycast launches with a bare PATH; the engine's helpers (speech, claude, opencode) live on the login-shell one.
let loginPath: Promise<string> | undefined

const resolvePath = () => {
	loginPath ??= new Promise((resolve) => {
		let output = ''
		const shell = spawn('/bin/zsh', ['-ilc', 'print -r -- $PATH'], { stdio: ['ignore', 'pipe', 'ignore'] })
		shell.stdout.on('data', (data: Buffer) => (output += data.toString()))
		shell.on('close', () => resolve(output.trim() || (process.env.PATH ?? '')))
		shell.on('error', () => resolve(process.env.PATH ?? ''))
	})
	return loginPath
}

const cacheLimit = () => {
	const limit = getPreferenceValues<Preferences>().cacheLimitMb.trim()
	return limit ? { NARRATE_CACHE_MB: limit } : {}
}

const Failure = z.object({ error: z.string() })

const parseReply = <Reply>(reply: z.ZodType<Reply>, args: string[], stdout: string) => {
	const parsed = reply.safeParse(JSON.parse(stdout))
	if (!parsed.success) throw new Error(`narrate ${args.join(' ')}: ${z.prettifyError(parsed.error)}`)
	return parsed.data
}

const failureOf = (stderr: string, code: number | null) => {
	try {
		return new Error(Failure.parse(JSON.parse(stderr)).error)
	} catch {
		return new Error(stderr.trim() || `narrate exited with ${code}`)
	}
}

const run = async <Reply>(reply: z.ZodType<Reply>, args: string[], input?: string) => {
	const PATH = await resolvePath()

	return new Promise<Reply>((resolve, reject) => {
		const child = spawn(resolveBinary(), [...args, '--json'], {
			// Left unset when the preference is empty, so the engine's own default applies.
			// Raycast's process has no USER, and the claude CLI reads its keychain account name from it.
			env: { ...process.env, PATH, USER: username, LOGNAME: username, ...cacheLimit() },
			stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
		})
		let stdout = ''
		let stderr = ''
		child.stdout?.on('data', (data: Buffer) => (stdout += data.toString()))
		child.stderr?.on('data', (data: Buffer) => (stderr += data.toString()))
		child.on('error', reject)
		child.on('close', (code) => {
			if (code !== 0) return void reject(failureOf(stderr, code))
			try {
				resolve(parseReply(reply, args, stdout))
			} catch (error) {
				reject(error)
			}
		})
		if (input !== undefined) child.stdin?.end(input)
	})
}

// Raycast extensions cannot write their own preferences, so the backend, the per-backend voice and the
// preview phrase all live in LocalStorage where the Choose Voice command can set them.
export const DEFAULT_BACKEND: BackendId = 'kokoro'

export const PREVIEW_SAMPLE = 'This is how I sound reading your messages aloud.'

const voiceKey = (backend: BackendId) => `voice:${backend}`

export const currentBackend = async () => (await LocalStorage.getItem<BackendId>('backend')) ?? DEFAULT_BACKEND

export const selectBackend = (backend: BackendId) => LocalStorage.setItem('backend', backend)

// A backend with nothing chosen falls through to the engine's own default.
export const selectedVoice = (backend: BackendId) => LocalStorage.getItem<string>(voiceKey(backend))

export const selectVoice = (backend: BackendId, voiceId: string) => LocalStorage.setItem(voiceKey(backend), voiceId)

export const clearVoice = (backend: BackendId) => LocalStorage.removeItem(voiceKey(backend))

// `||`: a stored-but-blank phrase must fall back too.
export const previewText = async () => (await LocalStorage.getItem<string>('previewText'))?.trim() || PREVIEW_SAMPLE

export const setPreviewText = (text: string) => LocalStorage.setItem('previewText', text.trim())

type SpeechOverride = { backend: BackendId; voice: string }

const speechFlags = async (override?: SpeechOverride) => {
	const { speed } = getPreferenceValues<Preferences>()
	const backend = override?.backend ?? (await currentBackend())
	const voice = override?.voice ?? (await selectedVoice(backend))
	return ['--backend', backend, '--speed', speed.trim() || '1', ...(voice ? ['--voice', voice] : [])]
}

export const listMessages = (limit = 50) => run(z.array(TranscriptMessage), ['list', '--limit', String(limit)])

export const history = (limit = 50) => run(z.array(HistoryEntry), ['history', '--limit', String(limit)])

export const playMessage = async (id: string) => run(Started, ['play', '--message', id, ...(await speechFlags())])

const playArgs = async (label: string, origin: Origin, override?: SpeechOverride) => [
	'play',
	'--label',
	label,
	'--origin',
	origin,
	...(await speechFlags(override)),
]

export const playText = async (text: string, label: string, override?: SpeechOverride) =>
	run(Started, await playArgs(label, 'selection', override), text)

// The entry's text is already normalized, and its speech settings are deliberately dropped: a replay is
// meant to be heard in whatever voice the owner is on now.
export const replay = async (entry: HistoryEntry) =>
	run(Started, [...(await playArgs(entry.label, entry.origin)), '--raw'], entry.text)

export const listVoices = (backend: BackendId) => run(z.array(Voice), ['voices', '--backend', backend])

export const summarizer = () => getPreferenceValues<Preferences>().summarizer

export const summarizeAndPlay = async (id: string) =>
	run(z.object({ summary: z.string(), playback: Started }), [
		'summarize',
		'--message',
		id,
		'--summarizer',
		summarizer(),
		'--play',
		...(await speechFlags()),
	])

export const messageText = async (id: string) =>
	(await run(z.object({ text: z.string() }), ['normalize', '--message', id])).text

export const status = () => run(Status, ['status'])

export const stop = () => run(z.object({ stopped: z.boolean() }), ['stop'])

export const seek = (index: number) => run(z.object({ index: z.number() }), ['seek', String(index)])

export const rate = (speed: number) => run(z.object({ speed: z.number() }), ['rate', String(speed)])

export const pause = () => run(z.object({ paused: z.boolean() }), ['pause'])

export const resume = () => run(z.object({ resumed: z.boolean() }), ['resume'])

export const isActive = (state: Status): state is PlaybackState => state.phase !== 'idle' && isLivePhase(state.phase)

// Nudges the running narration by one step; null when nothing is playing.
export const nudgeRate = async (direction: 1 | -1) => {
	const state = await status()
	if (!isActive(state)) return null
	const stepped = Math.round((state.speed + direction * RATE_STEP) / RATE_STEP) * RATE_STEP
	const to = R.clamp(stepped, { min: RATE_MIN, max: RATE_MAX })
	if (to !== state.speed) await rate(to)
	return { from: state.speed, to }
}

export const describeRateChange = ({ from, to }: { from: number; to: number }) =>
	from === to ? `${to}× (limit)` : `${from}× → ${to}×`

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export {
	type BackendId,
	type HistoryEntry,
	type Phase,
	type PlaybackState,
	type Sentence,
	type TranscriptMessage,
	type Voice,
} from '@repo/narrate-core/types'
