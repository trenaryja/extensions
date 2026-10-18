import { z } from 'zod'

export const ORIGINS = ['transcript', 'stdin', 'file', 'clipboard', 'selection'] as const
export type Origin = (typeof ORIGINS)[number]

export type SourceText = { text: string; label: string; origin: Origin }

export type Source = { origin: Origin; resolve: () => Promise<SourceText> }

export const TranscriptMessage = z.object({
	id: z.string(),
	sessionId: z.string(),
	cwd: z.string(),
	timestamp: z.string(),
	preview: z.string(),
})
export type TranscriptMessage = z.infer<typeof TranscriptMessage>

// `line` is the paragraph the sentence came from, counting only paragraphs that hold a sentence:
// the runner renders one contiguous wav per paragraph.
export type Chunk = { index: number; text: string; line: number }

export const BACKEND_IDS = ['kokoro', 'say'] as const
export type BackendId = (typeof BACKEND_IDS)[number]

export const VOICE_GENDERS = ['male', 'female'] as const
export type VoiceGender = (typeof VOICE_GENDERS)[number]

export const VOICE_QUALITIES = ['default', 'enhanced', 'premium'] as const
export type VoiceQuality = (typeof VOICE_QUALITIES)[number]

export const Voice = z.object({
	id: z.string(),
	name: z.string(),
	// BCP-47 with a hyphen, not the underscore `say -v '?'` prints: Intl.DisplayNames throws on `en_US`.
	language: z.string(),
	gender: z.enum(VOICE_GENDERS).optional(),
	quality: z.enum(VOICE_QUALITIES).optional(),
	novelty: z.boolean().optional(),
	family: z.string().optional(),
})
export type Voice = z.infer<typeof Voice>

export const Word = z.object({ text: z.string(), start: z.number(), end: z.number() })
export type Word = z.infer<typeof Word>

export const Synthesis = z.object({ wavPath: z.string(), duration: z.number(), words: z.array(Word) })
export type Synthesis = z.infer<typeof Synthesis>

export type SpeechBackend = {
	id: BackendId
	defaultVoiceId: string
	voices: () => Promise<Voice[]>
	synthesize: (text: string, voiceId: string, signal: AbortSignal) => Promise<Synthesis>
}

// What `narrate worker status` reports; seconds throughout, and `pipelines` holds kokoro language codes.
export const WorkerStatus = z.object({
	pid: z.number(),
	uptime: z.number(),
	idle: z.number(),
	idleTimeout: z.number(),
	inFlight: z.number(),
	pipelines: z.array(z.string()),
})
export type WorkerStatus = z.infer<typeof WorkerStatus>

export const SUMMARIZER_IDS = ['claude', 'opencode'] as const
export type SummarizerId = (typeof SUMMARIZER_IDS)[number]

export type Summarizer = {
	id: SummarizerId
	available: () => boolean
	summarize: (text: string, signal: AbortSignal) => Promise<string>
}

// A runner in one of these is still running and still owns the state dir; the rest are its resting places.
export const LIVE_PHASES = ['synthesizing', 'playing', 'paused'] as const
export const PHASES = [...LIVE_PHASES, 'stopped', 'done', 'error'] as const
export type Phase = (typeof PHASES)[number]

const LIVE: readonly Phase[] = LIVE_PHASES
export const isLivePhase = (phase: Phase) => LIVE.includes(phase)

// Times are seconds from the start of the narration; `-1` until that sentence has been rendered.
export const Sentence = z.object({ text: z.string(), start: z.number(), end: z.number() })
export type Sentence = z.infer<typeof Sentence>

export const PlaybackState = z.object({
	phase: z.enum(PHASES),
	pid: z.number(),
	label: z.string(),
	origin: z.enum(ORIGINS),
	backend: z.enum(BACKEND_IDS),
	voiceId: z.string(),
	speed: z.number(),
	sentences: z.array(Sentence),
	words: z.array(Word),
	duration: z.number(),
	position: z.number(),
	sentenceIndex: z.number(),
	skipped: z.array(z.number()),
	error: z.string().optional(),
	updatedAt: z.string(),
})
export type PlaybackState = z.infer<typeof PlaybackState>

// One finished narration, whatever phase it came to rest in. `text` is already speech-normalized, so a
// replay has to skip normalization to hear the same thing twice.
export const HistoryEntry = z.object({
	finishedAt: z.string(),
	phase: z.enum(PHASES),
	label: z.string(),
	origin: z.enum(ORIGINS),
	backend: z.enum(BACKEND_IDS),
	voiceId: z.string(),
	speed: z.number(),
	text: z.string(),
})
export type HistoryEntry = z.infer<typeof HistoryEntry>

export const SeekTarget = z.union([z.object({ sentence: z.int() }), z.object({ seconds: z.number() })])
export type SeekTarget = z.infer<typeof SeekTarget>
