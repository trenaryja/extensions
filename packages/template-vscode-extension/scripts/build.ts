import { extensionConfig, runBuilds, webExtensionConfig } from '@repo/vscode-utils/build'

const watch = process.argv.includes('--watch')
const mode = watch ? 'development' : 'production'

runBuilds([extensionConfig({ mode, entry: './extension.ts' }), webExtensionConfig({ mode, entry: './extension.ts' })], {
	watch,
}).catch((error: unknown) => {
	console.error(error)
	process.exit(1)
})
