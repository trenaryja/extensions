import { setting } from '@repo/vscode-utils/config'
import { z } from 'zod'
import { DEFAULT_CALLOUTS } from './callouts.data'

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
	'markdownLive.callouts': setting(
		z.record(z.string(), z.object({ icon: z.string(), color: z.string().optional() })).default(DEFAULT_CALLOUTS),
		{
			markdownDescription:
				'Callout types mapped to `{ "icon": …, "color"?: … }`. `icon` can be an emoji, a `$(codicon)` name (e.g. `$(bell)`), or a raw `<svg>` string. Add your own types here — unknown callout types fall back to a default icon.',
			scope: 'window',
		},
	),
})

export type Config = z.infer<typeof configSchema>
