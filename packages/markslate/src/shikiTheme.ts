import * as vscode from 'vscode'
import { z } from 'zod'

// Loose: the theme goes to Shiki whole, so keys read only there must survive. VS Code lets a color be null.
const ThemeJson = z.looseObject({
	name: z.string().optional(),
	type: z.string().optional(),
	include: z.string().optional(),
	colors: z.record(z.string(), z.string().nullable()).optional(),
	tokenColors: z.array(z.unknown()).optional(),
})
type ThemeJson = z.infer<typeof ThemeJson>

const ThemeContributions = z.object({
	contributes: z
		.object({
			themes: z
				.array(z.object({ label: z.string().optional(), id: z.string().optional(), path: z.string() }))
				.optional(),
		})
		.optional(),
})

// VS Code theme files are usually JSON but occasionally JSONC — try strict parse, then a best-effort strip.
const parseJsonc = (text: string) => {
	try {
		return ThemeJson.safeParse(JSON.parse(text)).data ?? null
	} catch {
		try {
			const stripped = text
				.replaceAll(/\/\*[\s\S]*?\*\//g, '')
				.replaceAll(/(^|[^:])\/\/.*$/gm, '$1')
				.replaceAll(/,(\s*[}\]])/g, '$1')
			return ThemeJson.safeParse(JSON.parse(stripped)).data ?? null
		} catch {
			return null
		}
	}
}

const readTheme = async (uri: vscode.Uri): Promise<ThemeJson | null> => {
	try {
		return parseJsonc(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)))
	} catch {
		return null
	}
}

// A theme may `include` a base theme; merge base first so the current theme overrides it.
const resolveIncludes = async (uri: vscode.Uri, theme: ThemeJson, depth = 0): Promise<ThemeJson> => {
	if (!theme.include || depth > 8) return theme
	const baseUri = vscode.Uri.joinPath(uri, '..', theme.include)
	const base = await readTheme(baseUri)
	if (!base) return theme
	const resolvedBase = await resolveIncludes(baseUri, base, depth + 1)
	return {
		...resolvedBase,
		...theme,
		colors: { ...resolvedBase.colors, ...theme.colors },
		tokenColors: [...(resolvedBase.tokenColors ?? []), ...(theme.tokenColors ?? [])],
	}
}

/**
 * Resolve the user's ACTIVE VS Code color theme to a Shiki-loadable theme object, by reading the theme
 * JSON from its contributing extension (built-in or marketplace) and resolving any `include` chain.
 * Returns null on any failure so the webview falls back to dark-plus/light-plus. Reads the theme's
 * TextMate token colors only — it does NOT capture `editor.tokenColorCustomizations` or semantic tokens.
 */
const resolveByLabel = async (label: string): Promise<ThemeJson | null> => {
	for (const extension of vscode.extensions.all) {
		const themes = ThemeContributions.safeParse(extension.packageJSON).data?.contributes?.themes
		const match = themes?.find((theme) => theme.label === label || theme.id === label)
		if (!match) continue

		const uri = vscode.Uri.joinPath(extension.extensionUri, match.path)
		const theme = await readTheme(uri)
		if (!theme) return null
		const resolved = await resolveIncludes(uri, theme)
		resolved.name = label // stable name for Shiki to register/select
		return resolved
	}

	return null
}

/**
 * Resolve a Shiki theme, preferring the `name` the webview observed (its live `data-vscode-theme-name`,
 * which tracks theme *previews* too) and falling back to the persisted `workbench.colorTheme` setting.
 * Returns null on any failure, so the webview falls back to dark-plus/light-plus.
 */
export const resolveShikiThemeByName = async (name: string): Promise<ThemeJson | null> => {
	const configName = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme') ?? ''

	for (const candidate of [name, configName])
		if (candidate) {
			const resolved = await resolveByLabel(candidate)
			if (resolved) return resolved
		}

	return null
}
