import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as R from 'remeda'
import { z } from 'zod'
import type { Catalog } from '../picker/search'
import type { IconSet } from './icons'
import { byPreference, PackageJson } from './icons'

const LucideTags = z.record(z.string(), z.array(z.string()))

const TablerIcons = z.record(
	z.string(),
	z.object({ name: z.string(), tags: z.array(z.union([z.string(), z.number()])) }),
)

const SimpleIcons = z.array(
	z.object({
		title: z.string(),
		slug: z.string(),
		aliases: z
			.object({ aka: z.array(z.string()).optional(), loc: z.record(z.string(), z.string()).optional() })
			.optional(),
	}),
)

const PhosphorModule = z.object({ icons: z.array(z.object({ name: z.string(), tags: z.array(z.string()) })) })

/** Tag words per concept, from upstream packages too large to install for one metadata file each. */
const TagSnapshot = z.object({
	versions: z.record(z.string(), z.string()),
	generic: z.record(z.string(), z.array(z.string())),
	brand: z.record(z.string(), z.array(z.string())),
})

const snapshotPath = `${import.meta.dir}/tags.json`

/** Qualifiers, not subjects: `md_outline_home`, `pi_house_bold` and `ri_home_line` share the concept `home`, `tb_brand_github` and `io_logo_github` share `github`. */
const qualifierWords = new Set([
	'bold',
	'brand',
	'duotone',
	'fill',
	'filled',
	'light',
	'line',
	'logo',
	'micro',
	'mini',
	'outline',
	'outlined',
	'regular',
	'round',
	'rounded',
	'sharp',
	'social',
	'solid',
	'thin',
	'tone',
	'two',
	'twotone',
])

const words = (text: string) =>
	text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean)

/** Separator-free, so `a-arrow-down` (Lucide), `AArrowDown` and `a_arrow_down` (react-icons) meet. */
const concept = (subject: readonly string[]) => {
	const core = R.dropWhile(
		R.dropLastWhile(subject, (word) => qualifierWords.has(word)),
		(word) => qualifierWords.has(word),
	)
	return (core.length > 0 ? core : subject).join('')
}

const fetchOk = async (url: string) => {
	const response = await fetch(url)
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
	return response
}

const latestFile = async (name: string, file: string) => {
	const { version } = PackageJson.parse(
		await (await fetchOk(`https://cdn.jsdelivr.net/npm/${name}@latest/package.json`)).json(),
	)
	return {
		name,
		version,
		response: await fetchOk(`https://cdn.jsdelivr.net/npm/${name}@${version}/${file}`),
	}
}

/** Rewrites `tags.json` from each upstream's latest release; react-icons ships no tags, and its sets lag upstream, so unmatched names are dropped at lookup. */
export const refreshTags = async () => {
	const generic = new Map<string, Set<string>>()
	/** Kept apart: Simple Icons' `x` is the brand formerly Twitter, Lucide's `x` means close. */
	const brand = new Map<string, Set<string>>()

	const add = (tags: typeof generic, name: string, keywords: readonly string[]) => {
		const key = concept(words(name))
		const known = tags.get(key) ?? new Set()
		for (const keyword of keywords.flatMap(words)) known.add(keyword)
		tags.set(key, known)
	}

	const [lucide, tabler, phosphor, simple] = await Promise.all([
		latestFile('lucide-static', 'tags.json'),
		latestFile('@tabler/icons', 'icons.json'),
		latestFile('@phosphor-icons/core', 'dist/index.mjs'),
		latestFile('simple-icons', 'data/simple-icons.json'),
	])
	const lucideTags = LucideTags.parse(await lucide.response.json())
	const tablerIcons = TablerIcons.parse(await tabler.response.json())
	const simpleIcons = SimpleIcons.parse(await simple.response.json())
	/** Phosphor publishes its tags only as JavaScript; this runs the same file `bun install` would. */
	const phosphorModule = `${await mkdtemp(`${tmpdir()}/phosphor-`)}/index.mjs`
	await Bun.write(phosphorModule, phosphor.response)
	const { icons: phosphorIcons } = PhosphorModule.parse(await import(phosphorModule))

	for (const [name, keywords] of R.entries(lucideTags)) add(generic, name, keywords)
	for (const icon of R.values(tablerIcons)) add(generic, icon.name, icon.tags.map(String))
	// Phosphor marks release status as `*new*` / `*updated*`; those aren't subjects.
	for (const icon of phosphorIcons)
		add(
			generic,
			icon.name,
			icon.tags.filter((tag) => !tag.startsWith('*')),
		)

	for (const icon of simpleIcons) {
		const aliases = [icon.title, ...(icon.aliases?.aka ?? []), ...R.values(icon.aliases?.loc ?? {})]
		for (const name of [icon.slug, ...aliases]) add(brand, name, aliases)
	}

	const record = (tags: typeof generic) =>
		R.fromEntries(R.sortBy([...tags], ([key]) => key).map(([key, known]) => [key, [...known]]))
	const snapshot: z.infer<typeof TagSnapshot> = {
		versions: R.fromEntries([lucide, tabler, phosphor, simple].map(({ name, version }) => [name, version])),
		generic: record(generic),
		brand: record(brand),
	}
	await Bun.write(snapshotPath, `${JSON.stringify(snapshot)}\n`)
	return snapshot.versions
}

/** Picker catalog: each icon's extra search words point into shared groups, since icons of one concept share their tags. */
export const searchCatalog = async (sets: readonly IconSet[]): Promise<Catalog> => {
	const { generic, brand } = TagSnapshot.parse(JSON.parse(await readFile(snapshotPath, 'utf8')))
	const keywordGroups: string[] = []
	const groupOf = new Map<string, number>()

	const group = (setId: string, drawable: string) => {
		const key = concept(drawable.split('_').slice(1))
		const tags = setId === 'si' ? brand[key] : (generic[key] ?? brand[key])
		const nameWords = new Set(drawable.split('_'))
		const keywords = [...(tags ?? [])].filter((word) => !nameWords.has(word)).join(' ')
		if (!keywords) return -1
		const known = groupOf.get(keywords)
		if (known !== undefined) return known
		groupOf.set(keywords, keywordGroups.length)
		keywordGroups.push(keywords)
		return keywordGroups.length - 1
	}

	const catalogSets = byPreference(sets).map(({ id, name, icons }) => ({
		id,
		name,
		icons: icons.map((x) => x.drawable),
		keywords: icons.map((icon) => group(id, icon.drawable)),
	}))
	return { sets: catalogSets, keywordGroups }
}
