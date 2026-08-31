import * as esbuild from 'esbuild'

type Mode = 'production' | 'development'

export type ExtensionBuildOptions = {
	mode: Mode
	entry?: string
	outfile?: string
	extraConfig?: Partial<esbuild.BuildOptions>
}

const logOverride: esbuild.BuildOptions['logOverride'] = { 'direct-eval': 'silent' }

export function extensionConfig({
	mode,
	entry = './src/extension.ts',
	outfile = 'dist/extension.js',
	extraConfig,
}: ExtensionBuildOptions): esbuild.BuildOptions {
	const dev = mode === 'development'
	return {
		entryPoints: [entry],
		outfile,
		bundle: true,
		external: ['vscode'],
		format: 'cjs',
		platform: 'node',
		sourcemap: dev,
		minify: !dev,
		treeShaking: true,
		metafile: true,
		logOverride,
		...extraConfig,
	}
}

export function webExtensionConfig(opts: ExtensionBuildOptions): esbuild.BuildOptions {
	const outfile = opts.outfile ?? 'dist/web/extension.js'
	return { ...extensionConfig(opts), outfile, platform: 'browser' }
}

export function webviewConfig({
	mode,
	entry = './src/webview/index.ts',
	outfile = 'dist/webview.js',
	extraConfig,
}: ExtensionBuildOptions): esbuild.BuildOptions {
	const dev = mode === 'development'
	return {
		entryPoints: [entry],
		outfile,
		bundle: true,
		format: 'iife',
		platform: 'browser',
		sourcemap: dev,
		minify: !dev,
		treeShaking: true,
		metafile: true,
		define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
		...extraConfig,
	}
}

export type RunOptions = {
	watch?: boolean
	analyze?: boolean
}

export async function runBuilds(
	configs: esbuild.BuildOptions[],
	{ watch = false, analyze = false }: RunOptions = {},
): Promise<void> {
	if (watch) {
		console.log('Starting watch mode...')
		const contexts = await Promise.all(configs.map((c) => esbuild.context(c)))
		await Promise.all(contexts.map((ctx) => ctx.watch()))
		console.log('Watching for changes...')
		return
	}

	const results = await Promise.all(configs.map((c) => esbuild.build(c)))

	for (const result of results) {
		if (!result.metafile) continue

		for (const [file, { bytes }] of Object.entries(result.metafile.outputs)) {
			if (!file.endsWith('.js')) continue
			console.log(`${file}: ${(bytes / 1024).toFixed(2)} KB`)
		}

		if (analyze) console.log(await esbuild.analyzeMetafile(result.metafile))
	}

	console.log('Build complete.')
}
