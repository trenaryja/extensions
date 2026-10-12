#!/usr/bin/env bun
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import {
	createNativeSource,
	createWhisperBackend,
	DEFAULT_MODEL_ID,
	importSuperwhisper,
	listModels,
	megabytes,
	MODEL_IDS,
	NATIVE_BINARY,
	resolveModel,
	dictate as startDictation,
	SUPERWHISPER_SETTINGS,
	VAD_POLICIES,
} from './lib'
import type { Dictionary, DownloadProgress, ListenOptions } from './lib'

const USAGE = `usage: cli.ts <verb> [--json]
  devices
  import-superwhisper [PATH] [--dictionary JSON]
  dictate [--device NAME] [--seconds N] [--out PATH] [--model ${MODEL_IDS.join('|')}] [--model-path PATH]
          [--language LANG] [--partial-ms N] [--silence-ms N] [--max-seconds N] [--dictionary JSON]
          [--chime]
  listen [--device NAME] [--seconds N] [--out PATH] [--vad ${VAD_POLICIES.join('|')}]
  models
  transcribe <wav> [--model ${MODEL_IDS.join('|')}] [--model-path PATH] [--language LANG] [--prompt TEXT]
             [--dictionary JSON]

  JSON is {"vocabulary": ["CLAUDE.md"], "replacements": {"clawed": "Claude"}}`

// Only this dev entrypoint needs a default home — the extension always passes its own globalStorage.
const modelsDir = join(process.env.HEARSAY_STATE_DIR ?? join(homedir(), '.local', 'state', 'hearsay'), 'models')

// The VSIX ships the helper as an asset; this dev entrypoint runs whatever cargo last built.
const binary = process.env.HEARSAY_NATIVE ?? join(import.meta.dir, 'native/target/release', NATIVE_BINARY)
const source = createNativeSource(binary)

const BLOCKS = ' ▁▂▃▄▅▆▇█'
const meter = (bands: number[]) =>
	bands.map((band) => BLOCKS[Math.round(Math.min(1, Math.max(0, band)) * (BLOCKS.length - 1))]).join('')

const { values, positionals } = parseArgs({
	args: Bun.argv.slice(2),
	allowPositionals: true,
	options: {
		json: { type: 'boolean', default: false },
		device: { type: 'string' },
		seconds: { type: 'string' },
		out: { type: 'string' },
		vad: { type: 'string' },
		model: { type: 'string' },
		'model-path': { type: 'string' },
		language: { type: 'string' },
		prompt: { type: 'string' },
		'partial-ms': { type: 'string' },
		'silence-ms': { type: 'string' },
		'max-seconds': { type: 'string' },
		dictionary: { type: 'string' },
		chime: { type: 'boolean' },
	},
})

const fail = (reason: string): never => {
	console.error(reason)
	process.exit(1)
}

const dictionary: Dictionary | undefined = values.dictionary === undefined ? undefined : JSON.parse(values.dictionary)

const devices = async () => {
	const found = await source.devices()
	if (values.json) return console.log(JSON.stringify(found, null, 2))
	for (const { name, isDefault } of found) console.log(`${isDefault ? '*' : ' '} ${name}`)
}

const listen = async () => {
	const vad = VAD_POLICIES.find((policy) => policy === values.vad)
	if (values.vad && !vad) fail(`--vad must be one of: ${VAD_POLICIES.join(', ')}`)
	const options: ListenOptions = {
		device: values.device,
		seconds: values.seconds === undefined ? undefined : Number(values.seconds),
		out: values.out,
		vad,
	}

	const session = source.listen(options)
	// Nothing else can end an open-ended take from a terminal, and ^C would kill the helper mid-write.
	if (options.seconds === undefined)
		process.stdin.once('data', (typed) => (String(typed).trim() === 'c' ? session.cancel() : session.stop()))

	for await (const event of session.events) {
		if (event.event === 'level') {
			if (!values.json) process.stderr.write(`\r${meter(event.bands)}`)
		} else if (event.event === 'ready')
			console.error(options.seconds === undefined ? 'recording — enter to stop, c to cancel' : 'recording')
		else if (values.json) console.log(JSON.stringify(event, null, 2))
		else if (event.event === 'cancelled') console.error('\ncancelled')
		else console.error(`\n${event.seconds.toFixed(2)}s → ${event.wav}`)
	}

	// The `once` above resumed stdin and nothing pauses it again, so bun would never exit.
	process.stdin.pause()
}

const models = async () => {
	const found = await listModels(modelsDir)
	if (values.json) return console.log(JSON.stringify(found, null, 2))
	for (const { id, label, bytes, english, path, note } of found)
		console.log(
			`${path ? '●' : '○'} ${id.padEnd(2)}  ${label.padEnd(11)} ${megabytes(bytes).padStart(8)}  ${english ? 'en' : '  '}  ${note}`,
		)
	console.log(`\n● cached in ${modelsDir} — default is ${DEFAULT_MODEL_ID}`)
}

const modelId = () => {
	const id = MODEL_IDS.find((known) => known === values.model)
	if (values.model && !id) fail(`--model must be one of: ${MODEL_IDS.join(', ')}`)
	return id
}

let percent = -1

const progress = ({ received, total }: DownloadProgress) => {
	const done = Math.floor((received / total) * 100)
	if (done === percent) return
	percent = done
	const line = `downloading ${megabytes(total)} — ${done}%`
	// A pipe or a log file has no cursor to rewind, so it gets one line per ten percent instead.
	if (process.stderr.isTTY) process.stderr.write(`\r${line}`)
	else if (done % 10 === 0) console.error(line)
}

/** Whisper's own words, shown only when the dictionary changed them. */
const corrected = ({ text, raw }: { text: string; raw: string }) => (raw === text ? '' : `  ← ${raw}`)

const transcribe = async () => {
	const wav = positionals[1] ?? fail('transcribe needs a wav path')
	const model = await resolveModel({
		id: modelId(),
		dir: modelsDir,
		localPath: values['model-path'],
		onProgress: progress,
	})
	if (percent >= 0 && process.stderr.isTTY) console.error('')

	const result = await createWhisperBackend(binary, model).transcribe(wav, {
		language: values.language,
		prompt: values.prompt,
		dictionary,
	})
	if (values.json) return console.log(JSON.stringify(result, null, 2))
	console.error(`${result.seconds.toFixed(2)}s of audio in ${result.ms}ms (${result.loadMs}ms to load ${model})`)
	console.log(`${result.text}${corrected(result)}`)
}

const number = (value: string | undefined) => (value === undefined ? undefined : Number(value))

const dictation = async () => {
	const model = await resolveModel({
		id: modelId(),
		dir: modelsDir,
		localPath: values['model-path'],
		onProgress: progress,
	})
	if (percent >= 0 && process.stderr.isTTY) console.error('')

	const seconds = number(values.seconds)
	const session = startDictation(binary, model, {
		device: values.device,
		seconds,
		out: values.out,
		language: values.language,
		partialMs: number(values['partial-ms']),
		silenceMs: number(values['silence-ms']),
		maxSeconds: number(values['max-seconds']),
		dictionary,
		chime: values.chime,
	})
	// Nothing else can end an open-ended take from a terminal, and ^C would kill the helper mid-write.
	if (seconds === undefined)
		process.stdin.once('data', (typed) => (String(typed).trim() === 'c' ? session.cancel() : session.stop()))

	for await (const event of session.events) {
		if (values.json) {
			if (event.event !== 'level') console.log(JSON.stringify(event))
		} else if (event.event === 'level') process.stderr.write(`\r${meter(event.bands)}`)
		else if (event.event === 'loaded') console.error(`model loaded in ${event.loadMs}ms`)
		else if (event.event === 'ready')
			console.error(seconds === undefined ? 'dictating — enter to stop, c to cancel' : 'dictating')
		// The preview is overwritten in place, exactly as the editor's ghost text will be.
		else if (event.event === 'partial') process.stderr.write(`\r\x1b[2K… ${event.text}`)
		else if (event.event === 'utterance') console.log(`\r\x1b[2K${event.text}${corrected(event)}`)
		else if (event.event === 'cancelled') console.error('\ncancelled')
		else console.error(`\n${event.seconds.toFixed(2)}s → ${event.wav}`)
	}

	// The `once` above resumed stdin and nothing pauses it again, so bun would never exit.
	process.stdin.pause()
}

/** Prints what the import would produce; writing it is the extension's job, since only it knows where settings live. */
const superwhisper = async () => {
	const path = positionals[1] ?? SUPERWHISPER_SETTINGS
	const result = await importSuperwhisper(binary, dictionary ?? {}, path)
	if (values.json) return console.log(JSON.stringify(result, null, 2))
	console.error(
		`${result.words} new word(s), ${result.replacements} replacement(s), ${result.covered} left behind as covered by the vocabulary`,
	)
	console.log(JSON.stringify(result.dictionary, null, 2))
}

const verb = positionals[0]

try {
	if (verb === 'devices') await devices()
	else if (verb === 'dictate') await dictation()
	else if (verb === 'import-superwhisper') await superwhisper()
	else if (verb === 'listen') await listen()
	else if (verb === 'models') await models()
	else if (verb === 'transcribe') await transcribe()
	else fail(USAGE)
} catch (error) {
	// A download that ran out of mirrors is a normal outcome here, and its message is the whole point.
	fail(error instanceof Error ? error.message : String(error))
}
