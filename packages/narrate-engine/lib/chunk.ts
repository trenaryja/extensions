import * as R from 'remeda'
import type { Chunk } from './types'

const DEFAULT_MAX_CHARS = 400
const LEAD_MIN_CHARS = 40
const LEAD_MAX_CHARS = 120

const TERMINATORS = new Set(['!', '?', '.'])
const CLOSERS = new Set(["'", '’', '"', '”', '»', ')', ']', '}'])
const ABBREVIATIONS = new Set(['dr', 'etc', 'inc', 'jr', 'ltd', 'mr', 'mrs', 'ms', 'prof', 'sr', 'st', 'vs'])

const WHITESPACE = /\s/
const SENTENCE_OPENER = /["'(0-9A-[‘“]/
const TRAILING_WORD = /[.a-z]+$/i
const CLAUSE_BREAK = /([,:;])\s+|\s+[-–—]\s+/g

// A dot ends a sentence unless it belongs to an ellipsis, an initial (`J. R.`), a known
// abbreviation, or a dotted acronym — `U.S.` and `e.g.` have short segments, `sayx.tsx` does not.
const isSentenceDot = (line: string, index: number) => {
	if (line[index - 1] === '.' || line[index + 1] === '.') return false
	const word = TRAILING_WORD.exec(line.slice(0, index))?.[0]
	if (!word) return true
	if (word.includes('.')) return word.split('.').some((part) => part.length > 2)
	if (word.length === 1 && word === word.toUpperCase()) return false
	return !ABBREVIATIONS.has(word.toLowerCase())
}

// `end` sits past the terminator and any closing quotes/parens it carries.
const endsSentence = (line: string, terminator: number, end: number) => {
	if (line[terminator] === '.' && !isSentenceDot(line, terminator)) return false
	if (end >= line.length) return true
	if (!WHITESPACE.test(line[end]!)) return false
	let next = end
	while (next < line.length && WHITESPACE.test(line[next]!)) next += 1
	return next >= line.length || SENTENCE_OPENER.test(line[next]!)
}

const splitSentences = (line: string) => {
	const sentences: string[] = []
	let start = 0

	for (let i = 0; i < line.length; i++) {
		if (!TERMINATORS.has(line[i]!)) continue
		let end = i + 1
		while (end < line.length && (TERMINATORS.has(line[end]!) || CLOSERS.has(line[end]!))) end += 1

		if (endsSentence(line, i, end)) {
			sentences.push(line.slice(start, end))
			start = end
		}

		i = end - 1
	}

	sentences.push(line.slice(start))
	return sentences
}

// `stop` ends the current chunk, `resume` starts the next one; the gap between them
// is whitespace plus, for dashes, the dash itself — silence either way once spoken.
const clauseBreaks = (text: string) =>
	R.map([...text.matchAll(CLAUSE_BREAK)], (match) => ({
		stop: match[1] ? match.index + 1 : match.index,
		resume: match.index + match[0].length,
	}))

const wordBreak = (text: string, start: number, limit: number) => {
	let stop = limit
	while (stop > start && !WHITESPACE.test(text[stop]!)) stop -= 1

	// A single word longer than the budget overruns rather than being cut in half.
	if (stop <= start) {
		stop = limit
		while (stop < text.length && !WHITESPACE.test(text[stop]!)) stop += 1
	}

	let resume = stop
	while (resume < text.length && WHITESPACE.test(text[resume]!)) resume += 1
	return { stop, resume }
}

const splitLong = (sentence: string, maxChars: number) => {
	if (sentence.length <= maxChars) return [sentence]
	const breaks = clauseBreaks(sentence)
	const parts: string[] = []
	let start = 0

	while (sentence.length - start > maxChars) {
		const limit = start + maxChars
		const minimum = start + Math.floor(maxChars / 2)
		const clause = breaks.findLast((candidate) => candidate.stop >= minimum && candidate.stop <= limit)
		const { stop, resume } = clause ?? wordBreak(sentence, start, limit)
		parts.push(sentence.slice(start, stop))
		start = resume
	}

	parts.push(sentence.slice(start))
	return parts
}

// A long opening sentence delays the first audio, so peel a speakable clause off the front.
const carveLead = (sentence: string) => {
	if (sentence.length <= LEAD_MAX_CHARS) return [sentence]
	const lead = clauseBreaks(sentence).findLast(
		(candidate) => candidate.stop >= LEAD_MIN_CHARS && candidate.stop <= LEAD_MAX_CHARS,
	)
	if (!lead) return [sentence]
	return [sentence.slice(0, lead.stop), sentence.slice(lead.resume)]
}

// Paragraphs with nothing speakable in them are dropped before numbering, so `line` stays contiguous.
const paragraphs = (text: string) =>
	R.pipe(
		text,
		R.split('\n'),
		R.map((line) =>
			R.pipe(
				splitSentences(line),
				R.map((sentence) => sentence.trim()),
				R.filter(R.isTruthy),
			),
		),
		R.filter((sentences) => sentences.length > 0),
	)

const onLine = (line: number, texts: string[]) => R.map(texts, (text) => ({ line, text }))

export const chunk = (text: string, { maxChars = DEFAULT_MAX_CHARS }: { maxChars?: number } = {}): Chunk[] =>
	R.pipe(
		paragraphs(text),
		R.flatMap((sentences, line) => onLine(line, sentences)),
		R.flatMap((part, index) => (index === 0 ? onLine(part.line, carveLead(part.text)) : [part])),
		R.flatMap((part) => onLine(part.line, splitLong(part.text, maxChars))),
		R.map((part) => ({ line: part.line, text: part.text.trim() })),
		R.filter((part) => R.isTruthy(part.text)),
		R.map((part, index) => ({ index, text: part.text, line: part.line })),
	)
