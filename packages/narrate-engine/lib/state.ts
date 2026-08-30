import { mkdirSync } from 'node:fs'
import { readFile, rename } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PlaybackState, SeekTarget } from './types'

const ROOT = process.env.NARRATE_STATE_DIR ?? join(homedir(), '.local', 'state', 'narrate')

export const paths = {
	root: ROOT,
	state: join(ROOT, 'state.json'),
	pid: join(ROOT, 'pid'),
	stop: join(ROOT, 'stop'),
	pause: join(ROOT, 'pause'),
	resume: join(ROOT, 'resume'),
	seek: join(ROOT, 'seek'),
	rate: join(ROOT, 'rate'),
	seekAudio: join(ROOT, 'seek.wav'),
	audio: join(ROOT, 'audio'),
	segments: join(ROOT, 'segments'),
	scratch: join(ROOT, 'scratch'),
	worker: join(ROOT, 'worker'),
	workerSocket: join(ROOT, 'worker.sock'),
	workerLog: join(ROOT, 'worker.log'),
	log: join(ROOT, 'runner.log'),
	history: join(ROOT, 'history.jsonl'),
}

export const ensureStateDirs = () => {
	for (const dir of [paths.root, paths.audio, paths.segments, paths.scratch]) mkdirSync(dir, { recursive: true })
}

// `Bun.write` truncates before it writes, so a `narrate status` poll landing mid-write reads a torn
// file and throws. Renaming into place is atomic; the queue keeps an earlier state from landing last.
let writes: Promise<unknown> = Promise.resolve()

export const writeAtomic = (path: string, contents: string) => {
	const done = writes
		.catch(() => undefined)
		.then(async () => {
			const temp = `${path}.${process.pid}.tmp`
			await Bun.write(temp, contents)
			await rename(temp, path)
		})
	writes = done
	return done
}

export const writeState = (state: PlaybackState) =>
	writeAtomic(paths.state, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }))

// Read to EOF rather than through `Bun.file`, which sizes the read from an earlier stat and so
// returns a truncated string when the file is replaced mid-read. A torn or absent file reads as
// "nothing is playing", which is what a caller does with a null anyway.
export const readState = async () => {
	try {
		return JSON.parse(await readFile(paths.state, 'utf8')) as PlaybackState
	} catch {
		return null
	}
}

export const requestStop = () => Bun.write(paths.stop, '')
export const requestPause = () => Bun.write(paths.pause, '')
export const requestResume = () => Bun.write(paths.resume, '')
export const requestSeek = (target: SeekTarget) => Bun.write(paths.seek, JSON.stringify(target))
export const requestRate = (speed: number) => Bun.write(paths.rate, String(speed))
