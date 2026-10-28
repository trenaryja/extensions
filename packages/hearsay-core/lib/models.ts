import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'

const REPO = 'ggerganov/whisper.cpp'
// Pinned so the catalogued hashes provably describe the bytes any mirror serves.
const REVISION = '5359861c739e955e79d9a303bcbc70fb988958b1'

/** Tried in order. Each must serve `{mirror}/{file}`; the sha256 is what makes an untrusted host safe. */
export const MIRRORS = [
	`https://huggingface.co/${REPO}/resolve/${REVISION}`,
	`https://hf-mirror.com/${REPO}/resolve/${REVISION}`,
]

/**
 * Five rungs, sized like a button: the id a user writes is a class of machine, and which Whisper
 * weights serve it is ours to change. Compiled in, never fetched — the model list has to render on a
 * machine with no network. Sizes and hashes come from the Hugging Face blob API at the pinned revision.
 */
export const CATALOG = [
	{
		id: 'xs',
		label: 'Extra small',
		file: 'ggml-tiny.en.bin',
		bytes: 77_704_715,
		sha256: '921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f',
		english: true,
		note: 'Fastest. Weak on names and punctuation.',
	},
	{
		id: 'sm',
		label: 'Small',
		file: 'ggml-base.en.bin',
		bytes: 147_964_211,
		sha256: 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002',
		english: true,
		note: 'Real time anywhere, even without a GPU.',
	},
	{
		id: 'md',
		label: 'Medium',
		file: 'ggml-small.en-q5_1.bin',
		bytes: 190_098_681,
		sha256: 'bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30',
		english: true,
		note: 'The default. Good with technical words.',
	},
	{
		id: 'lg',
		label: 'Large',
		file: 'ggml-large-v3-turbo-q5_0.bin',
		bytes: 574_041_195,
		sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
		english: false,
		note: 'Near-best accuracy. Needs a fast machine.',
	},
	{
		id: 'xl',
		label: 'Extra large',
		file: 'ggml-large-v3-turbo.bin',
		bytes: 1_624_555_275,
		sha256: '1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69',
		english: false,
		note: 'Most accurate. Slowest and biggest.',
	},
] as const

export type ModelId = (typeof CATALOG)[number]['id']
export type CatalogEntry = (typeof CATALOG)[number]

export const MODEL_IDS = CATALOG.map((entry) => entry.id)

export const DEFAULT_MODEL_ID: ModelId = 'md'

/** Catalog sizes are exact byte counts; every surface that shows one rounds it the same way. */
export const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(0)} MB`

export const findModel = (id: string) => CATALOG.find((entry) => entry.id === id)

const sizeOf = async (path: string) => (await stat(path).catch(() => undefined))?.size

/** Size, not a rehash — rehashing 1.6 GB per dictation is unaffordable, and the bytes were hashed on the way in. */
const cachedPath = async (dir: string, entry: CatalogEntry) => {
	const path = join(dir, entry.file)
	return (await sizeOf(path)) === entry.bytes ? path : undefined
}

/** The catalog, each entry carrying the local path when this machine already has verified bytes. */
export const listModels = (dir: string) =>
	Promise.all(CATALOG.map(async (entry) => ({ ...entry, path: await cachedPath(dir, entry) })))

export type DownloadProgress = { received: number; total: number }

type ResolveOptions = {
	id?: ModelId
	dir?: string
	/** The `hearsay.modelPath` escape hatch: a hand-downloaded ggml `.bin` on a machine that cannot fetch one. */
	localPath?: string
	onProgress?: (progress: DownloadProgress) => void
	signal?: AbortSignal
}

const download = async (entry: CatalogEntry, target: string, options: ResolveOptions) => {
	const partial = `${target}.part`

	const fetchInto = async (url: string) => {
		const response = await fetch(url, { signal: options.signal })
		const { body } = response
		if (!response.ok || !body) throw new Error(`HTTP ${response.status} ${response.statusText}`)

		const hash = createHash('sha256')
		let received = 0
		await pipeline(async function* hashed() {
			for await (const chunk of body) {
				// bun-types leaves a fetch body's chunk type as `any`.
				if (!(chunk instanceof Uint8Array)) throw new TypeError(`${url} streamed a non-byte chunk`)
				hash.update(chunk)
				received += chunk.length
				options.onProgress?.({ received, total: entry.bytes })
				yield chunk
			}
		}, createWriteStream(partial))

		const digest = hash.digest('hex')
		if (digest !== entry.sha256) throw new Error(`sha256 mismatch — got ${digest}`)
	}

	await mkdir(dirname(target), { recursive: true })
	const failures: string[] = []

	for (const mirror of MIRRORS)
		try {
			await fetchInto(`${mirror}/${entry.file}`)
			await rename(partial, target)
			return target
		} catch (error) {
			await rm(partial, { force: true })
			if (options.signal?.aborted) throw error
			failures.push(`  ${mirror} — ${error instanceof Error ? error.message : String(error)}`)
		}

	throw new Error(
		`could not download ${entry.file}:\n${failures.join('\n')}\n` +
			`Fetch ${MIRRORS[0]}/${entry.file} by hand and point hearsay.modelPath at it.`,
	)
}

/** Returns a path to a usable ggml model, downloading it first if the cache has no verified copy. */
export const resolveModel = async (options: ResolveOptions = {}) => {
	const { id = DEFAULT_MODEL_ID, dir, localPath } = options

	if (localPath) {
		if (!(await sizeOf(localPath))) throw new Error(`hearsay.modelPath points at nothing: ${localPath}`)
		return localPath
	}

	const entry = findModel(id)
	if (!entry) throw new Error(`unknown model ${id} — one of: ${MODEL_IDS.join(', ')}`)
	if (!dir) throw new Error('resolveModel needs a cache dir when no local path is set')

	return (await cachedPath(dir, entry)) ?? download(entry, join(dir, entry.file), options)
}
