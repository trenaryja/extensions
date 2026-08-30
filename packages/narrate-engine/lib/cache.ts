import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import * as R from 'remeda'
import { paths } from './state'

const MB = 1024 * 1024
const DEFAULT_LIMIT_MB = 200

// 24 kHz mono 16-bit is ~2.9 MB per minute of speech, and nothing else trims the cache, so an unbounded
// audio/ grows about 170 MB per hour of listening.
export const cacheLimitBytes = () => {
	const configured = Number(process.env.NARRATE_CACHE_MB)
	return (Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_LIMIT_MB) * MB
}

// A wav and the sidecar holding its word timestamps are only useful together.
const entryOf = async (name: string) => {
	const wavPath = join(paths.audio, name)
	const sidecarPath = wavPath.replace(/\.[^.]+$/, '.json')
	const { mtimeMs, size } = await stat(wavPath)
	const sidecar = await stat(sidecarPath).catch(() => null)
	return { paths: sidecar ? [wavPath, sidecarPath] : [wavPath], mtimeMs, size: size + (sidecar?.size ?? 0) }
}

// Newest wins: a cache hit only happens on the exact same text, so recency is the whole signal.
export const pruneAudioCache = async (limit = cacheLimitBytes()) => {
	if (limit === 0) return { removed: 0, bytes: 0 }

	const names = await readdir(paths.audio).catch((): string[] => [])
	const pending = R.pipe(
		names,
		R.filter((name) => name.endsWith('.wav')),
		R.map(entryOf),
	)
	const entries = R.sortBy(await Promise.all(pending), [(entry) => entry.mtimeMs, 'desc'])

	let kept = 0
	const doomed = R.filter(entries, (entry) => (kept += entry.size) > limit)
	await Promise.all(R.flatMap(doomed, (entry) => entry.paths).map((path) => rm(path, { force: true })))

	return { removed: doomed.length, bytes: R.sumBy(doomed, (entry) => entry.size) }
}
