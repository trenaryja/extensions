import { extensionConfig, runBuilds, webExtensionConfig } from '@repo/vscode-utils/build'

const watch = process.argv.includes('--watch')
const mode = watch ? 'development' : 'production'

await runBuilds(
	[extensionConfig({ mode, entry: './extension.ts' }), webExtensionConfig({ mode, entry: './extension.ts' })],
	{
		watch,
	},
)
