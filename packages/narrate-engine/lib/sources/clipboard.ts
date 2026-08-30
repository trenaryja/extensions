import type { Source, SourceText } from '../types'

export const clipboardSource = (): Source => ({
	origin: 'clipboard',
	resolve: async (): Promise<SourceText> => {
		const proc = Bun.spawn(['pbpaste'], { stdout: 'pipe', stderr: 'pipe' })
		const [text, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
		if (exitCode !== 0) throw new Error(`pbpaste exited with code ${exitCode}`)
		return { text, label: 'clipboard', origin: 'clipboard' }
	},
})
