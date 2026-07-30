// A swappable "formatter profile": produces the markdown a user's own tooling would, so that editing a table
// here and then running their formatter is a no-op. Prettier is the only markdown table formatter today (biome
// doesn't format markdown yet), and its table output is config-independent, so a bundled prettier is byte-for-byte
// what the user's prettier would produce regardless of their config. When biome ships a markdown formatter this
// gains a second profile and the active one is chosen from config.
import markdownPlugin from 'prettier/plugins/markdown'
import * as prettier from 'prettier/standalone'

export type FormatterProfile = {
	name: string
	// Normalize a standalone GFM table fragment; returns it without a trailing newline (it slots back into a range).
	formatTable: (markdown: string) => Promise<string>
}

const prettierProfile: FormatterProfile = {
	name: 'prettier',
	formatTable: async (markdown) => {
		const out = await prettier.format(markdown, { parser: 'markdown', plugins: [markdownPlugin] })
		return out.replace(/\n+$/, '')
	},
}

export const formatterProfile: FormatterProfile = prettierProfile
