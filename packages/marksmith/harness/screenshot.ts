import { Glob } from 'bun'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

// Render a markdown file through the real webview bundle in headless Chromium and screenshot it — so the
// editor's visuals (decorations, scroll, callouts, code, math) can be verified without opening VS Code.
//
//   bun run harness [markdownFile] [outputPng]
//
// Defaults to ../assets/playground.md → harness/out/harness.png. Requires `bun run build` first (loads dist/).

const here = dirname(fileURLToPath(import.meta.url))
const markdownFile = resolve(process.argv[2] ?? join(here, '..', 'assets', 'playground.md'))
const outputPng = resolve(process.argv[3] ?? join(here, 'out', 'harness.png'))
const content = readFileSync(markdownFile, 'utf8')

// Reuse whatever Chromium `playwright install` cached (no per-project browser download).
function findChromium() {
	const cache = join(process.env.HOME ?? '', 'Library/Caches/ms-playwright')
	const binary = 'chromium_headless_shell-*/**/chrome-headless-shell'
	const found = [...new Glob(binary).scanSync(cache)].sort().at(-1)
	if (!found) throw new Error('No cached Playwright Chromium found. Run: bunx playwright install chromium')
	return join(cache, found)
}

const browser = await chromium.launch({ executablePath: findChromium(), headless: true })
const page = await browser.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 })
page.on('pageerror', (error) => console.error('[pageerror]', error.message))
await page.addInitScript((markdown) => {
	;(window as unknown as { HARNESS_CONTENT: string }).HARNESS_CONTENT = markdown
}, content)
await page.goto(`file://${join(here, 'index.html')}`)
await page.waitForSelector('.cm-content', { timeout: 15000 })
await page.waitForTimeout(1500) // let Shiki / mermaid / math finish rendering

mkdirSync(dirname(outputPng), { recursive: true })
await page.screenshot({ path: outputPng, fullPage: true })
await browser.close()
console.log(`screenshot → ${outputPng}  (from ${markdownFile})`)
