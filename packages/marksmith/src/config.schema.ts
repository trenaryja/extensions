import { setting } from '@repo/vscode-utils/config'
import { z } from 'zod'
import { CODICON_ICONS } from './codicons.data'

// Suggest every codicon as a `$(name)` value in settings.json (⌘Space), while still accepting any string
// (emoji / raw <svg>). The permissive branch keeps those valid; VS Code offers the enum from the other branch.
const iconField = z.union([z.enum(CODICON_ICONS), z.string()]).optional()

/** Single source of truth for Marksmith settings — generates `contributes.configuration` and the typed accessor. */
export const configSchema = z.object({
	'marksmith.mermaidRenderMode': setting(z.enum(['inline', 'below', 'disabled']).default('inline'), {
		markdownDescription:
			'How Mermaid diagrams are rendered. `inline` replaces the code block with the diagram, `below` shows the diagram beneath the source, `disabled` leaves the code block as-is.',
		enumDescriptions: [
			'Replace the code block with the rendered diagram',
			'Show the diagram below the source',
			'Leave the code block as-is',
		],
		scope: 'window',
	}),
	'marksmith.callouts': setting(
		z.record(z.string(), z.object({ icon: iconField, color: z.string().optional() })).default({}),
		{
			markdownDescription:
				'Override callout icons/colors or add custom types. Each entry is `{ "icon"?: …, "color"?: … }`. An `icon` can be an emoji, a `$(codicon)` name (e.g. `$(bell)`), or a raw `<svg>`. Omit `icon` to keep the built-in and only change the color. A `"default"` entry sets the fallback icon for any unlisted type.',
			scope: 'window',
		},
	),
	'marksmith.calloutDefaultTitle': setting(z.boolean().default(true), {
		markdownDescription:
			'Show the callout type as the heading when no custom title is given — e.g. `> [!note]` renders a **Note** title (matches Obsidian). Turn off to show only the icon.',
		scope: 'window',
	}),
	'marksmith.mathExportColor': setting(z.string().default('currentColor'), {
		markdownDescription:
			'Color baked into an exported/copied math SVG. `currentColor` (default) inherits the color at the paste target; `theme` bakes your editor foreground; or use any CSS color (e.g. `#1a1a1a`, `black`). Live in-editor math always uses your theme foreground.',
		scope: 'window',
	}),
	'marksmith.formatTablesOnEdit': setting(z.boolean().default(true), {
		markdownDescription:
			'Pretty-align a table (pad its columns to equal widths) when you leave its raw source after editing it — like Prettier’s format-on-save, but only for tables. Turn off to keep your hand-tuned spacing.',
		scope: 'window',
	}),
})

export type Config = z.infer<typeof configSchema>
