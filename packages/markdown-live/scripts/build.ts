import { extensionConfig, runBuilds, webviewConfig } from '@repo/vscode-utils/build'

const watch = process.argv.includes('--watch')
const mode = watch ? 'development' : 'production'

runBuilds([extensionConfig({ mode }), webviewConfig({ mode })], { watch }).catch((err: unknown) => {
	console.error(err)
	process.exit(1)
})
