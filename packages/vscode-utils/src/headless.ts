import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright-core'

// Headless Chromium for extension tooling — screenshots, icon rendering, demo recording.
// Reuses whatever Chromium `playwright install` cached (no per-project browser download).
// playwright-core is intentionally a devDependency here and in each consumer: only packages
// that render headless should carry it.

export function findChromium() {
	const cache = join(process.env.HOME ?? '', 'Library/Caches/ms-playwright')
	const shells = readdirSync(cache, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium_headless_shell-'))
		.map((entry) => entry.name)
		.sort()
	const newest = shells[shells.length - 1]
	if (!newest) throw new Error('No cached Playwright Chromium found. Run: bunx playwright install chromium')
	const binary = readdirSync(join(cache, newest), { recursive: true })
		.map(String)
		.find((path) => path.endsWith('chrome-headless-shell'))
	if (!binary) throw new Error(`No chrome-headless-shell binary under ${join(cache, newest)}`)
	return join(cache, newest, binary)
}

export type HeadlessPageOptions = {
	width?: number
	height?: number
	deviceScaleFactor?: number
	/** Record a .webm of the session into this directory (Playwright names the file). */
	recordVideo?: { dir: string; size?: { width: number; height: number } }
}

/** Launch cached headless Chromium, hand a page to `run`, and always clean up. */
export async function withPage<T>(options: HeadlessPageOptions, run: (page: Page) => Promise<T>) {
	const { width = 900, height = 700, deviceScaleFactor = 1, recordVideo } = options
	const browser = await chromium.launch({ executablePath: findChromium(), headless: true })
	try {
		const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor, recordVideo })
		return await run(page)
	} finally {
		await browser.close()
	}
}
