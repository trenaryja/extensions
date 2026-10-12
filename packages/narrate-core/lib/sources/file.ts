import { basename } from 'node:path'
import type { Source, SourceText } from '../types'

export const fileSource = (path: string): Source => ({
	origin: 'file',
	resolve: async (): Promise<SourceText> => ({
		text: await Bun.file(path).text(),
		label: basename(path),
		origin: 'file',
	}),
})
