import type { Code, Heading, Link, List, Paragraph, Root, RootContent, Table, TableCell } from 'mdast'
import { toString } from 'mdast-util-to-string'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import * as R from 'remeda'
import stripMarkdown from 'strip-markdown'
import { visit } from 'unist-util-visit'
import { pronounce } from './pronounce'

const REDACTION = 'a redacted secret'

// Lowercase throughout: the `i` flag covers the uppercase spellings.
// `(?<![\da-z])` rather than `\b`: emphasis markers are underscores, so `\b` would
// refuse to match the `ghp_` in `_ghp_abc_` and leak the token into the spoken text.
// The key/value alternative comes first so `GITHUB_TOKEN=ghp_…` redacts once, as a value.
// A value stops at a word char so `**KEY=ghp_…**` keeps the closing `**` and still parses as bold.
const SECRET_PATTERN = new RegExp(
	[
		String.raw`([\w\-.]*(?:api_key|password|secret|token)[\w\-.]*)(\s*[:=]\s*)(?:bearer\s+)?(?:"[^"]*"|'[^']*'|\S*[\w/=])`,
		String.raw`(?<![\da-z])github_pat_\w+`,
		String.raw`(?<![\da-z])gh[ops]_[\da-z]+`,
		String.raw`(?<![\da-z])sk-[\w-]+`,
		String.raw`(?<![\da-z])akia[\da-z]{16}`,
		String.raw`bearer\s+[\w+\-./~]*[\w=]`,
	].join('|'),
	'gi',
)

const redactSecrets = (markdown: string) =>
	markdown.replace(SECRET_PATTERN, (_match, key: string | undefined, separator: string) =>
		key ? `${key}${separator}${REDACTION}` : REDACTION,
	)

const sentence = (text: string) => {
	const trimmed = text.trim()
	if (!trimmed) return ''
	return /[!.:;?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

const asParagraph = (value: string): Paragraph => ({ type: 'paragraph', children: [{ type: 'text', value }] })

const codeSentence = (node: Code) => {
	const lineCount = node.value ? node.value.split('\n').length : 0
	const language = node.lang ? `${node.lang} ` : ''
	return `a ${language}snippet, ${lineCount} ${lineCount === 1 ? 'line' : 'lines'}, on screen.`
}

const blockText = (node: RootContent) => (node.type === 'code' ? codeSentence(node) : toString(node))

const speakCell = (header: string | undefined, value: string) => {
	if (!value) return ''
	return sentence(header ? `${header}: ${value}` : value)
}

const tableRowSentences = ({ children: [headerRow, ...bodyRows] }: Table) => {
	const headers = R.map(headerRow?.children ?? [], (cell) => toString(cell).trim())
	const spokenCell = (cell: TableCell, index: number) => speakCell(headers[index], toString(cell).trim())
	return R.map(bodyRows, (row) =>
		asParagraph(R.pipe(row.children, R.map(spokenCell), R.filter(R.isTruthy), R.join(' '))),
	)
}

const listSentences = (list: List): Paragraph[] =>
	R.flatMap(list.children, (item) => {
		const [nested, own] = R.partition(item.children, (child) => child.type === 'list')
		return [asParagraph(sentence(R.pipe(own, R.map(blockText), R.join(' ')))), ...R.flatMap(nested, listSentences)]
	})

const isBareUrl = (link: Link) => {
	const text = toString(link)
	return !text || text === link.url || /^(?:https?:\/\/|www\.)/.test(text)
}

// Runs before strip-markdown so links and images inside table cells and list items are
// already spoken text by the time those handlers flatten them with `toString`.
const speakInlineTargets = () => (tree: Root) => {
	visit(tree, (node) => {
		if (node.type === 'image' || node.type === 'imageReference')
			Object.assign(node, { type: 'text', value: 'an image' })
		if (node.type === 'link')
			Object.assign(node, { type: 'text', value: isBareUrl(node) ? node.url : toString(node), children: [] })
	})
}

const processor = remark()
	.use(remarkGfm)
	.use(speakInlineTargets)
	.use(stripMarkdown, {
		remove: [
			['code', (node: Code) => asParagraph(codeSentence(node))],
			['heading', (node: Heading) => asParagraph(sentence(toString(node)))],
			['table', tableRowSentences],
			['list', listSentences],
		],
	})

// `pronounce` runs on the whole joined message, not per block: naming commit shas by letter
// depends on seeing every sha in the message at once.
export const normalize = (markdown: string) =>
	R.pipe(
		processor.runSync(processor.parse(redactSecrets(markdown))).children,
		R.map((child) => toString(child).replace(/\s+/g, ' ').trim()),
		R.filter(R.isTruthy),
		R.join('\n'),
		pronounce,
	)
