import type { Source, SourceText } from '../types'

export const stdinSource = (): Source => ({
	origin: 'stdin',
	resolve: async (): Promise<SourceText> => ({
		text: await Bun.stdin.text(),
		label: 'stdin',
		origin: 'stdin',
	}),
})
