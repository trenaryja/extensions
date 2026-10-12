import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import * as R from 'remeda'
import { paths } from '../state'
import type { Source, SourceText, TranscriptMessage } from '../types'

const DEFAULT_ROOT = join(homedir(), '.claude', 'projects')
const DEFAULT_LIMIT = 50
const DEFAULT_MIN_CHARS = 200
const PREVIEW_LENGTH = 120

export type TranscriptOptions = { root?: string }

export type ListMessagesOptions = TranscriptOptions & {
	project?: string
	limit?: number
	minChars?: number
}

type TranscriptLine = {
	type?: string
	uuid?: string
	sessionId?: string
	cwd?: string
	timestamp?: string
	isSidechain?: boolean
	message?: { content?: { type?: string; text?: string }[] }
}

type Entry = { message: TranscriptMessage; text: string }

const parseLine = (raw: string): TranscriptLine | null => {
	try {
		return JSON.parse(raw)
	} catch {
		return null
	}
}

const toPreview = (text: string) => text.replace(/\s+/gu, ' ').trim().slice(0, PREVIEW_LENGTH)

const toEntry = (raw: string): Entry | null => {
	const line = parseLine(raw)
	if (!line || line.type !== 'assistant' || line.isSidechain !== false) return null
	const { uuid, sessionId, cwd, timestamp } = line
	if (!uuid || !sessionId) return null
	const text = R.pipe(
		line.message?.content ?? [],
		R.filter((block) => block.type === 'text'),
		R.map((block) => block.text ?? ''),
		R.join('\n\n'),
	).trim()
	if (!text) return null
	const message = {
		id: `${sessionId}:${uuid}`,
		sessionId,
		cwd: cwd ?? '',
		timestamp: timestamp ?? '',
		preview: toPreview(text),
	}
	return { message, text }
}

// Newest messages are at the end of the file, so scanning backwards lets a caller
// with a small limit stop after parsing a handful of lines instead of thousands.
async function* entriesNewestFirst(filePath: string) {
	const lines = (await Bun.file(filePath).text()).split('\n')

	for (let i = lines.length - 1; i >= 0; i--) {
		const raw = lines[i]
		if (!raw?.includes('"assistant"')) continue
		const entry = toEntry(raw)
		if (entry) yield entry
	}
}

const transcriptFiles = async (root: string) => {
	const filePaths = await Array.fromAsync(
		new Bun.Glob('*/*.jsonl').scan({ cwd: root, absolute: true, onlyFiles: true }),
	).catch(() => [])
	const timed = await Promise.all(
		R.map(filePaths, async (filePath) => ({ filePath, mtimeMs: (await stat(filePath)).mtimeMs })),
	)
	return R.pipe(timed, R.sortBy([R.prop('mtimeMs'), 'desc']), R.map(R.prop('filePath')))
}

const matchesProject = (cwd: string, project?: string) => !project || cwd === project || cwd.startsWith(`${project}/`)

export const listMessages = async ({
	root = DEFAULT_ROOT,
	project,
	limit = DEFAULT_LIMIT,
	minChars = DEFAULT_MIN_CHARS,
}: ListMessagesOptions = {}) => {
	const found: TranscriptMessage[] = []

	for (const filePath of await transcriptFiles(root)) {
		for await (const { message, text } of entriesNewestFirst(filePath)) {
			if (text.length < minChars) continue
			if (message.cwd === paths.scratch) continue
			if (!matchesProject(message.cwd, project)) continue
			found.push(message)
			if (found.length >= limit) break
		}

		if (found.length >= limit) break
	}

	return R.sortBy(found, [R.prop('timestamp'), 'desc'])
}

const findEntry = async (id: string, root: string) => {
	const sessionId = id.split(':')[0]
	const files = await transcriptFiles(root)
	const [sessionFiles, otherFiles] = R.partition(files, (filePath) => basename(filePath, '.jsonl') === sessionId)
	for (const filePath of [...sessionFiles, ...otherFiles])
		for await (const entry of entriesNewestFirst(filePath)) if (entry.message.id === id) return entry
	return null
}

export const transcriptSource = (id: string, { root = DEFAULT_ROOT }: TranscriptOptions = {}): Source => ({
	origin: 'transcript',
	resolve: async (): Promise<SourceText> => {
		const entry = await findEntry(id, root)
		if (!entry) throw new Error(`No transcript message with id ${id}`)
		return { text: entry.text, label: entry.message.preview, origin: 'transcript' }
	},
})
