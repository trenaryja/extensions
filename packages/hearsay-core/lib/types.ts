export const VAD_POLICIES = ['off', 'offline', 'streaming'] as const
export type VadPolicy = (typeof VAD_POLICIES)[number]

export type InputDevice = { index: string; name: string; isDefault: boolean }

/** Emitted one JSON object per line by the helper; `done` or `cancelled` is always last. */
export type ListenEvent =
	| { event: 'ready' }
	| { event: 'level'; bands: number[] }
	| { event: 'done'; wav: string; samples: number; seconds: number }
	| { event: 'cancelled' }

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
export type Dictionary = { vocabulary?: readonly string[]; replacements?: Readonly<Record<string, string>> }

/**
 * Recording and transcription in one resident process. `partial` is a re-decode of the utterance still
 * being spoken and is replaced wholesale by the next one; `utterance` is final and never revised.
 */
export type DictateEvent =
	| { event: 'loaded'; loadMs: number }
	| { event: 'ready' }
	| { event: 'level'; bands: number[] }
	| { event: 'partial'; text: string }
	| { event: 'utterance'; text: string; raw: string; seconds: number }
	| { event: 'done'; wav: string; text: string; samples: number; seconds: number }
	| { event: 'cancelled' }

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

export type Segment = { start: number; end: number; text: string }

export type Transcription = {
	text: string
	/** Whisper's own words, before the dictionary corrected them into `text`. */
	raw: string
	segments: readonly Segment[]
	/** Audio duration, next to what decoding it cost — together they give the real-time factor. */
	seconds: number
	ms: number
	/** Model load, which a warm backend pays once and a cold one pays per call. */
	loadMs?: number
}

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
