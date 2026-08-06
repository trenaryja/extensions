import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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

export type RecordGifOptions = Omit<HeadlessPageOptions, 'recordVideo'> & {
	/** Destination .gif path (directories are created). */
	output: string
	/** GIF frame rate — editor demos read well at 12–16. */
	fps?: number
	/** Scale the GIF to this width; defaults to the capture width. */
	gifWidth?: number
	/** gifski quality, 1–100. */
	quality?: number
	/** Render a visible cursor that follows the mouse (headless Chromium draws none). */
	pointer?: boolean
}

// A fake cursor: headless Chromium renders no pointer, so mouse-driven demos read as telekinesis
// without one. Follows pointer events (capture phase, so app handlers can't hide it) and shrinks
// while a button is down.
const POINTER_OVERLAY = `(() => {
	const ready = () => {
		const dot = document.createElement('div')
		dot.style.cssText = 'position:fixed;top:0;left:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,255,255,.35);border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.7);z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .15s'
		document.body.appendChild(dot)
		let scale = 1
		const place = (x, y) => {
			dot.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')'
			dot.style.opacity = '1'
		}
		document.addEventListener('pointermove', (e) => place(e.clientX, e.clientY), true)
		document.addEventListener('pointerdown', (e) => { scale = 0.7; place(e.clientX, e.clientY) }, true)
		document.addEventListener('pointerup', (e) => { scale = 1; place(e.clientX, e.clientY) }, true)
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready)
	else ready()
})()`

/**
 * Record a page session and encode it as a GIF: Playwright's recordVideo captures a webm, gifski
 * (per-frame palettes, temporal dithering — `brew install gifski`) encodes it. Returns the output path.
 */
export async function recordGif(options: RecordGifOptions, run: (page: Page) => Promise<void>) {
	const { output, fps = 14, gifWidth, quality = 80, pointer, ...pageOptions } = options
	const { width = 900, height = 700 } = pageOptions
	const captureDir = mkdtempSync(join(tmpdir(), 'headless-record-'))
	try {
		let videoPath: string | undefined
		// Without an explicit size, Playwright scales the video to fit 800×800 — and may switch frame
		// properties mid-stream, which gifski's decoder can reject.
		await withPage({ ...pageOptions, recordVideo: { dir: captureDir, size: { width, height } } }, async (page) => {
			if (pointer) await page.addInitScript(POINTER_OVERLAY)
			await run(page)
			videoPath = await page.video()?.path()
			// Videos are only guaranteed written after the CONTEXT closes — browser.close() alone can
			// truncate the webm mid-write.
			await page.context().close()
		})
		if (!videoPath) throw new Error('recordGif: no video captured')
		mkdirSync(dirname(output), { recursive: true })
		const args = ['--fps', String(fps), '--quality', String(quality)]
		if (gifWidth) args.push('--width', String(gifWidth))
		const result = spawnSync('gifski', [...args, '-o', output, videoPath], { stdio: 'inherit' })
		if (result.error || result.status !== 0)
			throw new Error(
				`recordGif: gifski failed (${result.error?.message ?? `exit ${result.status}`}) — brew install gifski`,
			)
		return output
	} finally {
		rmSync(captureDir, { recursive: true, force: true })
	}
}
