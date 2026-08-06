import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { recordGif } from '@repo/vscode-utils/headless'
import type { Page } from 'playwright-core'

// Record marketplace demo GIFs by driving the real webview bundle in headless Chromium.
//
//   bun harness/record.ts [scenario…]   // default: all → ../media/<name>.gif
//
// Requires `bun run build` first (loads dist/) and gifski (`brew install gifski`).

const here = dirname(fileURLToPath(import.meta.url))
const media = join(here, '..', 'media')

const load = async (page: Page, doc: string) => {
	page.on('pageerror', (error) => console.error('[pageerror]', error.message))
	await page.addInitScript((markdown: string) => {
		;(window as unknown as { HARNESS_CONTENT: string }).HARNESS_CONTENT = markdown
	}, doc)
	await page.goto(`file://${join(here, 'index.html')}`)
	await page.waitForSelector('.cm-content', { timeout: 15000 })
	await page.waitForTimeout(1200)
}

const type = (page: Page, text: string) => page.keyboard.type(text, { delay: 45 })
const line = async (page: Page, text: string) => {
	await type(page, text)
	await page.keyboard.press('Enter')
}

type Scenario = { name: string; doc: string; run: (page: Page) => Promise<void> }

const FIND_DOC = `# Field Notes

## Tables

A table is a grid you edit in place — click a cell, type, tab to the next.
Every table is rewritten exactly the way Prettier would print it.

## Callouts

> [!TIP] Callouts come in every flavor
> and every callout can hold a table of its own.

## Math

Inline math like $e^{i\\pi} + 1 = 0$ renders as you type, and every
block equation ships with a copy button. Tables, callouts, and math
all stay plain markdown on disk — no separate table format, ever.
`

const SCENARIOS: Scenario[] = [
	{
		name: 'editing',
		doc: '# Marksmith\n\n',
		run: async (page) => {
			await page.keyboard.press('Meta+ArrowDown')
			await page.waitForTimeout(600)
			await line(page, 'Everything renders **live** — as you _type_.')
			await page.waitForTimeout(600)
			// Markdown auto-continues list/quote markers on Enter — type the marker once, then just content.
			await line(page, '- [x] Task lists')
			await line(page, 'that render as you go')
			await page.keyboard.press('Enter')
			await page.waitForTimeout(500)
			await line(page, '> [!TIP] Callouts too')
			await line(page, 'live, while you write')
			// Quote continuation leaves a bare `> ` — Backspace (deleteMarkupBackward) clears it.
			await page.keyboard.press('Backspace')
			await page.waitForTimeout(900)
			// Walk back up: the active line reveals its raw markdown, then re-renders on the way out.
			for (let step = 0; step < 4; step++) {
				await page.keyboard.press('ArrowUp')
				await page.waitForTimeout(350)
			}
			await page.keyboard.press('Meta+ArrowDown')
			await page.waitForTimeout(1200)
		},
	},
	{
		name: 'find',
		doc: FIND_DOC,
		run: async (page) => {
			await page.waitForTimeout(700)
			await page.keyboard.press('Meta+f')
			await page.waitForTimeout(400)
			await type(page, 'table')
			await page.waitForTimeout(900)
			for (let match = 0; match < 3; match++) {
				await page.keyboard.press('Enter')
				await page.waitForTimeout(650)
			}
			await page.keyboard.press('Escape')
			await page.waitForTimeout(900)
		},
	},
	{
		name: 'blocks',
		doc: '# Rich blocks\n\n',
		run: async (page) => {
			await page.keyboard.press('Meta+ArrowDown')
			await page.waitForTimeout(500)
			await line(page, '$$')
			await line(page, 'e^{i\\pi} + 1 = 0')
			await line(page, '$$')
			await page.keyboard.press('Enter')
			await page.waitForTimeout(1200)
			await line(page, '```mermaid')
			await line(page, 'flowchart LR')
			await line(page, '  Write --> Render --> Edit')
			// Auto-indent carries the leading spaces onto the new line — clear them or the fence won't close.
			await page.keyboard.press('Meta+Backspace')
			await type(page, '```')
			await page.keyboard.press('Enter')
			await page.keyboard.press('Meta+Backspace')
			await page.waitForTimeout(2600)
		},
	},
]

const TABLES_DOC = `# Tables

| Feature  | Flavor   | Ships |
| -------- | -------- | ----- |
| Tables   | GFM      | ✅    |
| Callouts | Obsidian | ✅    |
| Math     | LaTeX    |       |
`

const CALLOUTS_DOC = `# Callouts

> [!TIP] Callouts come in every flavor
> note, tip, warning, quote — and custom ones you define.

> [!WARNING]- This one starts folded
> Click the title to reveal the details inside.
`

SCENARIOS.push(
	{
		name: 'tables',
		doc: TABLES_DOC,
		run: async (page) => {
			await page.waitForTimeout(800)
			// Fill the empty cell: click to select, type to edit (Excel-style), Enter commits.
			// Emoji can't be typed as key events, and the grid enters edit from keydown — so double-click
			// into edit mode first, then insertText targets the live cell editor.
			await page.locator('.md-table td').nth(8).dblclick()
			await page.waitForTimeout(500)
			await page.keyboard.insertText('✅')
			await page.keyboard.press('Enter')
			await page.waitForTimeout(800)
			// Add a whole row from the edge bar, then tab across it.
			await page.locator('.md-table-add-row').click()
			await page.waitForTimeout(600)
			await page.locator('.md-table td').nth(9).click()
			await type(page, 'Mermaid')
			await page.keyboard.press('Tab')
			await type(page, 'Mermaid')
			await page.keyboard.press('Tab')
			await page.locator('.md-table td').nth(11).dblclick()
			await page.keyboard.insertText('✅')
			await page.keyboard.press('Enter')
			await page.keyboard.press('Escape')
			await page.waitForTimeout(1200)
		},
	},
	{
		name: 'callouts',
		doc: CALLOUTS_DOC,
		run: async (page) => {
			// Off the heading line so its raw `#` doesn't stay revealed in every frame.
			await page.keyboard.press('ArrowDown')
			await page.waitForTimeout(900)
			const fold = page.locator('.md-callout-fold').last()
			await fold.click()
			await page.waitForTimeout(1100)
			await fold.click()
			await page.waitForTimeout(900)
			await fold.click()
			await page.waitForTimeout(1300)
		},
	},
	{
		name: 'code',
		doc: '# Code\n\n',
		run: async (page) => {
			await page.keyboard.press('Meta+ArrowDown')
			await page.waitForTimeout(500)
			await line(page, '```ts')
			await line(page, 'const greet = (name: string) => `Hello, ${name}!`')
			await line(page, "console.log(greet('Marksmith'))")
			await type(page, '```')
			await page.keyboard.press('Enter')
			await page.waitForTimeout(1800)
		},
	},
)

const requested = process.argv.slice(2)
const toRecord = requested.length ? SCENARIOS.filter((s) => requested.includes(s.name)) : SCENARIOS
if (!toRecord.length) throw new Error(`No matching scenarios. Available: ${SCENARIOS.map((s) => s.name).join(', ')}`)

for (const scenario of toRecord) {
	const output = join(media, `${scenario.name}.gif`)
	await recordGif({ width: 880, height: 560, output, fps: 14, quality: 80 }, async (page) => {
		await load(page, scenario.doc)
		await scenario.run(page)
	})
	console.log(`gif → ${output}`)
}
