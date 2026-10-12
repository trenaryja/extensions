import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import type {
	AudioSource,
	DictateEvent,
	DictateOptions,
	DictateSession,
	Dictionary,
	InputDevice,
	ListenEvent,
	ListenOptions,
	ListenSession,
	TranscribeBackend,
	TranscribeOptions,
	Transcription,
} from './types'

export const NATIVE_BINARY = `hearsay-native${process.platform === 'win32' ? '.exe' : ''}`

const exitCode = (child: ChildProcess) =>
	new Promise<number | null>((resolve) => {
		child.on('close', resolve)
	})

/**
 * A missing or unrunnable binary arrives as an `error` event, and the `close` that follows carries no
 * exit code — so without this the caller sees an empty-stdout JSON parse error instead of the path.
 */
const start = (binary: string, args: string[]) => {
	const child = spawn(binary, args)
	let stderr = ''
	let failure: Error | undefined
	child.on('error', (error) => (failure = error))
	child.stderr.on('data', (chunk) => (stderr += chunk))

	const settled = async () => {
		const code = await exitCode(child)
		if (failure) throw failure
		if (code) throw new Error(stderr.trim() || `${NATIVE_BINARY} exited with ${code}`)
	}

	return { child, settled }
}

const run = async <T>(binary: string, args: string[]) => {
	const { child, settled } = start(binary, args)
	let stdout = ''
	child.stdout.on('data', (chunk) => (stdout += chunk))
	await settled()
	return JSON.parse(stdout) as T
}

const listenArgs = ({ device, seconds, out, vad }: ListenOptions) => {
	const args = ['listen']
	if (device) args.push('--device', device)
	if (seconds !== undefined) args.push('--seconds', String(seconds))
	if (out) args.push('--out', out)
	if (vad) args.push('--vad', vad)
	return args
}

/** Every recording verb speaks the same JSON-lines-out, one-command-in protocol. */
const stream = <T>(binary: string, args: string[]) => {
	const { child, settled } = start(binary, args)

	async function* events() {
		for await (const line of createInterface({ input: child.stdout })) yield JSON.parse(line) as T
		await settled()
	}

	// A closed stdin is also how the helper learns its parent is gone, so `end` doubles as the command write.
	// Guarded because a second press on a toggle lands here after the first already closed it.
	const send = (command: string) => {
		if (child.stdin.writable) child.stdin.end(`${command}\n`)
	}

	return { events: events(), stop: () => send('stop'), cancel: () => send('cancel') }
}

/** `binary` is explicit so the extension can point at its own VSIX asset without any path guessing here. */
export const createNativeSource = (binary: string): AudioSource => ({
	id: 'native',
	devices: async () => (await run<{ devices: InputDevice[] }>(binary, ['devices'])).devices,
	listen: (options): ListenSession => stream<ListenEvent>(binary, listenArgs(options)),
})

const dictionaryArgs = (dictionary?: Dictionary) => (dictionary ? ['--dictionary', JSON.stringify(dictionary)] : [])

const transcribeArgs = (model: string, wav: string, { language, prompt, threads, dictionary }: TranscribeOptions) => {
	const args = ['transcribe', '--model', model, '--wav', wav, ...dictionaryArgs(dictionary)]
	if (language) args.push('--language', language)
	if (prompt) args.push('--prompt', prompt)
	if (threads !== undefined) args.push('--threads', String(threads))
	return args
}

/**
 * Same binary as `createNativeSource`; `model` is an already-resolved ggml `.bin` — see `resolveModel`.
 * One process per call, so each pays the model load. `dictate` is the resident alternative.
 */
export const createWhisperBackend = (binary: string, model: string): TranscribeBackend => ({
	id: 'whisper',
	transcribe: (wav, options = {}) => run<Transcription>(binary, transcribeArgs(model, wav, options)),
})

const dictateArgs = (model: string, options: DictateOptions) => {
	const args = ['dictate', '--model', model, ...dictionaryArgs(options.dictionary)]
	if (options.device) args.push('--device', options.device)
	if (options.seconds !== undefined) args.push('--seconds', String(options.seconds))
	if (options.out) args.push('--out', options.out)
	if (options.language) args.push('--language', options.language)
	if (options.threads !== undefined) args.push('--threads', String(options.threads))
	if (options.partialMs !== undefined) args.push('--partial-ms', String(options.partialMs))
	if (options.silenceMs !== undefined) args.push('--silence-ms', String(options.silenceMs))
	if (options.maxSeconds !== undefined) args.push('--max-seconds', String(options.maxSeconds))
	if (options.chime) args.push('--chime', 'on')
	return args
}

/**
 * Records and transcribes in one process: the model loads once, and every pause commits an utterance
 * without waiting for the recording to end. This is what makes a batch model feel like a streaming one.
 */
export const dictate = (binary: string, model: string, options: DictateOptions = {}): DictateSession =>
	stream<DictateEvent>(binary, dictateArgs(model, options))

/** The dictionary applied to text with no audio behind it — one process for the whole batch. */
export const correct = async (binary: string, dictionary: Dictionary, texts: readonly string[]) => {
	const args = ['correct', ...dictionaryArgs(dictionary), ...texts.flatMap((text) => ['--text', text])]
	return (await run<{ texts: string[] }>(binary, args)).texts
}
