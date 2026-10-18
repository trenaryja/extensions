import { z } from 'zod'

export const VAD_POLICIES = ['off', 'offline', 'streaming'] as const
export type VadPolicy = (typeof VAD_POLICIES)[number]

export const InputDevice = z.object({ index: z.string(), name: z.string(), isDefault: z.boolean() })
export type InputDevice = z.infer<typeof InputDevice>

/** Emitted one JSON object per line by the helper; `done` or `cancelled` is always last. */
export const ListenEvent = z.discriminatedUnion('event', [
	z.object({ event: z.literal('ready') }),
	z.object({ event: z.literal('level'), bands: z.array(z.number()) }),
	z.object({ event: z.literal('done'), wav: z.string(), samples: z.number(), seconds: z.number() }),
	z.object({ event: z.literal('cancelled') }),
])
export type ListenEvent = z.infer<typeof ListenEvent>

export type ListenOptions = {
	device?: string
	/** Stop after this long even if nothing asks it to; omit for a session that runs until `stop`. */
	seconds?: number
	out?: string
	vad?: VadPolicy
}

export type ListenSession = {
	events: AsyncIterable<ListenEvent>
	/** Keep the audio and finish. */
	stop: () => void
	/** Drop the audio and finish. */
	cancel: () => void
}

/**
 * The user's words, applied by the helper to every partial and utterance alike. `vocabulary` steers
 * whisper's prompt and snaps sound-alikes to its spelling; `replacements` swap exact phrases, whole-word
 * and case-insensitive, before that fuzzy pass runs.
 */
export const Dictionary = z.object({
	vocabulary: z.array(z.string()).readonly().optional(),
	replacements: z.record(z.string(), z.string()).readonly().optional(),
})
export type Dictionary = z.infer<typeof Dictionary>

/**
 * Recording and transcription in one resident process. `partial` is a re-decode of the utterance still
 * being spoken and is replaced wholesale by the next one; `utterance` is final and never revised.
 */
export const DictateEvent = z.discriminatedUnion('event', [
	z.object({ event: z.literal('loaded'), loadMs: z.number() }),
	z.object({ event: z.literal('ready') }),
	z.object({ event: z.literal('level'), bands: z.array(z.number()) }),
	z.object({ event: z.literal('partial'), text: z.string() }),
	z.object({ event: z.literal('utterance'), text: z.string(), raw: z.string(), seconds: z.number() }),
	z.object({ event: z.literal('done'), wav: z.string(), text: z.string(), samples: z.number(), seconds: z.number() }),
	z.object({ event: z.literal('cancelled') }),
])
export type DictateEvent = z.infer<typeof DictateEvent>

export type DictateOptions = {
	device?: string
	seconds?: number
	out?: string
	language?: string
	threads?: number
	/** How often the utterance in flight is re-decoded for the preview. Zero decodes no previews at all. */
	partialMs?: number
	/** Silence beyond the VAD's own tail that ends an utterance and commits it. */
	silenceMs?: number
	/** An utterance running this long commits without waiting for a pause. */
	maxSeconds?: number
	dictionary?: Dictionary
	/** A rising chime before the mic opens and a falling one when it closes. */
	chime?: boolean
}

export type DictateSession = {
	events: AsyncIterable<DictateEvent>
	/** Commit what is still in flight and finish. */
	stop: () => void
	/** Drop it and finish. */
	cancel: () => void
}

export const AUDIO_SOURCE_IDS = ['native'] as const
export type AudioSourceId = (typeof AUDIO_SOURCE_IDS)[number]

/**
 * Where microphone audio comes from. `native` is the only implementation, but a managed machine can
 * block an unsigned helper binary outright — the seam is what a browser-bridge fallback would plug into.
 */
export type AudioSource = {
	id: AudioSourceId
	devices: () => Promise<InputDevice[]>
	listen: (options: ListenOptions) => ListenSession
}

export const Segment = z.object({ start: z.number(), end: z.number(), text: z.string() })
export type Segment = z.infer<typeof Segment>

export const Transcription = z.object({
	text: z.string(),
	/** Whisper's own words, before the dictionary corrected them into `text`. */
	raw: z.string(),
	segments: z.array(Segment).readonly(),
	/** Audio duration, next to what decoding it cost — together they give the real-time factor. */
	seconds: z.number(),
	ms: z.number(),
	/** Model load, which a warm backend pays once and a cold one pays per call. */
	loadMs: z.number().optional(),
})
export type Transcription = z.infer<typeof Transcription>

export type TranscribeOptions = {
	language?: string
	/** Text the speech continues from. The dictionary's vocabulary is prepended to it by the helper. */
	prompt?: string
	threads?: number
	dictionary?: Dictionary
}

export const BACKEND_IDS = ['whisper'] as const
export type BackendId = (typeof BACKEND_IDS)[number]

/** Whisper is bundled and local; the seam exists for an OpenAI-compatible `/v1/audio/transcriptions`. */
export type TranscribeBackend = {
	id: BackendId
	transcribe: (wav: string, options?: TranscribeOptions) => Promise<Transcription>
}
