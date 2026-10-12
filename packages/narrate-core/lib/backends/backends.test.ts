import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { BACKEND_IDS } from '../types'
import { annotateVoices, parseVoices } from './say'
import type { VoiceMetadata } from './say'
import { getBackend } from '.'

// The kokoro worker downloads and loads an 82M-parameter model, so its synthesis only runs on request.
const live = process.env.NARRATE_LIVE === '1'
const noSay = !Bun.which('say')

const neverAborts = () => new AbortController().signal

const discard = (wavPath: string) =>
	Promise.all([rm(wavPath, { force: true }), rm(wavPath.replace(/\.wav$/, '.json'), { force: true })])

describe.each([...BACKEND_IDS])('%s backend', (backendId) => {
	const backend = getBackend(backendId)
	// Only `say` shells out to list voices; kokoro's list is static.
	const missing = backendId === 'say' && noSay

	test.skipIf(missing)('lists at least one voice', async () => {
		const voices = await backend.voices()
		expect(voices.length).toBeGreaterThan(0)
		expect(voices[0]).toMatchObject({ id: expect.any(String), language: expect.any(String) })
	})

	test.skipIf(missing)('exposes an installed default voice', async () => {
		const voices = await backend.voices()
		expect(voices.some((voice) => voice.id === backend.defaultVoiceId)).toBe(true)
	})
})

test.skipIf(noSay)(
	'say synthesizes a timed file and reuses it on a second call',
	async () => {
		const backend = getBackend('say')
		const text = 'Narrate backend test for say.'
		const synthesis = await backend.synthesize(text, backend.defaultVoiceId, neverAborts())

		try {
			expect(Bun.file(synthesis.wavPath).size).toBeGreaterThan(0)
			expect(synthesis.duration).toBeGreaterThan(0.5)
			expect(synthesis.words).toEqual([])
			expect(await backend.synthesize(text, backend.defaultVoiceId, neverAborts())).toEqual(synthesis)
		} finally {
			await discard(synthesis.wavPath)
		}
	},
	120_000,
)

test.skipIf(!live)(
	'kokoro speaks numbers and returns word timestamps',
	async () => {
		const backend = getBackend('kokoro')
		const text = 'There are 3 items and 42 lines.'
		const { wavPath, duration, words } = await backend.synthesize(text, backend.defaultVoiceId, neverAborts())

		try {
			expect(Bun.file(wavPath).size).toBeGreaterThan(0)
			expect(duration).toBeGreaterThan(1)
			expect(words.some((word) => /^(?:3|three)$/i.test(word.text))).toBe(true)
			expect(words.at(-1)?.end).toBeLessThanOrEqual(duration)
		} finally {
			await discard(wavPath)
		}
	},
	300_000,
)

test.skipIf(!live)(
	'kokoro reports an unknown voice as an error',
	async () => {
		const backend = getBackend('kokoro')
		await expect(backend.synthesize('hello', 'af_nope', neverAborts())).rejects.toThrow(/kokoro worker/)
	},
	300_000,
)

const annotationFixture = [
	{
		identifier: 'com.apple.voice.compact.en-US.Samantha',
		name: 'Samantha',
		language: 'en-US',
		gender: 'female',
		quality: 'default',
		novelty: false,
	},
	{ identifier: 'com.apple.eloquence.en-US.Eddy', name: 'Eddy', language: 'en-US', novelty: false },
	{ identifier: 'com.apple.speech.synthesis.voice.Zarvox', name: 'Zarvox', language: 'en-US', novelty: true },
] satisfies VoiceMetadata[]

test('parses say locales as hyphenated BCP-47', () => {
	expect(parseVoices('Samantha            en_US    # Hello!\nSinji               zh_HK    # 你好!')).toEqual([
		{ id: 'Samantha', name: 'Samantha', language: 'en-US' },
		{ id: 'Sinji', name: 'Sinji', language: 'zh-HK' },
	])
})

test('annotates say voices by name and locale, leaving unmatched ones bare', () => {
	const listing = parseVoices(
		[
			'Samantha            en_US    # Hello!',
			'Eddy (English (US)) en_US    # Hello!',
			'Zarvox              en_US    # Hello!',
			'Aru                 kk_KZ    # Salem!',
		].join('\n'),
	)

	expect(annotateVoices(listing, annotationFixture)).toEqual([
		{
			id: 'Samantha',
			name: 'Samantha',
			language: 'en-US',
			gender: 'female',
			quality: 'default',
			novelty: false,
			family: 'compact',
		},
		{
			id: 'Eddy (English (US))',
			name: 'Eddy (English (US))',
			language: 'en-US',
			gender: undefined,
			quality: undefined,
			novelty: false,
			family: 'eloquence',
		},
		{
			id: 'Zarvox',
			name: 'Zarvox',
			language: 'en-US',
			gender: undefined,
			quality: undefined,
			novelty: true,
			family: 'legacy',
		},
		{ id: 'Aru', name: 'Aru', language: 'kk-KZ' },
	])
})

const voicesWithHelper = async (helperPath: string) => {
	const original = process.env.NARRATE_VOICE_METADATA
	process.env.NARRATE_VOICE_METADATA = helperPath

	try {
		return await getBackend('say').voices()
	} finally {
		if (original === undefined) delete process.env.NARRATE_VOICE_METADATA
		// eslint-disable-next-line require-atomic-updates -- restoring a value captured before the await is the point; nothing else writes this var
		else process.env.NARRATE_VOICE_METADATA = original
	}
}

// The say backend has to keep working on a machine where nothing but macOS is installed.
test.skipIf(noSay).each([
	['missing', join(tmpdir(), 'narrate-helper-that-is-not-there')],
	['unparseable', '/bin/echo'],
])('lists voices unannotated when the metadata helper is %s', async (_label, helperPath) => {
	const voices = await voicesWithHelper(helperPath)
	expect(voices.length).toBeGreaterThan(0)
	expect(voices.some((voice) => voice.family !== undefined || voice.novelty !== undefined)).toBe(false)
})

test('kokoro voices carry a hyphenated locale and the gender in their id', async () => {
	const voices = await getBackend('kokoro').voices()
	expect(voices.every((voice) => /^[a-z]{2}-[A-Z]{2}$/.test(voice.language))).toBe(true)
	expect(voices.find((voice) => voice.id === 'af_heart')).toMatchObject({ language: 'en-US', gender: 'female' })
	expect(voices.find((voice) => voice.id === 'bm_george')).toMatchObject({ language: 'en-GB', gender: 'male' })
})
