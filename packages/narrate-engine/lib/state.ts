import { mkdirSync } from 'node:fs'
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

export const writeState = (state: PlaybackState) =>
	Bun.write(paths.state, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }))

export const readState = async () => {
	const file = Bun.file(paths.state)
	if (!(await file.exists())) return null
	return (await file.json()) as PlaybackState
}

export const requestStop = () => Bun.write(paths.stop, '')
export const requestPause = () => Bun.write(paths.pause, '')
export const requestResume = () => Bun.write(paths.resume, '')
export const requestSeek = (target: SeekTarget) => Bun.write(paths.seek, JSON.stringify(target))
export const requestRate = (speed: number) => Bun.write(paths.rate, String(speed))
