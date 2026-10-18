import { spawn } from 'node:child_process'
import { chmodSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { environment, LocalStorage } from '@raycast/api'
import * as R from 'remeda'
import { z } from 'zod'

const Running = z.object({
	running: z.literal(true),
	pid: z.number(),
	input: z.string(),
	output: z.string(),
	sampleRate: z.number(),
	blocksize: z.number(),
	volume: z.number(),
	/** Null while audio flows; otherwise paused, listing whichever pinned devices are unplugged. */
	waitingFor: z.array(z.string()).nullable(),
	switchInput: z.string().nullable(),
	switchOutput: z.string().nullable(),
	inputPeakDb: z.number().nullable(),
	starved: z.number(),
	discarded: z.number(),
	bufferedMs: z.number().nullable(),
})
export type Running = z.infer<typeof Running>

const Status = z.discriminatedUnion('running', [Running, z.object({ running: z.literal(false) })])
export type Status = z.infer<typeof Status>

const Devices = z.object({
	inputs: z.array(z.string()),
	outputs: z.array(z.string()),
	defaultInput: z.string().nullable(),
	defaultOutput: z.string().nullable(),
})
export type Devices = z.infer<typeof Devices>

// Unset keys fall through to the engine's own defaults.
export type Settings = { input?: string; output?: string; blocksize?: number; volume?: number }

let binary: string | undefined

// @repo/hear-yourself-core compiles the binary into assets/, which Raycast copies into the built extension.
const resolveBinary = () => {
	if (binary) return binary
	binary = join(environment.assetsPath, 'hear-yourself-core')
	// Raycast copies assets without the exec bit.
	if (!(statSync(binary).mode & 0o111)) chmodSync(binary, 0o755)
	return binary
}

const parseReply = <Reply>(reply: z.ZodType<Reply>, args: readonly string[], stdout: string) => {
	const parsed = reply.safeParse(JSON.parse(stdout))
	if (!parsed.success) throw new Error(`hear-yourself-core ${args[0] ?? ''}: ${z.prettifyError(parsed.error)}`)
	return parsed.data
}

const run = <Reply>(reply: z.ZodType<Reply>, args: readonly string[]) =>
	new Promise<Reply>((resolve, reject) => {
		const child = spawn(resolveBinary(), args, { stdio: ['ignore', 'pipe', 'pipe'] })
		let stdout = ''
		let stderr = ''
		child.stdout.on('data', (data: Buffer) => (stdout += data.toString()))
		child.stderr.on('data', (data: Buffer) => (stderr += data.toString()))
		child.on('error', reject)
		child.on('close', (code) => {
			if (code !== 0) return reject(new Error(stderr.trim() || `hear-yourself-core exited with ${code}`))
			try {
				resolve(parseReply(reply, args, stdout))
			} catch (error) {
				reject(error)
			}
		})
	})

export const settings = () => LocalStorage.allItems<Settings>()

// The engine opens this on launch and on every pause, resume or switch offer; it is what refreshes the menu bar icon.
const notifyUrl = () =>
	`raycast://extensions/${environment.ownerOrAuthorName}/${environment.extensionName}/menu-bar?launchType=background`

const flags = async () => [
	...R.entries(await settings()).flatMap(([key, value]) => [`--${key}`, String(value)]),
	'--notify-url',
	notifyUrl(),
]

export const status = () => run(Status, ['status'])

export const devices = () => run(Devices, ['devices'])

export const start = async () => run(Running, ['start', ...(await flags())])

export const stop = () => run(z.object({ stopped: z.boolean() }), ['stop'])

export const toggle = async () => run(Status, ['toggle', ...(await flags())])

export const restart = async () => {
	await stop()
	return start()
}

// The engine reads its options once at launch, so a change only lands by restarting it.
export const choose = async <K extends keyof Settings>(key: K, value?: Settings[K]) => {
	await (value === undefined ? LocalStorage.removeItem(key) : LocalStorage.setItem(key, value))
	if ((await status()).running) await restart()
}

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))
