import { execFileSync, spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extensionConfig, runBuilds, webExtensionConfig, webviewConfig } from '@repo/vscode-utils/build'

const watch = process.argv.includes('--watch')
const mode = watch ? 'development' : 'production'
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

// Compile the Tailwind + daisyUI stylesheet to a static, CSP-safe CSS file linked into the webview.
const cssArgs = ['@tailwindcss/cli', '-i', 'src/webview/styles.css', '-o', 'dist/webview.css']
if (watch) spawn('bunx', [...cssArgs, '--watch'], { cwd: pkgRoot, stdio: 'inherit' })
else execFileSync('bunx', [...cssArgs, '--minify'], { cwd: pkgRoot, stdio: 'inherit' })

runBuilds([extensionConfig({ mode }), webExtensionConfig({ mode }), webviewConfig({ mode })], { watch }).catch(
	(err: unknown) => {
		console.error(err)
		process.exit(1)
	},
)
