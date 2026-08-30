import { appendFile } from 'node:fs/promises'
import * as R from 'remeda'
import { paths } from './state'
import type { HistoryEntry, PlaybackState } from './types'

const DEFAULT_LIMIT_ENTRIES = 200

export const historyLimitEntries = () => {
	const configured = Number(process.env.NARRATE_HISTORY_ENTRIES)
	return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_LIMIT_ENTRIES
}

// `text` is the runner's own input, not a rejoin of `state.sentences`: paragraph breaks are the segment
// boundaries, and a replay that lost them would synthesize the whole narration before playing a note.
export const appendHistory = async (state: PlaybackState, text: string) => {
	const entry: HistoryEntry = {
		finishedAt: new Date().toISOString(),
		phase: state.phase,
		label: state.label,
		origin: state.origin,
		backend: state.backend,
		voiceId: state.voiceId,
		speed: state.speed,
		text,
	}
	await appendFile(paths.history, `${JSON.stringify(entry)}\n`)
	return entry
}

// A crash mid-append leaves a torn last line; it costs its own entry, not the whole file.
const parseEntry = (line: string): HistoryEntry | null => {
	try {
		return JSON.parse(line)
	} catch {
		return null
	}
}

export const readHistory = async ({ limit }: { limit?: number } = {}) => {
	const file = Bun.file(paths.history)
	if (!(await file.exists())) return []
	const newestFirst = R.pipe((await file.text()).split('\n'), R.map(parseEntry), R.filter(R.isNonNull), R.reverse())
	return limit === undefined ? newestFirst : R.take(newestFirst, limit)
}

export const pruneHistory = async (limit = historyLimitEntries()) => {
	if (limit === 0) return { removed: 0 }

	const entries = await readHistory()
	if (entries.length <= limit) return { removed: 0 }

	const kept = R.pipe(
		R.take(entries, limit),
		R.reverse(),
		R.map((entry) => `${JSON.stringify(entry)}\n`),
		R.join(''),
	)
	await Bun.write(paths.history, kept)

	return { removed: entries.length - limit }
}
