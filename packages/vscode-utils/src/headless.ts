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
		// Headless contexts deny navigator.clipboard by default; pages that copy shouldn't silently fail.
		await page
			.context()
			.grantPermissions(['clipboard-read', 'clipboard-write'])
			.catch(() => {})
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
	/** Input visualization: a visible cursor, click ripples, and a keystroke HUD for shortcuts. */
	pointer?: boolean
}

// Input visualization: headless Chromium renders no pointer, so mouse-driven demos read as
// telekinesis without one. A soft cursor follows pointer events (capture phase, so app handlers
// can't hide it), presses shrink it and emit an expanding ripple, and modifier chords (plus
// Tab/Escape) surface as a bottom-center keystroke pill — plain typing stays silent.
const POINTER_OVERLAY = `(() => {
	const ready = () => {
		const style = document.createElement('style')
		style.textContent =
			'@keyframes __hlripple{from{transform:translate(-50%,-50%) scale(.4);opacity:.85}to{transform:translate(-50%,-50%) scale(2.6);opacity:0}}' +
			'@keyframes __hlpill{0%{opacity:0;transform:translate(-50%,6px) scale(.94)}12%{opacity:1;transform:translate(-50%,0) scale(1)}78%{opacity:1}100%{opacity:0;transform:translate(-50%,0) scale(1)}}'
		document.head.appendChild(style)

		const dot = document.createElement('div')
		dot.style.cssText =
			'position:fixed;top:0;left:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;' +
			'background:rgba(140,140,150,.32);border:1.5px solid rgba(255,255,255,.95);' +
			'box-shadow:0 0 0 1px rgba(0,0,0,.45),0 2px 6px rgba(0,0,0,.4);' +
			'z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .18s,scale .12s ease-out'
		document.body.appendChild(dot)
		let last = { x: 0, y: 0 }
		const place = (x, y) => {
			last = { x, y }
			dot.style.transform = 'translate(' + x + 'px,' + y + 'px)'
			dot.style.opacity = '1'
		}
		document.addEventListener('pointermove', (e) => place(e.clientX, e.clientY), true)
		document.addEventListener('pointerdown', (e) => {
			place(e.clientX, e.clientY)
			dot.style.scale = '0.72'
			const ripple = document.createElement('div')
			ripple.style.cssText =
				'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;width:34px;height:34px;border-radius:50%;' +
				'border:2px solid rgba(255,255,255,.9);box-shadow:0 0 0 1px rgba(0,0,0,.35);' +
				'z-index:2147483646;pointer-events:none;animation:__hlripple .5s ease-out forwards'
			document.body.appendChild(ripple)
			ripple.addEventListener('animationend', () => ripple.remove())
		}, true)
		document.addEventListener('pointerup', (e) => {
			dot.style.scale = '1'
			place(e.clientX, e.clientY)
		}, true)

		const KEY_LABELS = {
			Escape: 'esc', Tab: 'tab', Backspace: '\\u232B', Enter: '\\u21A9',
			ArrowUp: '\\u2191', ArrowDown: '\\u2193', ArrowLeft: '\\u2190', ArrowRight: '\\u2192',
		}
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift') return
			const chorded = e.metaKey || e.ctrlKey || e.altKey
			if (!chorded && e.key !== 'Tab' && e.key !== 'Escape') return
			let label = ''
			if (e.ctrlKey) label += '\\u2303'
			if (e.altKey) label += '\\u2325'
			if (e.shiftKey && chorded) label += '\\u21E7'
			if (e.metaKey) label += '\\u2318'
			label += KEY_LABELS[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key)
			const pill = document.createElement('div')
			pill.textContent = label
			pill.style.cssText =
				'position:fixed;bottom:30px;left:50%;padding:8px 14px;border-radius:9px;' +
				'background:rgba(22,22,28,.88);color:#fff;border:1px solid rgba(255,255,255,.22);' +
				'font:600 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;' +
				'box-shadow:0 4px 14px rgba(0,0,0,.4);z-index:2147483647;pointer-events:none;' +
				'animation:__hlpill 1.3s ease forwards'
			document.body.appendChild(pill)
			pill.addEventListener('animationend', () => pill.remove())
		}, true)
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
