import { setting } from '@repo/vscode-utils/config'
import { z } from 'zod'
import { CODICON_ICONS } from './codicons.data'

// Suggest every codicon as a `$(name)` value in settings.json (⌘Space), while still accepting any string
// (emoji / raw <svg>). The permissive branch keeps those valid; VS Code offers the enum from the other branch.
const iconField = z.union([z.enum(CODICON_ICONS), z.string()]).optional()

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
		z.record(z.string(), z.object({ icon: iconField, color: z.string().optional() })).default({}),
		{
			markdownDescription:
				'Override callout icons/colors or add custom types. Each entry is `{ "icon"?: …, "color"?: … }`. An `icon` can be an emoji, a `$(codicon)` name (e.g. `$(bell)`), or a raw `<svg>`. Omit `icon` to keep the built-in and only change the color. A `"default"` entry sets the fallback icon for any unlisted type.',
			scope: 'window',
		},
	),
})

export type Config = z.infer<typeof configSchema>
