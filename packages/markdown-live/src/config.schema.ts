import { setting } from '@repo/vscode-utils/config'
import { z } from 'zod'

/** Single source of truth for Markdown Live settings — generates `contributes.configuration` and the typed accessor. */
export const configSchema = z.object({
	'markdownLive.mermaidRenderMode': setting(z.enum(['inline', 'below', 'disabled']).default('inline'), {
		markdownDescription:
			'How Mermaid diagrams are rendered. `inline` replaces the code block with the diagram, `below` shows the diagram beneath the source, `disabled` leaves the code block as-is.',
		enumDescriptions: [
			'Replace the code block with the rendered diagram',
			'Show the diagram below the source',
			'Leave the code block as-is',
		],
		scope: 'window',
	}),
})

export type Config = z.infer<typeof configSchema>
