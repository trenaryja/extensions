import { describe, expect, test } from 'bun:test'
import { SUMMARIZER_IDS } from '../types'
import { getSummarizer } from '.'
import { buildPrompt } from './prompt'

const SAMPLE = `The build script walks every entry in build.json and compiles it to a single binary in ~/.local/bin. TypeScript targets go through \`bun build --compile\`, Go targets through \`go build\` with a tag per variant, and the Rust target through \`cargo build --release\`. Each language is skipped, with a warning, when its toolchain is missing.

Output naming is deliberate. A target may declare an \`output\` field, and when it does not, the name falls back to the entry file's directory. That is what lets one folder ship several binaries: git-ai-commit builds four, one per prompt framework, and each gets an explicit name.

The interesting failure mode is partial success. A run that compiles nine of eleven targets still exits zero today, which means a broken Go target can sit unnoticed for weeks. The fix under discussion is to collect per-target results and exit non-zero if any of them failed, while still attempting all of them.`

const BINARY_BY_SUMMARIZER = { claude: 'claude', opencode: 'opencode' } as const

const skipLive = !process.env.NARRATE_LIVE

test('buildPrompt carries the passage through', () => {
	expect(buildPrompt(SAMPLE)).toContain(SAMPLE)
})

test('buildPrompt states the spoken-summary constraints', () => {
	const prompt = buildPrompt('anything')
	expect(prompt).toMatch(/read aloud/i)
	expect(prompt).toMatch(/no markdown/i)
	expect(prompt).toMatch(/bullet points/i)
	expect(prompt).toMatch(/backticks/i)
	expect(prompt).toMatch(/between 60 and 120 words/i)
})

describe.each([...SUMMARIZER_IDS])('%s summarizer', (summarizerId) => {
	const summarizer = getSummarizer(summarizerId)

	test('reports availability from the binary on PATH', async () => {
		expect(await summarizer.available()).toBe(!!Bun.which(BINARY_BY_SUMMARIZER[summarizerId]))
	})

	test.skipIf(skipLive)(
		'returns a spoken summary with no markup',
		async () => {
			const summary = await summarizer.summarize(SAMPLE, new AbortController().signal)
			expect(summary.length).toBeGreaterThan(0)
			expect(summary).not.toContain('*')
			expect(summary).not.toContain('#')
			expect(summary).not.toContain('`')
		},
		300_000,
	)
})
