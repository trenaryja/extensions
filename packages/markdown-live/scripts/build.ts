import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

const sharedConfig = {
	bundle: true,
	minify: !watch,
	sourcemap: watch,
	treeShaking: true,
	metafile: true,
} satisfies Partial<esbuild.BuildOptions>

const extensionConfig: esbuild.BuildOptions = {
	...sharedConfig,
	entryPoints: ['./src/extension.ts'],
	outfile: 'dist/extension.js',
	external: ['vscode'],
	format: 'cjs',
	platform: 'node',
}

const webviewConfig: esbuild.BuildOptions = {
	...sharedConfig,
	entryPoints: ['./src/webview/index.tsx'],
	outfile: 'dist/webview.js',
	format: 'iife',
	platform: 'browser',
	define: {
		'process.env.NODE_ENV': watch ? '"development"' : '"production"',
	},
}

function logSize(label: string, metafile: esbuild.Metafile, outfile: string) {
	const bytes = metafile.outputs[outfile]?.bytes ?? 0
	console.log(`${label}: ${(bytes / 1024).toFixed(2)} KB`)
}

async function main() {
	if (watch) {
		console.log('Starting watch mode...')
		const [extCtx, webCtx] = await Promise.all([esbuild.context(extensionConfig), esbuild.context(webviewConfig)])
		await Promise.all([extCtx.watch(), webCtx.watch()])
		console.log('Watching for changes...')
	} else {
		const [extResult, webResult] = await Promise.all([esbuild.build(extensionConfig), esbuild.build(webviewConfig)])
		if (extResult.metafile) logSize('extension.js', extResult.metafile, 'dist/extension.js')
		if (webResult.metafile) logSize('webview.js', webResult.metafile, 'dist/webview.js')
		console.log('Build complete.')
	}
}

main().catch((err: unknown) => {
	console.error(err)
	process.exit(1)
})
