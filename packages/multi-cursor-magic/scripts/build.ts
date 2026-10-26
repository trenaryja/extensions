import { extensionConfig, runBuilds, webExtensionConfig } from '@repo/vscode-utils/build'

const watch = process.argv.includes('--watch')
const mode = watch ? 'development' : 'production'
const analyze = process.argv.includes('--analyze')

runBuilds([extensionConfig({ mode }), webExtensionConfig({ mode })], { watch, analyze }).catch((error: unknown) => {
	console.error(error)
	process.exit(1)
})
