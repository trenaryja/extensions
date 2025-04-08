import * as esbuild from 'esbuild'

async function build() {
  try {
    const result = await esbuild.build({
      entryPoints: ['./src/extension.ts'],
      bundle: true,
      outfile: 'dist/extension.js',
      external: ['vscode'],
      format: 'cjs',
      platform: 'node',
      sourcemap: false,
      treeShaking: true,
      minify: true,
      metafile: true,
      logOverride: {
        'direct-eval': 'silent',
      },
    })

    // Log bundle size information
    if (result.metafile) {
      const outfileSize = result.metafile.outputs['dist/extension.js']?.bytes ?? 0
      console.log(`Bundle size: ${(outfileSize / 1024).toFixed(2)} KB`)

      // Optionally analyze the bundle in detail
      if (process.argv.includes('--analyze')) {
        const analysis = await esbuild.analyzeMetafile(result.metafile)
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
