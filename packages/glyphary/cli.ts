import { $ } from 'bun'
import * as R from 'remeda'
import { apkPath, buildApk, signingKey } from './lib/android'
import { loadIconSets } from './lib/icons'
import { refreshTags } from './lib/keywords'

const verbs = {
	build: async () => {
		const sets = loadIconSets()
		const result = await buildApk(sets)
		console.log(
			`${result.apkPath}: ${sets.reduce((sum, set) => sum + set.icons.length, 0)} icons, v${result.versionName} (${result.versionCode}), target ${result.targetSdk}${result.signed ? '' : ', unsigned'}`,
		)
	},
	/** Commit the rewritten lib/tags.json; builds read only the snapshot. */
	tags: async () => console.log(await refreshTags()),
	/** Pick the phone with ANDROID_SERIAL when more than one is attached. */
	install: async () => {
		if (!signingKey())
			throw new Error(
				"Set GLYPHARY_KEYSTORE (base64 PKCS12) and GLYPHARY_KEYSTORE_PASSWORD from Infisical's workstation project: Android installs only signed APKs",
			)
		await verbs.build()
		await $`adb install -r ${apkPath}`
	},
}

const verb = R.keys(verbs).find((name) => name === process.argv[2])

if (!verb) {
	console.error(`usage: bun cli.ts <${R.keys(verbs).join('|')}>`)
	process.exit(1)
}

await verbs[verb]()
