import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extensionConfig, runBuilds, webExtensionConfig, webviewConfig } from '@repo/vscode-utils/build'

const watch = process.argv.includes('--watch')
const mode = watch ? 'development' : 'production'
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(pkgRoot, 'dist'), { recursive: true })

// Inline the VS Code codicon font into a static CSS file so callout icons render CSP-safely (font-src data:).
const codiconDir = join(dirname(createRequire(import.meta.url).resolve('@vscode/codicons/package.json')), 'dist')
const codiconFont = readFileSync(join(codiconDir, 'codicon.ttf')).toString('base64')
const codiconCss = readFileSync(join(codiconDir, 'codicon.css'), 'utf8').replace(
	/url\("\.\/codicon\.ttf[^"]*"\)/,
	`url(data:font/ttf;base64,${codiconFont})`,
)
writeFileSync(join(pkgRoot, 'dist/codicon.css'), codiconCss)

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
