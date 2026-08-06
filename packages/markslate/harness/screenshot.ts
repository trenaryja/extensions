import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPage } from '@repo/vscode-utils/headless'

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

await withPage({ width: 900, height: 1000, deviceScaleFactor: 2 }, async (page) => {
	page.on('pageerror', (error) => console.error('[pageerror]', error.message))
	await page.addInitScript((markdown: string) => {
		;(window as unknown as { HARNESS_CONTENT: string }).HARNESS_CONTENT = markdown
	}, content)
	await page.goto(`file://${join(here, 'index.html')}`)
	await page.waitForSelector('.cm-content', { timeout: 15000 })
	await page.waitForTimeout(1500) // let Shiki / mermaid / math finish rendering

	mkdirSync(dirname(outputPng), { recursive: true })
	await page.screenshot({ path: outputPng, fullPage: true })
})
console.log(`screenshot → ${outputPng}  (from ${markdownFile})`)
