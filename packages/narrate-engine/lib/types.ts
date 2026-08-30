export const ORIGINS = ['transcript', 'stdin', 'file', 'clipboard', 'selection'] as const
export type Origin = (typeof ORIGINS)[number]

export type SourceText = { text: string; label: string; origin: Origin }

export type Source = { origin: Origin; resolve: () => Promise<SourceText> }

export type TranscriptMessage = {
	id: string
	sessionId: string
	cwd: string
	timestamp: string
	preview: string
}

// `line` is the paragraph the sentence came from, counting only paragraphs that hold a sentence:
// the runner renders one contiguous wav per paragraph.
export type Chunk = { index: number; text: string; line: number }

export const BACKEND_IDS = ['kokoro', 'say'] as const
export type BackendId = (typeof BACKEND_IDS)[number]

export const VOICE_GENDERS = ['male', 'female'] as const
export type VoiceGender = (typeof VOICE_GENDERS)[number]

export const VOICE_QUALITIES = ['default', 'enhanced', 'premium'] as const
export type VoiceQuality = (typeof VOICE_QUALITIES)[number]

export type Voice = {
	id: string
	name: string
	// BCP-47 with a hyphen, not the underscore `say -v '?'` prints: Intl.DisplayNames throws on `en_US`.
	language: string
	gender?: VoiceGender
	quality?: VoiceQuality
	novelty?: boolean
	family?: string
}

export type Word = { text: string; start: number; end: number }

export type Synthesis = { wavPath: string; duration: number; words: Word[] }

export type SpeechBackend = {
	id: BackendId
	defaultVoiceId: string
	voices: () => Promise<Voice[]>
	synthesize: (text: string, voiceId: string, signal: AbortSignal) => Promise<Synthesis>
}

// What `narrate worker status` reports; seconds throughout, and `pipelines` holds kokoro language codes.
export type WorkerStatus = {
	pid: number
	uptime: number
	idle: number
	idleTimeout: number
	inFlight: number
	pipelines: string[]
}

export const SUMMARIZER_IDS = ['claude', 'opencode'] as const
export type SummarizerId = (typeof SUMMARIZER_IDS)[number]

export type Summarizer = {
	id: SummarizerId
	available: () => Promise<boolean>
	summarize: (text: string, signal: AbortSignal) => Promise<string>
}

// A runner in one of these is still running and still owns the state dir; the rest are its resting places.
export const LIVE_PHASES = ['synthesizing', 'playing', 'paused'] as const
export const PHASES = [...LIVE_PHASES, 'stopped', 'done', 'error'] as const
export type Phase = (typeof PHASES)[number]

const LIVE: readonly Phase[] = LIVE_PHASES
export const isLivePhase = (phase: Phase) => LIVE.includes(phase)

// Times are seconds from the start of the narration; `-1` until that sentence has been rendered.
export type Sentence = { text: string; start: number; end: number }

export type PlaybackState = {
	phase: Phase
	pid: number
	label: string
	origin: Origin
	backend: BackendId
	voiceId: string
	speed: number
	sentences: Sentence[]
	words: Word[]
	duration: number
	position: number
	sentenceIndex: number
	skipped: number[]
	error?: string
	updatedAt: string
}

// One finished narration, whatever phase it came to rest in. `text` is already speech-normalized, so a
// replay has to skip normalization to hear the same thing twice.
export type HistoryEntry = {
	finishedAt: string
	phase: Phase
	label: string
	origin: Origin
	backend: BackendId
	voiceId: string
	speed: number
	text: string
}

export type SeekTarget = { sentence: number } | { seconds: number }
