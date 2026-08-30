import { afterAll, beforeEach, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const STATE_DIR = mkdtempSync(join(tmpdir(), 'narrate-cache-'))
process.env.NARRATE_STATE_DIR = STATE_DIR

// Loaded after the env var so `paths` resolves to the temp dir instead of the real state dir.
const { paths } = await import('./state')
const { cacheLimitBytes, pruneAudioCache } = await import('./cache')

const KB = 1024

afterAll(() => rmSync(STATE_DIR, { recursive: true, force: true }))

beforeEach(() => {
	rmSync(paths.audio, { recursive: true, force: true })
	mkdirSync(paths.audio, { recursive: true })
})

const write = (name: string, kilobytes: number, ageSeconds: number) => {
	const wavPath = join(paths.audio, `${name}.wav`)
	const sidecarPath = join(paths.audio, `${name}.json`)
	writeFileSync(wavPath, Buffer.alloc(kilobytes * KB))
	writeFileSync(sidecarPath, '{"duration":1,"words":[]}')
	const when = new Date(Date.now() - ageSeconds * 1000)
	for (const path of [wavPath, sidecarPath]) utimesSync(path, when, when)
	return { wavPath, sidecarPath }
}

test('keeps the newest wavs up to the limit and drops the rest with their sidecars', async () => {
	const newest = write('newest', 10, 1)
	const middle = write('middle', 10, 60)
	const oldest = write('oldest', 10, 120)

	const { removed } = await pruneAudioCache(21 * KB)

	expect(removed).toBe(1)
	expect(existsSync(newest.wavPath)).toBe(true)
	expect(existsSync(middle.wavPath)).toBe(true)
	expect(existsSync(oldest.wavPath)).toBe(false)
	expect(existsSync(oldest.sidecarPath)).toBe(false)
})

test('a zero limit disables pruning', async () => {
	const { wavPath } = write('kept', 10, 1)
	expect(await pruneAudioCache(0)).toEqual({ removed: 0, bytes: 0 })
	expect(existsSync(wavPath)).toBe(true)
})

test('NARRATE_CACHE_MB overrides the default, and junk falls back to it', () => {
	const original = process.env.NARRATE_CACHE_MB
	process.env.NARRATE_CACHE_MB = '50'
	expect(cacheLimitBytes()).toBe(50 * 1024 * KB)
	process.env.NARRATE_CACHE_MB = 'wat'
	expect(cacheLimitBytes()).toBe(200 * 1024 * KB)
	delete process.env.NARRATE_CACHE_MB
	expect(cacheLimitBytes()).toBe(200 * 1024 * KB)
	if (original !== undefined) process.env.NARRATE_CACHE_MB = original
})
