import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPage } from '@repo/vscode-utils/headless'

// The M§ seal — the complete anatomy. Unit M = the cap height of the M; every dimension is a ratio
// of M. Rebuildable from this comment alone:
//
//   glyphs   Baskerville Bold `M` and `§`, each scaled so its measured ink height equals M
//            (canvas actualBoundingBox — position by ink box, never font metrics), sharing one
//            ink band centered on the tile; gap between ink boxes −M/44
//   tile     square, side 2.5M, corner radius 0.6M
//   rings    stroke M/16 — solid at r 1.1M; dashed at r 0.95M, dashes M/20 on an M/5 period,
//            round caps
//   fit      the pair's bounding circle (hypot(pairWidth, inkBand)/2) must stay ≤ 0.85M: the pair
//            is laid out at a nominal ink band of M, then uniformly scaled down (band, widths, and
//            gap together) until the rule holds — the script throws if the invariant still fails
//   color    Tailwind stone, oklch — dark ground: disc 950, glyph 50, ring 600
//            (light ground, unused here: disc 100, glyph 950, ring 400)
//   output   assets/icon.png, 512 × 512, transparent corners
//
//   bun scripts/icon.ts

const here = dirname(fileURLToPath(import.meta.url))
const target = join(here, '..', 'assets', 'icon.png')

await withPage({ width: 600, height: 600 }, async (page) => {
	await page.setContent('<body style="margin:0"><div id="icon"></div></body>')

	await page.evaluate(async () => {
		await document.fonts.ready
		const M = 44
		const VIEW = 128
		const C = VIEW / 2
		const GAP = -M / 44
		const FONT = 'Baskerville, serif'
		const WEIGHT = 700
		const STONE = {
			50: 'oklch(98.5% 0.001 106.423)',
			600: 'oklch(44.4% 0.011 73.639)',
			950: 'oklch(14.7% 0.004 49.25)',
		}

		const canvas = document.createElement('canvas')
		const ctx = canvas.getContext('2d')!
		const SAMPLE = 100

		const measure = (glyph: string) => {
			ctx.font = `${WEIGHT} ${SAMPLE}px ${FONT}`
			const m = ctx.measureText(glyph)
			return { A: m.actualBoundingBoxAscent, D: m.actualBoundingBoxDescent, W: m.width }
		}

		const mm = measure('M')
		const ss = measure('§')

		const layout = (band: number, gap: number) => {
			const scaleM = band / (mm.A + mm.D)
			const scaleS = band / (ss.A + ss.D)
			const widthM = mm.W * scaleM
			const widthS = ss.W * scaleS
			return { scaleM, scaleS, widthM, widthS, gap, band, pairWidth: widthM + gap + widthS }
		}

		const radius = (l: ReturnType<typeof layout>) => Math.hypot(l.pairWidth, l.band) / 2
		const scale = Math.min(1, (0.85 * M) / radius(layout(M, GAP)))
		const l = layout(M * scale, GAP * scale)
		if (radius(l) > 0.85 * M + 1e-6) throw new Error('spec violation: pair exceeds 0.85M clearance')

		const left = C - l.pairWidth / 2
		const top = C - l.band / 2
		const glyphs = [
			{ ch: 'M', x: left + l.widthM / 2, y: top + mm.A * l.scaleM, fs: SAMPLE * l.scaleM },
			{ ch: '§', x: left + l.widthM + l.gap + l.widthS / 2, y: top + ss.A * l.scaleS, fs: SAMPLE * l.scaleS },
		]
		const texts = glyphs
			.map(
				(t) =>
					`<text x="${t.x.toFixed(2)}" y="${t.y.toFixed(2)}" text-anchor="middle" style="font-family:${FONT};font-weight:${WEIGHT};font-size:${t.fs.toFixed(2)}px" fill="${STONE[50]}">${t.ch}</text>`,
			)
			.join('')
		document.getElementById('icon')!.innerHTML =
			`<svg viewBox="0 0 ${VIEW} ${VIEW}" width="512" height="512" xmlns="http://www.w3.org/2000/svg">
			<rect x="${C - 1.25 * M}" y="${C - 1.25 * M}" width="${2.5 * M}" height="${2.5 * M}" rx="${0.6 * M}" fill="${STONE[950]}"/>
			<circle cx="${C}" cy="${C}" r="${1.1 * M}" fill="none" stroke="${STONE[600]}" stroke-width="${M / 16}"/>
			<circle cx="${C}" cy="${C}" r="${0.95 * M}" fill="none" stroke="${STONE[600]}" stroke-width="${M / 16}" stroke-dasharray="${M / 20} ${(3 * M) / 20}" stroke-linecap="round"/>
			${texts}</svg>`
	})

	const svg = await page.$('#icon svg')
	mkdirSync(dirname(target), { recursive: true })
	await svg!.screenshot({ path: target, omitBackground: true })
})
console.log(`icon → ${target}`)
