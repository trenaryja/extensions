import { z } from 'zod'

/** `keywords[i]` indexes `keywordGroups` for `icons[i]`, or is -1; sets arrive in preference order, which breaks ties. */
export const Catalog = z.object({
	sets: z.array(
		z.object({ id: z.string(), name: z.string(), icons: z.array(z.string()), keywords: z.array(z.number()) }),
	),
	keywordGroups: z.array(z.string()),
})
export type Catalog = z.infer<typeof Catalog>

/** Out-of-range cells never win a minimum. */
const cellAt = (row: readonly number[], index: number) => row[index] ?? Infinity

/** Optimal string alignment distance, abandoned once every cell in a row exceeds `limit`. */
const typoDistance = (a: string, b: string, limit: number) => {
	if (Math.abs(a.length - b.length) > limit) return limit + 1
	let previousRow: number[] = []
	let row = Array.from({ length: b.length + 1 }, (_, j) => j)

	for (let i = 1; i <= a.length; i++) {
		const nextRow = [i]

		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			let best = Math.min(cellAt(row, j) + 1, cellAt(nextRow, j - 1) + 1, cellAt(row, j - 1) + cost)
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
				best = Math.min(best, cellAt(previousRow, j - 2) + 1)
			nextRow.push(best)
		}

		if (Math.min(...nextRow) > limit) return limit + 1
		previousRow = row
		row = nextRow
	}

	return row[b.length] ?? limit + 1
}

/** 0 when `token` doesn't match `word`; exact > prefix > substring > typo. */
const matchQuality = (token: string, word: string, allowTypos: boolean) => {
	if (word === token) return 1
	if (word.startsWith(token)) return 0.7 + (0.2 * token.length) / word.length
	if (token.length >= 3 && word.includes(token)) return 0.45
	if (!allowTypos || token.length < 3 || word[0] !== token[0]) return 0
	const limit = token.length >= 8 ? 2 : 1
	const distance = Math.min(typoDistance(token, word, limit), typoDistance(token, word.slice(0, token.length), limit))
	return distance <= limit ? 0.3 - 0.05 * distance + (0.05 * token.length) / word.length : 0
}

const weights = { name: 10, joinedName: 8, keyword: 6, set: 5, perNameWord: 0.3 }

const addPosting = (postings: Map<string, number[]>, word: string, id: number) => {
	const ids = postings.get(word)
	if (ids) ids.push(id)
	else postings.set(word, [id])
}

/** Builds once per catalog; `search` then scans the vocabulary, not the icons. */
export const createSearch = (catalog: Catalog) => {
	const names: string[] = []
	const wordCounts: number[] = []
	const nameWords = new Map<string, number[]>()
	/** `arrowdown` and `githubcopilot` find `lu_arrow_down` and `si_githubcopilot`. */
	const joinedNames = new Map<string, number[]>()
	/** Postings are `group * 64 + position`: upstream lists a concept's closest tags first, so later ones count less. */
	const keywordWords = new Map<string, number[]>()
	const groupIcons: number[][] = catalog.keywordGroups.map(() => [])
	const setRanges: [number, number][] = []
	const setWords = new Map<string, number[]>()

	for (const [setIndex, set] of catalog.sets.entries()) {
		const start = names.length

		for (const [position, name] of set.icons.entries()) {
			const id = names.length
			names.push(name)
			const subject = name.split('_').slice(1)
			wordCounts.push(subject.length)
			for (const word of new Set(subject)) addPosting(nameWords, word, id)
			if (subject.length > 1) addPosting(joinedNames, subject.join(''), id)
			groupIcons[set.keywords[position] ?? -1]?.push(id)
		}

		setRanges.push([start, names.length])
		for (const word of new Set([set.id, ...set.name.toLowerCase().split(/[^a-z0-9]+/)]))
			addPosting(setWords, word, setIndex)
	}

	for (const [group, keywords] of catalog.keywordGroups.entries())
		for (const [position, word] of keywords.split(' ').entries())
			addPosting(keywordWords, word, group * 64 + Math.min(position, 63))

	const total = new Float32Array(names.length)
	const tokenScore = new Float32Array(names.length)

	const scoreToken = (token: string) => {
		tokenScore.fill(0)

		const raise = (id: number, score: number) => {
			if (score > (tokenScore[id] ?? 0)) tokenScore[id] = score
		}

		const scan = (
			postings: Map<string, number[]>,
			allowTypos: boolean,
			onMatch: (posting: number, quality: number) => void,
		) => {
			for (const [word, list] of postings) {
				const quality = matchQuality(token, word, allowTypos)
				if (quality) for (const posting of list) onMatch(posting, quality)
			}
		}

		scan(nameWords, true, (id, quality) => raise(id, quality * weights.name))
		scan(joinedNames, false, (id, quality) => raise(id, quality * weights.joinedName))
		scan(keywordWords, true, (posting, quality) => {
			const score = quality * weights.keyword * (1 - 0.04 * Math.min(posting % 64, 10))
			for (const id of groupIcons[Math.floor(posting / 64)] ?? []) raise(id, score)
		})
		// Exact or prefix only: `luc` narrows to Lucide, `cide` shouldn't.
		scan(setWords, false, (setIndex, quality) => {
			if (quality < 0.7) return
			const [start, end] = setRanges[setIndex] ?? [0, 0]
			for (let id = start; id < end; id++) raise(id, quality * weights.set)
		})
	}

	/** Icon ids, best first; every token must match somewhere (name, keyword or set). */
	const search = (query: string, setIndex?: number) => {
		const tokens = query
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter(Boolean)
		const [start, end] = setIndex === undefined ? [0, names.length] : (setRanges[setIndex] ?? [0, 0])
		if (tokens.length === 0) return Array.from({ length: end - start }, (_, i) => start + i)
		total.fill(0)

		for (const [index, token] of tokens.entries()) {
			scoreToken(token)

			for (let id = start; id < end; id++) {
				const score = tokenScore[id] ?? 0
				const sum = total[id] ?? 0
				total[id] = score && (index === 0 || sum) ? sum + score : 0
			}
		}

		const ids: number[] = []

		for (let id = start; id < end; id++) {
			const sum = total[id]
			if (!sum) continue
			total[id] = sum - (wordCounts[id] ?? 0) * weights.perNameWord
			ids.push(id)
		}

		return ids.toSorted((a, b) => (total[b] ?? 0) - (total[a] ?? 0) || a - b)
	}

	return { names, search }
}
