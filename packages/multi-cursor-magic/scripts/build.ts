import * as esbuild from 'esbuild'

const shared = {
	entryPoints: ['./src/extension.ts'],
	bundle: true,
	external: ['vscode'],
	format: 'cjs',
	treeShaking: true,
	logOverride: { 'direct-eval': 'silent' },
} satisfies esbuild.BuildOptions

async function build() {
	try {
		const [nodeResult] = await Promise.all([
			esbuild.build({ ...shared, outfile: 'dist/extension.js', platform: 'node', sourcemap: false, minify: true, metafile: true }),
			esbuild.build({ ...shared, outfile: 'dist/web/extension.js', platform: 'browser', sourcemap: false, minify: true }),
		])

		if (nodeResult.metafile) {
			const outfileSize = nodeResult.metafile.outputs['dist/extension.js']?.bytes ?? 0
			console.log(`Bundle size: ${(outfileSize / 1024).toFixed(2)} KB`)

			if (process.argv.includes('--analyze')) {
				const analysis = await esbuild.analyzeMetafile(nodeResult.metafile)
				console.log(analysis)
			}
		}

		console.log('Build completed successfully!')
	} catch (error) {
		console.error('Build failed:', error)
		process.exit(1)
	}
}

// Check for watch mode
if (process.argv.includes('--watch')) {
	console.log('Starting watch mode...')

	esbuild
		.context({
			entryPoints: ['./src/extension.ts'],
			bundle: true,
			outfile: 'dist/extension.js',
			external: ['vscode'],
			format: 'cjs',
			platform: 'node',
			sourcemap: true,
			logOverride: {
				'direct-eval': 'silent',
			},
		})
		.then((context) => {
			context.watch()
			console.log('Watching for changes...')
		})
} else {
	build()
}
