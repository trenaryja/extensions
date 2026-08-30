import * as R from 'remeda'

const EXTENSION_SOUNDS: Record<string, string> = {
	app: 'app',
	css: 'c s s',
	csv: 'c s v',
	db: 'd b',
	env: 'e n v',
	gif: 'gif',
	html: 'h t m l',
	jpg: 'j peg',
	js: 'j s',
	json: 'jaysahn',
	jsonc: 'jaysahn c',
	local: 'local',
	lock: 'lock',
	log: 'log',
	md: 'm d',
	mjs: 'm j s',
	pdf: 'p d f',
	plist: 'p list',
	png: 'p n g',
	py: 'pie',
	rs: 'r s',
	sh: 's h',
	sql: 'sequel',
	svg: 's v g',
	swift: 'swift',
	tf: 't f',
	toml: 'tommle',
	ts: 't s',
	tsv: 't s v',
	tsx: 't s x',
	txt: 'text',
	wav: 'wav',
	xml: 'x m l',
	yaml: 'yamuhl',
	yml: 'yamuhl',
	zip: 'zip',
}

const SYMBOL_SOUNDS: Record<string, string> = {
	'✅': 'yes',
	'✓': 'yes',
	'❌': 'no',
	'✗': 'no',
	'⚠': 'warning',
	'❓': 'unknown',
	'⌘': 'command',
	'⇧': 'shift',
	'⌥': 'option',
	'⌃': 'control',
	'⏎': 'return',
	'↵': 'return',
	'⎋': 'escape',
	'⇥': 'tab',
	'⌫': 'delete',
	'⌦': 'forward delete',
	'⇪': 'caps lock',
	'␣': 'space',
	'⇞': 'page up',
	'⇟': 'page down',
	'≈': 'about',
	'§': 'section',
	'★': 'star',
	'☆': 'star',
	'°': 'degrees',
	'·': ',',
	'…': '...',
}

const MODIFIER_SYMBOLS = '⌘⇧⌥⌃'

// Only what follows a modifier in shortcut notation. Punctuation here is the name of a key, and
// an arrow is an arrow key; anywhere else the same characters are prose and must stay untouched.
const SHORTCUT_KEY_SOUNDS: Record<string, string> = {
	'-': 'minus',
	'=': 'equals',
	'.': 'period',
	',': 'comma',
	'/': 'slash',
	'+': 'plus',
	'[': 'left bracket',
	']': 'right bracket',
	'↑': 'up arrow',
	'↓': 'down arrow',
	'←': 'left arrow',
	'→': 'right arrow',
	'↖': 'home',
	'↘': 'end',
}

const characterClass = (characters: string[]) => `[${R.join(characters, '').replace(/[\]\\^-]/g, String.raw`\$&`)}]`

const SYMBOLS = new RegExp(characterClass(R.keys(SYMBOL_SOUNDS)), 'g')
const SHORTCUT_KEYS = new RegExp(`(?<=[${MODIFIER_SYMBOLS}])${characterClass(R.keys(SHORTCUT_KEY_SOUNDS))}`, 'g')

// A directory prefix is optional, but an extension is not: without one, `and/or` and `e.g.`
// both read as paths.
const PATH_SOURCE = String.raw`(?:[~.]{0,2}/)?(?:[\w.@-]+/)*[\w.@-]+\.[A-Za-z]\w{0,5}`
const PATH = new RegExp(String.raw`(?<![\w./-])${PATH_SOURCE}(?![\w-])`, 'g')
const FILE_LINE = new RegExp(String.raw`(?<![\w./-])(${PATH_SOURCE}):(\d+)(?:-(\d+))?(?![\w-])`, 'g')
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>()[\]]+/g
const COMMIT_SHA = /(?<![#\-/.\w])(?:[\da-f]{7,12}|[\da-f]{40})(?![\w-])(?!\.[\da-z])/gi
const COMMIT_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
// The noun already names the sha, so the replacement swallows it rather than saying it twice.
const SHA_NOUN_PHRASE = String.raw`(?:(?:the|this|that)\s+)?(?:(?:commits?|shas?|hash(?:es)?|revisions?)\s+){1,2}`
const NAMED_COMMIT_SHA = new RegExp(String.raw`(${SHA_NOUN_PHRASE})?${COMMIT_SHA.source}`, 'gi')

const LONG_FLAG = /(?<![\w-])--([a-z\d]+(?:-[a-z\d]+)*)(?![\w-])/g
// A lone dash is mostly prose, so a short flag has to earn the match: nothing wordlike before it,
// no space after it, no digits, and short enough that `-maybe` and `wait - I` cannot qualify.
const SHORT_FLAG = /(?<![\w-])-([a-zA-Z]{1,3})(?![\w-])/g
// A standalone `--` is the argument separator; agent prose writes its pauses as real em dashes.
const BARE_FLAG = /(?<![\w-])--(?![\w-])/g

const spellOut = (word: string) => R.pipe([...word], R.join(' '))

const capitalizeLike = (prefix: string, spoken: string) =>
	/^[A-Z]/.test(prefix) ? spoken.charAt(0).toUpperCase() + spoken.slice(1) : spoken

// Invisible on screen and inside tokens, so it has to go before anything matches on word shape.
const stripInvisible = (message: string) => message.replace(/[\uFE0E\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]/gu, '')

const spokenDomain = (host: string) => host.replace(/^www\./, '').replaceAll('.', ' dot ')

const spokenUrl = (url: string) => {
	const address = url.replace(/^https?:\/\//, '')
	const [location = ''] = address.split(/[?#]/)
	const [host = '', ...segments] = R.pipe(location.split('/'), R.filter(R.isTruthy))
	const isLong = address.length > location.length || segments.length > 1
	return isLong ? `a link to ${spokenDomain(host)}` : spokenDomain(host)
}

const speakUrls = (message: string) =>
	message.replace(URL_PATTERN, (match) => {
		const [trailingPunctuation = ''] = match.match(/[.,;:!?)]+$/) ?? []
		return spokenUrl(match.slice(0, match.length - trailingPunctuation.length)) + trailingPunctuation
	})

const isCommitSha = (candidate: string) => /\d/.test(candidate) && /[a-f]/i.test(candidate)

// Two passes: the first names every distinct sha so the second can say the same letter for the
// same sha wherever it appears. The quotes are load-bearing: kokoro and `say` both read a bare
// capital letter as the article "a", so `commit A` came out as "commit ah".
const speakCommitShas = (message: string) => {
	const distinct = R.pipe(message.match(COMMIT_SHA) ?? [], R.filter(isCommitSha), R.unique())
	if (R.isEmpty(distinct)) return message
	const names = R.mapToObj(distinct, (sha, index) => [
		sha,
		distinct.length === 1 ? 'the commit' : `commit "${COMMIT_LETTERS[index] ?? index + 1}"`,
	])
	return message.replace(NAMED_COMMIT_SHA, (match, noun = '') => {
		const name = names[match.slice(noun.length)]
		if (!name) return match
		return capitalizeLike(noun, name)
	})
}

const spokenPath = (path: string) => {
	const basename = path.slice(path.lastIndexOf('/') + 1)
	const lastDot = basename.lastIndexOf('.')
	if (lastDot <= 0) return null
	const extension = basename.slice(lastDot + 1).toLowerCase()
	if (!path.includes('/') && !(extension in EXTENSION_SOUNDS)) return null
	const name = basename.slice(0, lastDot).replaceAll('.', ' dot ')
	return `${name} dot ${EXTENSION_SOUNDS[extension] ?? spellOut(extension)}`
}

const speakFileLines = (message: string) =>
	message.replace(FILE_LINE, (match, path: string, first: string, last: string | undefined) => {
		const spoken = spokenPath(path)
		if (!spoken) return match
		return last ? `${spoken}, lines ${first} to ${last}` : `${spoken}, line ${first}`
	})

const speakPaths = (message: string) => message.replace(PATH, (match) => spokenPath(match) ?? match)

const speakVersions = (message: string) => message.replace(/(?<![\w.])v(\d+(?:\.\d+)+)/g, 'version $1')

// Read the way a developer reads one aloud. A bare `--` is left for `speakDashes`: it is also
// written as an em dash substitute, where "dash dash" would be worse than a pause.
const speakFlags = (message: string) =>
	message
		.replace(LONG_FLAG, (_match, name: string) => `dash dash ${name.replaceAll('-', ' ')}`)
		// Lowercased because a lone capital `A` is read as the indefinite article; losing the case beats
		// losing the letter, which is what happened while `-R` went unmatched.
		.replace(SHORT_FLAG, (_match, letters: string) => `dash ${spellOut(letters.toLowerCase())}`)
		.replace(BARE_FLAG, 'dash dash')

const speakIdentifiers = (message: string) =>
	message
		.replace(/\b[a-z][a-z\d]*(?:[A-Z][a-z\d]+)+\b/g, (identifier) =>
			identifier.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`),
		)
		// An assignment is left spelled out: the listener may have to type `LOG_LEVEL=debug` back.
		.replace(/\b[A-Z][A-Z\d]*(?:_[A-Z\d]+)+\b(?![^\S\n]*[:=])/g, (identifier) =>
			identifier.toLowerCase().replaceAll('_', ' '),
		)

const speakShortcutKeys = (message: string) =>
	message.replace(SHORTCUT_KEYS, (key) => ` ${SHORTCUT_KEY_SOUNDS[key] ?? key} `)

const speakArrows = (message: string) =>
	message
		.replace(/(?<=\d[^\S\n]?)(?:->|=>|[→➡])(?=[^\S\n]?\d)/g, ' to ')
		.replace(/(?:->|=>|[→➡])/g, ' becomes ')
		.replace(/←/g, ' from ')
		.replace(/↔/g, ' to and from ')

const speakDashes = (message: string) =>
	message
		.replace(/(?<=\d[^\S\n]?)–(?=[^\S\n]?\d)/g, ' to ')
		.replace(/\s*[—–](?=\s*(?:\n|$))/g, '.')
		.replace(/\s*[—–]\s*/g, ', ')

const speakSymbols = (message: string) =>
	message
		.replace(/(?<=\d[^\S\n]?)×(?=[^\S\n]?\d)/g, ' by ')
		.replace(/(?<=\d[^\S\n]?)×/g, ' times ')
		.replace(/×/g, '')
		.replace(SYMBOLS, (symbol) => ` ${SYMBOL_SOUNDS[symbol] ?? ''} `)

const dropRemainingEmoji = (message: string) => message.replace(/\p{Extended_Pictographic}/gu, '')

const tidy = (message: string) =>
	R.pipe(
		message
			.replace(/[^\S\n]+/g, ' ')
			.replace(/ ([,.;:!?])/g, '$1')
			.replace(/([,.;:!?]) ?,/g, '$1')
			.split('\n'),
		R.map((line) => line.trim()),
		R.filter(R.isTruthy),
		R.join('\n'),
	)

// Order is the whole game here. Urls go first because a url is full of the dots and slashes the
// path rule looks for; shas are named before anything else rewrites a token; `file.ts:33` is
// claimed before the bare path rule can take the `file.ts` off the front of it; identifiers run
// after paths so a camelCase basename is split once the path is already spoken. Shortcut keys go
// before both the arrow and the symbol rule: those consume the anchors it matches on.
const RULES = [
	stripInvisible,
	speakUrls,
	speakCommitShas,
	speakFileLines,
	speakVersions,
	speakPaths,
	speakFlags,
	speakIdentifiers,
	speakShortcutKeys,
	speakArrows,
	speakDashes,
	speakSymbols,
	dropRemainingEmoji,
	tidy,
]

export const pronounce = (message: string) => R.reduce(RULES, (spoken, rule) => rule(spoken), message)
