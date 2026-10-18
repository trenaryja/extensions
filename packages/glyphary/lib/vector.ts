import { readFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import svg2vectordrawable from 'svg2vectordrawable'

/**
 * Longest side of the visible glyph as a share of the canvas.
 * - Measured: median over 5,623 Flight icons (alpha bbox / canvas); p25 0.562, p75 0.649.
 */
export const glyphExtent = 0.604

/** `currentColor` stands in for the glyph color until it becomes a resource reference. */
const placeholder = '#ff00ff'

/** resvg otherwise scans system fonts on every construction: 190ms per icon vs 0.04ms. */
const noFonts = { font: { loadSystemFonts: false } }

const resvg = (svg: string, options?: ConstructorParameters<typeof Resvg>[1]) =>
	new Resvg(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), { ...noFonts, ...options })

/** Centers the visible glyph (stroke included) at `glyphExtent`; a translate, because svg2vectordrawable drops the viewBox origin. */
const fitGlyph = (svg: string) => {
	const [, viewBox = ''] = /viewBox="([^"]+)"/.exec(svg) ?? []
	const [viewX = 0, viewY = 0, viewW = 0, viewH = 0] = viewBox
		.trim()
		.split(/[\s,]+/)
		.map(Number)
	const bounds = resvg(svg).innerBBox() ?? {
		x: viewX,
		y: viewY,
		width: viewW,
		height: viewH,
	}
	const side = Math.max(bounds.width, bounds.height) / glyphExtent
	const dx = (side - bounds.width) / 2 - bounds.x
	const dy = (side - bounds.height) / 2 - bounds.y
	return svg
		.replace(
			/viewBox="[^"]+">/,
			`viewBox="0 0 ${side} ${side}" width="${side}" height="${side}"><g transform="translate(${dx} ${dy})">`,
		)
		.replace(/<\/svg>$/, '</g></svg>')
}

/** aapt2 string pool limit; si_composer and si_elsevier exceed it at 3 decimals and fit at 1. */
const maxPathLength = 32767

const convert = async (svg: string, floatPrecision = 3): Promise<string> => {
	const xml = await svg2vectordrawable(svg, { floatPrecision })
	const fits = [...xml.matchAll(/pathData="([^"]*)"/g)].every(([, path = '']) => path.length <= maxPathLength)
	if (fits) return xml
	if (floatPrecision === 0) throw new Error('pathData exceeds the aapt2 string limit even at 0 decimals')
	return convert(svg, floatPrecision - 1)
}

export const toVectorDrawable = async (svg: string) => {
	const xml = await convert(fitGlyph(svg).replaceAll('currentColor', placeholder))
	return xml
		.replace(/android:width="[^"]+"/, 'android:width="192dp"')
		.replace(/android:height="[^"]+"/, 'android:height="192dp"')
		.replaceAll(new RegExp(`"#(?:ff)?${placeholder.slice(1)}"`, 'gi'), '"@color/glyph"')
}

const glyphColor = /name="glyph">([^<]+)</.exec(
	readFileSync(`${import.meta.dir}/../android/res/values/colors.xml`, 'utf8'),
)?.[1]

/** For launchers that decode drawables with BitmapFactory, which can't read vectors. */
export const toPng = (svg: string, px: number) => {
	if (!glyphColor) throw new Error('android/res/values/colors.xml has no glyph color')
	return resvg(fitGlyph(svg).replaceAll('currentColor', glyphColor), { fitTo: { mode: 'width', value: px } })
		.render()
		.asPng()
}
