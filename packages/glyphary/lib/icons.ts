import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { IconsManifest } from 'react-icons/lib'
import * as R from 'remeda'
import { z } from 'zod'

type IconTree = { tag: string; attr: Record<string, string>; child: IconTree[] }

const IconTree: z.ZodType<IconTree> = z.lazy(() =>
	z.object({ tag: z.string(), attr: z.record(z.string(), z.string()), child: z.array(IconTree) }),
)

export const PackageJson = z.object({ version: z.string() })

export type Icon = { set: string; drawable: string; svg: string }
export type IconSet = { id: string; name: string; icons: Icon[] }

const reactIconsDir = dirname(createRequire(import.meta.url).resolve('react-icons/package.json'))

export const { version: reactIconsVersion } = PackageJson.parse(
	JSON.parse(readFileSync(`${reactIconsDir}/package.json`, 'utf8')),
)

/** IconBase injects these on the root `<svg>`; Ionicons 5 outlines and Grommet inherit stroke color from them and render invisible without. */
const rootDefaults = { stroke: 'currentColor', fill: 'currentColor', strokeWidth: '0' }

/** Genuinely camelCase in SVG; every other camelCase key is React's spelling of a kebab-case attribute. */
const camelAttributes = new Set([
	'baseProfile',
	'filterUnits',
	'gradientTransform',
	'gradientUnits',
	'stdDeviation',
	'viewBox',
])

const kebab = (name: string) =>
	camelAttributes.has(name) ? name : name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

const renderNode = ({ tag, attr, child }: IconTree): string => {
	const attributes = R.entries(attr)
		.map(([key, value]) => ` ${kebab(key)}="${value}"`)
		.join('')
	return `<${tag}${attributes}>${child.map(renderNode).join('')}</${tag}>`
}

/** Root paint moves onto a wrapping `<g>`: svg2vectordrawable ignores stroke attributes on `<svg>` and draws stroke icons as filled blobs. */
const renderSvg = ({ attr, child }: IconTree) => {
	const { viewBox = '', ...paint }: Record<string, string> = { ...rootDefaults, ...attr }
	return renderNode({ tag: 'svg', attr: { viewBox }, child: [{ tag: 'g', attr: paint, child }] })
}

/** `FaGithub` in fa6 -> `fa6_github`; drawable names must be `[a-z0-9_]` and fa/fa6 share the `Fa` prefix. */
const drawableName = (set: string, exportName: string) => {
	const prefix = set.replace(/\d+$/, '')
	const words = exportName
		.slice(prefix.length)
		.replaceAll(/([a-z0-9])([A-Z])|([a-zA-Z])(\d)/g, '$1$3_$2$4')
		.replaceAll(/([A-Z])([A-Z][a-z])/g, '$1_$2')
		.toLowerCase()
	return `${set}_${words}`
}

const exportPattern = /^module\.exports\.(\w+) = function[^\n]*\n\s*return GenIcon\((.*)\)\(props\);$/gm

/** Alphabetical: react-icons ships some sets (Simple Icons) Z to A, which is how Nova's grid would list them. */
const loadSet = (id: string) =>
	R.sortBy(
		readFileSync(`${reactIconsDir}/${id}/index.js`, 'utf8')
			.matchAll(exportPattern)
			.map(([, exportName = '', tree = '']) => ({
				set: id,
				drawable: drawableName(id, exportName),
				svg: renderSvg(IconTree.parse(JSON.parse(tree))),
			}))
			.toArray(),
		(icon) => icon.drawable,
	)

/** Most consistent, broadest sets first: search ties and app matching go to the earlier set; the rest keep manifest order. */
const setPreference: readonly string[] = ['tb', 'lu', 'pi', 'si']

export const byPreference = <T extends { id: string }>(sets: readonly T[]) =>
	R.sortBy(sets, (set) => (setPreference.includes(set.id) ? setPreference.indexOf(set.id) : setPreference.length))

export const loadIconSets = (): IconSet[] => {
	const sets = IconsManifest.map(({ id, name }) => ({ id, name, icons: loadSet(id) }))
	const duplicates = R.pipe(
		sets.flatMap((set) => set.icons),
		R.groupBy((icon) => icon.drawable),
		R.values(),
		R.filter((group) => group.length > 1),
	)
	if (duplicates.length)
		throw new Error(`Drawable name collisions: ${duplicates.map((group) => group[0].drawable).join(', ')}`)
	return sets
}
