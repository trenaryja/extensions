import { $ } from 'bun'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import * as R from 'remeda'
import { reactIconsVersion } from './icons'
import type { IconSet } from './icons'
import { searchCatalog } from './keywords'
import { toPng, toVectorDrawable } from './vector'

const packageDir = `${import.meta.dir}/..`
const buildDir = `${packageDir}/build`
export const apkPath = `${buildDir}/glyphary.apk`

/** Nova's own minSdk; a launcher-only pack gains nothing installing where Nova can't run. */
const minSdk = 26

/** Bump when the APK changes without a react-icons bump; Android refuses updates whose versionCode doesn't rise. */
const revision = 0

const versionCode = () => {
	const [major = 0, minor = 0, patch = 0] = reactIconsVersion.split('.').map(Number)
	return ((major * 100 + minor) * 100 + patch) * 100 + revision
}

const sdkRoot = () => {
	const root = process.env.ANDROID_HOME ?? '/opt/homebrew/share/android-commandlinetools'
	if (!existsSync(`${root}/platforms`))
		throw new Error(
			`No Android SDK at ${root}. Set ANDROID_HOME, or: brew install --cask android-commandlinetools && sdkmanager "build-tools;<latest>" "platforms;android-<latest>"`,
		)
	return root
}

const newest = (dir: string, pattern: RegExp) => {
	const name = R.pipe(
		readdirSync(dir).filter((entry) => pattern.test(entry)),
		R.sortBy((entry) => entry.replace(/\d+/g, (digits) => digits.padStart(4, '0'))),
		R.last(),
	)
	if (!name) throw new Error(`Nothing matching ${pattern} in ${dir}; install it with sdkmanager`)
	return name
}

const toolchain = () => {
	const root = sdkRoot()
	const platform = newest(`${root}/platforms`, /^android-[\d.]+$/)
	const buildTools = `${root}/build-tools/${newest(`${root}/build-tools`, /^[\d.]+$/)}`
	return {
		androidJar: `${root}/platforms/${platform}/android.jar`,
		targetSdk: Number.parseInt(platform.slice('android-'.length), 10),
		buildTools,
	}
}

const signingEnv = () => {
	const { GLYPHARY_KEYSTORE: keystore, GLYPHARY_KEYSTORE_PASSWORD: password } = process.env
	if (!keystore || !password)
		throw new Error('Set GLYPHARY_KEYSTORE (base64 PKCS12) and GLYPHARY_KEYSTORE_PASSWORD; both live in Infisical')
	return { keystore, password }
}

/**
 * The set Nova's tap grid lists, as PNGs; everything else is reached through the picker's search.
 * - Nova decodes grid icons with BitmapFactory: vectors render blank.
 * - Nova parses the whole list before drawing: all 50,939 took over 38 s.
 */
const gridSetId = 'si'

/** Matches PickerActivity.MAX_RESULT_PX, the largest icon either path hands a launcher. */
const gridIconPx = 384

const iconPackXml = (sets: readonly IconSet[]) =>
	[
		'<?xml version="1.0" encoding="utf-8"?>',
		'<resources>',
		...sets.flatMap((set) => [
			`\t<category title="${set.name}" />`,
			...set.icons.map((icon) => `\t<item drawable="${icon.drawable}" />`),
		]),
		'</resources>',
	].join('\n')

const buildPicker = async (sets: readonly IconSet[]) => {
	const outdir = `${buildDir}/assets/picker`
	const result = await Bun.build({ entrypoints: [`${packageDir}/picker/picker.ts`], outdir, minify: true })
	if (!result.success) throw new AggregateError(result.logs, 'picker build failed')
	await $`bunx @tailwindcss/cli -i picker/style.css -o ${outdir}/style.css --minify`.cwd(packageDir).quiet()
	await Bun.write(`${outdir}/index.html`, Bun.file(`${packageDir}/picker/index.html`))
	await Bun.write(`${outdir}/icons.json`, JSON.stringify(await searchCatalog(sets)))
}

/** Plain javac + d8: one Activity needs no Gradle, AndroidX or Kotlin. */
const compileJava = async ({ androidJar, buildTools }: ReturnType<typeof toolchain>) => {
	const classDir = `${buildDir}/classes`
	await $`javac --release 17 -classpath ${androidJar} -d ${classDir} ${await Array.fromAsync(new Bun.Glob(`${packageDir}/android/java/**/*.java`).scan())}`
	await $`${buildTools}/d8 --release --min-api ${minSdk} --lib ${androidJar} --output ${buildDir} ${await Array.fromAsync(new Bun.Glob(`${classDir}/**/*.class`).scan())}`
}

const writeResources = async (sets: readonly IconSet[]) => {
	const res = `${buildDir}/res`
	await rm(buildDir, { recursive: true, force: true })
	await Promise.all(
		['drawable', 'drawable-nodpi', 'xml', '../assets'].map((dir) => mkdir(`${res}/${dir}`, { recursive: true })),
	)
	const drawableXml = iconPackXml(sets.filter((set) => set.id === gridSetId))
	const emptyAppfilter = '<?xml version="1.0" encoding="utf-8"?>\n<resources />'
	await Promise.all([
		...[`${res}/xml`, `${buildDir}/assets`].flatMap((dir) => [
			Bun.write(`${dir}/drawable.xml`, drawableXml),
			Bun.write(`${dir}/appfilter.xml`, emptyAppfilter),
		]),
		...sets.flatMap((set) =>
			set.icons.map(async (icon) =>
				set.id === gridSetId
					? Bun.write(`${res}/drawable-nodpi/${icon.drawable}.png`, toPng(icon.svg, gridIconPx))
					: Bun.write(`${res}/drawable/${icon.drawable}.xml`, await toVectorDrawable(icon.svg)),
			),
		),
	])
}

export const buildApk = async (sets: readonly IconSet[]) => {
	const tools = toolchain()
	const { androidJar, targetSdk, buildTools } = tools
	const { keystore, password } = signingEnv()
	await writeResources(sets)
	await Promise.all([buildPicker(sets), compileJava(tools)])
	await $`${buildTools}/aapt2 compile --dir ${buildDir}/res -o ${buildDir}/compiled.zip`
	await $`${buildTools}/aapt2 compile --dir ${packageDir}/android/res -o ${buildDir}/static.zip`
	await $`${buildTools}/aapt2 link -o ${buildDir}/unaligned.apk -I ${androidJar} --manifest ${packageDir}/android/AndroidManifest.xml -A ${buildDir}/assets --min-sdk-version ${minSdk} --target-sdk-version ${targetSdk} --version-code ${versionCode()} --version-name ${reactIconsVersion} ${buildDir}/compiled.zip ${buildDir}/static.zip`
	await $`zip -j ${buildDir}/unaligned.apk ${buildDir}/classes.dex`.quiet()
	await $`${buildTools}/zipalign -p -f 4 ${buildDir}/unaligned.apk ${apkPath}`
	await Bun.write(`${buildDir}/release.p12`, Buffer.from(keystore, 'base64'))
	await $`${buildTools}/apksigner sign --ks ${buildDir}/release.p12 --ks-pass env:GLYPHARY_KEYSTORE_PASSWORD ${apkPath}`.env(
		{ ...process.env, GLYPHARY_KEYSTORE_PASSWORD: password },
	)
	await rm(`${buildDir}/release.p12`)
	return { apkPath, targetSdk, versionCode: versionCode(), versionName: reactIconsVersion }
}
