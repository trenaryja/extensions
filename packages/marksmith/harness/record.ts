import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { recordGif } from '@repo/vscode-utils/headless'
import type { Locator, Page } from 'playwright-core'

// Record marketplace demo GIFs by driving the real webview bundle in headless Chromium.
//
//   bun harness/record.ts [scenario…]   // default: all → ../media/<name>.gif
//
// Requires `bun run build` first (loads dist/) and gifski (`brew install gifski`).
//
// Motion notes: movement is deterministic eased travel (ease-in-out cubic along a gentle Bézier
// arc) rather than ghost-cursor-style humanized randomness — premium demos want intentional,
// reproducible motion, not wobble. Targets are anchored off-center so the cursor doesn't cover
// the text being demonstrated, and `park` retires it out of frame between beats.

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
	mouseAt = { ...PARK }
	await page.mouse.move(PARK.x, PARK.y)
}

const type = (page: Page, text: string) => page.keyboard.type(text, { delay: 45 })
const line = async (page: Page, text: string) => {
	await type(page, text)
	await page.keyboard.press('Enter')
}
const setTheme = (page: Page, kind: 'light' | 'dark') =>
	page.evaluate((theme: string) => (window as unknown as { __setTheme: (k: string) => void }).__setTheme(theme), kind)

// ---------- Eased mouse choreography ----------

const PARK = { x: 812, y: 498 }
let mouseAt = { ...PARK }

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** Glide along a gentle quadratic-Bézier arc with cubic easing. Deterministic — no jitter. */
const glide = async (page: Page, x: number, y: number, duration = 700, arc = 0.14) => {
	const from = mouseAt
	const dx = x - from.x
	const dy = y - from.y
	const distance = Math.hypot(dx, dy)
	if (distance < 2) return
	const bend = Math.min(48, distance * arc)
	const control = {
		x: (from.x + x) / 2 + (dy / distance) * bend,
		y: (from.y + y) / 2 - (dx / distance) * bend,
	}
	const frames = Math.min(64, Math.max(14, Math.round(duration / 16)))
	for (let i = 1; i <= frames; i++) {
		const t = easeInOutCubic(i / frames)
		const inverse = 1 - t
		const px = inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * x
		const py = inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * y
		await page.mouse.move(px, py)
		await page.waitForTimeout(Math.max(6, duration / frames - 4))
	}
	mouseAt = { x, y }
}

/** Point within a locator's box — anchored off-center by default so text stays readable. */
const anchorPoint = async (target: Locator, ax = 0.5, ay = 0.55) => {
	const box = await target.boundingBox()
	if (!box) throw new Error(`no bounding box for ${target}`)
	return { x: box.x + box.width * ax, y: box.y + box.height * ay }
}

const glideTo = async (page: Page, target: Locator, ax?: number, ay?: number) => {
	const point = await anchorPoint(target, ax, ay)
	await glide(page, point.x, point.y)
	return point
}
const glideClick = async (page: Page, target: Locator, ax?: number, ay?: number) => {
	await glideTo(page, target, ax, ay)
	await page.waitForTimeout(160)
	await page.mouse.down()
	await page.waitForTimeout(110)
	await page.mouse.up()
}
const glideDblclick = async (page: Page, target: Locator, ax?: number, ay?: number) => {
	const point = await glideTo(page, target, ax, ay)
	await page.waitForTimeout(150)
	await page.mouse.dblclick(point.x, point.y)
}
const clickAt = async (page: Page, x: number, y: number) => {
	await glide(page, x, y)
	await page.waitForTimeout(140)
	await page.mouse.click(x, y)
}
const dragTo = async (page: Page, from: Locator, to: Locator) => {
	await glideTo(page, from, 0.5, 0.5)
	await page.waitForTimeout(200)
	await page.mouse.down()
	await page.waitForTimeout(220)
	const point = await anchorPoint(to, 0.5, 0.5)
	await glide(page, point.x, point.y, 950, 0.06)
	await page.waitForTimeout(220)
	await page.mouse.up()
}
/** Retire the cursor out of the content area so the result is unobstructed. */
const park = async (page: Page) => glide(page, PARK.x, PARK.y, 550, 0.1)

// ---------- Scenarios ----------

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

const SCENARIOS: Scenario[] = [
	{
		name: 'editing',
		doc: '',
		run: async (page) => {
			await page.waitForTimeout(600)
			await line(page, '# Marksmith')
			await page.keyboard.press('Enter')
			await page.waitForTimeout(500)
			await line(page, 'Everything renders **live** — as you _type_.')
			await page.keyboard.press('Enter')
			await page.waitForTimeout(600)
			// Markdown auto-continues list/quote markers on Enter — type the marker once, then just content.
			await line(page, '- [x] Task lists')
			await line(page, 'that render as you go')
			await page.keyboard.press('Enter')
			// One more Enter: the list exit reuses its own line, so this creates the actual blank line
			// that keeps the callout from hugging the list.
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
				await page.waitForTimeout(380)
			}
			await page.keyboard.press('Meta+ArrowDown')
			await page.waitForTimeout(1400)
		},
	},
	{
		name: 'find',
		doc: FIND_DOC,
		run: async (page) => {
			await page.waitForTimeout(800)
			await page.keyboard.press('Meta+f')
			await page.waitForTimeout(500)
			await type(page, 'table')
			await page.waitForTimeout(1000)
			for (let match = 0; match < 3; match++) {
				await page.keyboard.press('Enter')
				await page.waitForTimeout(700)
			}
			await page.keyboard.press('Escape')
			await page.waitForTimeout(1100)
		},
	},
	{
		name: 'tables',
		doc: TABLES_DOC,
		run: async (page) => {
			const cell = (index: number) => page.locator('.md-table td').nth(index)
			await page.waitForTimeout(800)
			// Fill the empty cell. Emoji can't be typed as key events, and the grid enters edit from
			// keydown — so double-click into edit mode, then insertText targets the live cell editor.
			await glideDblclick(page, cell(8), 0.7, 0.62)
			await page.waitForTimeout(420)
			await page.keyboard.insertText('✅')
			await page.keyboard.press('Enter')
			await page.waitForTimeout(750)
			// Add a whole row from the bottom edge bar, tab across it.
			await glideClick(page, page.locator('.md-table-add-row'))
			await page.waitForTimeout(550)
			await glideClick(page, cell(9), 0.72, 0.62)
			await type(page, 'Mermaid')
			await page.keyboard.press('Tab')
			await type(page, 'Mermaid')
			await page.keyboard.press('Tab')
			await glideDblclick(page, cell(11), 0.7, 0.62)
			await page.keyboard.insertText('✅')
			await page.keyboard.press('Enter')
			await park(page)
			await page.waitForTimeout(700)
			// Add a column from the right edge bar (4 columns from here on).
			await glideClick(page, page.locator('.md-table-add-col'))
			await page.waitForTimeout(850)
			// Copy one cell into another: select, ⌘C, select target, ⌘V.
			await glideClick(page, cell(1), 0.72, 0.62)
			await page.keyboard.press('Meta+c')
			await page.waitForTimeout(500)
			await glideClick(page, cell(3), 0.72, 0.62)
			await page.keyboard.press('Meta+v')
			await page.waitForTimeout(850)
			// Drag the Mermaid row up by its handle.
			await glideTo(page, cell(12), 0.3, 0.5)
			await page.waitForTimeout(450)
			await dragTo(page, page.locator('.md-row-handle').last(), cell(4))
			await page.keyboard.press('Escape')
			await park(page)
			await page.waitForTimeout(1300)
		},
	},
	{
		name: 'callouts',
		doc: CALLOUTS_DOC,
		run: async (page) => {
			// Off the heading line so its raw `#` doesn't stay revealed in every frame.
			await page.keyboard.press('ArrowDown')
			await page.waitForTimeout(900)
			// Only fold-marked callouts get a chevron — the warning's is the only one on the page.
			const fold = page.locator('.md-callout-fold').first()
			await glideClick(page, fold, 0.5, 0.5)
			await park(page)
			await page.waitForTimeout(1200)
			await glideClick(page, fold, 0.5, 0.5)
			await park(page)
			await page.waitForTimeout(900)
			// Type a new callout from scratch.
			await page.keyboard.press('Meta+ArrowDown')
			// Blockquotes merge without a blank line between them — separate from the warning above.
			await page.keyboard.press('Enter')
			await page.waitForTimeout(450)
			await line(page, '> [!NOTE] Make your own')
			await line(page, 'custom icons and colors via settings.')
			await page.keyboard.press('Backspace')
			await page.waitForTimeout(900)
			await glideClick(page, fold, 0.5, 0.5)
			await park(page)
			await page.waitForTimeout(1400)
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
			await page.waitForTimeout(1600)
			// Shiki follows the editor theme — flip to light and back.
			await setTheme(page, 'light')
			await page.waitForTimeout(1700)
			await setTheme(page, 'dark')
			await page.waitForTimeout(1500)
		},
	},
	{
		name: 'mermaid',
		doc: '# Diagrams\n\n',
		run: async (page) => {
			await page.keyboard.press('Meta+ArrowDown')
			await page.waitForTimeout(500)
			await line(page, '```mermaid')
			await line(page, 'flowchart LR')
			await line(page, '  Write --> Render --> Edit')
			// Auto-indent carries the leading spaces onto the new line — clear them or the fence won't close.
			await page.keyboard.press('Meta+Backspace')
			await type(page, '```')
			await page.keyboard.press('Enter')
			await page.waitForTimeout(2600)
			// Mermaid re-themes with the editor.
			await setTheme(page, 'light')
			await page.waitForTimeout(1900)
			await setTheme(page, 'dark')
			await page.waitForTimeout(1700)
		},
	},
	{
		name: 'math',
		doc: '# Math\n\nEinstein gave us $E = mc^2$, and Euler gave us:\n\n',
		run: async (page) => {
			await page.keyboard.press('Meta+ArrowDown')
			await page.waitForTimeout(600)
			await line(page, '$$')
			await line(page, 'e^{i\\pi} + 1 = 0')
			await line(page, '$$')
			await page.keyboard.press('Enter')
			await page.waitForTimeout(1300)
			// Hovering the block reveals its tools; Copy SVG lifts the equation out as vector art.
			await glideTo(page, page.locator('.md-math-block'), 0.5, 0.6)
			await page.waitForTimeout(500)
			await glideClick(page, page.locator('.md-math-tools .md-cb-btn'))
			await page.waitForTimeout(900)
			// Click into the equation to reveal its source (still live below), then out to re-render.
			await glideClick(page, page.locator('.md-math-svg'), 0.4, 0.6)
			await page.waitForTimeout(1400)
			await clickAt(page, 440, 470)
			await park(page)
			await page.waitForTimeout(1300)
		},
	},
]

const requested = process.argv.slice(2)
const toRecord = requested.length ? SCENARIOS.filter((s) => requested.includes(s.name)) : SCENARIOS
if (!toRecord.length) throw new Error(`No matching scenarios. Available: ${SCENARIOS.map((s) => s.name).join(', ')}`)

for (const scenario of toRecord) {
	const output = join(media, `${scenario.name}.gif`)
	await recordGif({ width: 880, height: 560, output, fps: 16, quality: 90, pointer: true }, async (page) => {
		await load(page, scenario.doc)
		await scenario.run(page)
	})
	console.log(`gif → ${output}`)
}
