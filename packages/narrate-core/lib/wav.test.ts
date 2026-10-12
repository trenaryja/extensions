import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { concatWav, readWav, silentWav, sliceWav, wavDuration, wavSeconds, writeWav } from './wav'

const DIR = mkdtempSync(join(tmpdir(), 'narrate-wav-'))
const FORMAT = { sampleRate: 8000, channels: 1, bitsPerSample: 16 }

// A ramp rather than silence: a slice that started at the wrong sample would still look right against zeros.
const ramp = (seconds: number, from: number) => {
	const frames = Math.round(seconds * FORMAT.sampleRate)
	const data = new Uint8Array(frames * 2)
	const view = new DataView(data.buffer)
	for (let frame = 0; frame < frames; frame++) view.setInt16(frame * 2, (from + frame) % 30_000, true)
	return { format: FORMAT, data }
}

const roundTrip = async (wav: Parameters<typeof writeWav>[1], name: string) => {
	const path = join(DIR, name)
	await writeWav(path, wav)
	return { path, read: await readWav(path) }
}

test('a written wav reads back byte for byte', async () => {
	const wav = ramp(0.5, 7)
	const { path, read } = await roundTrip(wav, 'round-trip.wav')

	expect(read.format).toEqual(FORMAT)
	expect(read.data).toEqual(wav.data)
	expect(wavSeconds(read)).toBeCloseTo(0.5, 6)
	expect(await wavDuration(path)).toBeCloseTo(0.5, 6)
})

test('concatenating appends the payloads and adds the durations', async () => {
	const pieces = [ramp(0.25, 0), ramp(0.5, 1000), ramp(0.125, 2000)]
	const { read } = await roundTrip(concatWav(pieces), 'concat.wav')

	expect(wavSeconds(read)).toBeCloseTo(0.875, 6)
	expect(read.data).toEqual(new Uint8Array([...pieces[0]!.data, ...pieces[1]!.data, ...pieces[2]!.data]))
})

test('slicing keeps everything from the requested second onward', async () => {
	const wav = ramp(1, 0)
	const { read } = await roundTrip(sliceWav(wav, 0.4), 'slice.wav')

	expect(wavSeconds(read)).toBeCloseTo(0.6, 6)
	expect(read.data).toEqual(wav.data.subarray(0.4 * FORMAT.sampleRate * 2))
})

test('slicing a concatenation lands on the piece boundary', () => {
	const pieces = [ramp(0.25, 0), ramp(0.5, 1000)]
	const sliced = sliceWav(concatWav(pieces), 0.25)

	expect(sliced.data).toEqual(pieces[1]!.data)
})

test('slicing past the end yields no audio rather than a negative length', () => {
	expect(wavSeconds(sliceWav(ramp(0.25, 0), 10))).toBe(0)
})

test('silence is the requested number of zeroed seconds', () => {
	const gap = silentWav(FORMAT, 0.3)

	expect(wavSeconds(gap)).toBeCloseTo(0.3, 6)
	expect(gap.data.every((byte) => byte === 0)).toBe(true)
})

test('refuses to concatenate two sample rates', () => {
	expect(() => concatWav([ramp(0.1, 0), silentWav({ ...FORMAT, sampleRate: 24_000 }, 0.1)])).toThrow('24000 Hz')
})

afterAll(() => rmSync(DIR, { recursive: true, force: true }))
