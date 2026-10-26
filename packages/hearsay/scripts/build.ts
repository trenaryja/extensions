import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NATIVE_BINARY } from '@repo/hearsay-core'
import { extensionConfig, runBuilds } from '@repo/vscode-utils/build'

const watch = process.argv.includes('--watch')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const built = join(root, '../hearsay-core/native/target/release', NATIVE_BINARY)

// A VSIX carries the helper for exactly one platform; phase 7's CI matrix is what makes this path vary.
if (!existsSync(built)) {
	console.error(`Missing ${built} — run 'bun run build' in packages/hearsay-core first.`)
	process.exit(1)
}

mkdirSync(join(root, 'assets'), { recursive: true })
copyFileSync(built, join(root, 'assets', NATIVE_BINARY))

runBuilds([extensionConfig({ mode: watch ? 'development' : 'production' })], { watch }).catch((error: unknown) => {
	console.error(error)
	process.exit(1)
})
