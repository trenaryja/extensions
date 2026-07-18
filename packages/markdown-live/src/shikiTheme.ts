import * as vscode from 'vscode'

type ThemeJson = {
	name?: string
	type?: string
	include?: string
	colors?: Record<string, string>
	tokenColors?: unknown[]
}

// VS Code theme files are usually JSON but occasionally JSONC — try strict parse, then a best-effort strip.
const parseJsonc = (text: string): ThemeJson | null => {
	try {
		return JSON.parse(text)
	} catch {
		try {
			const stripped = text
				.replace(/\/\*[\s\S]*?\*\//g, '')
				.replace(/(^|[^:])\/\/.*$/gm, '$1')
				.replace(/,(\s*[}\]])/g, '$1')
			return JSON.parse(stripped)
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
		colors: { ...(resolvedBase.colors ?? {}), ...(theme.colors ?? {}) },
		tokenColors: [...(resolvedBase.tokenColors ?? []), ...(theme.tokenColors ?? [])],
	}
}

/**
 * Resolve the user's ACTIVE VS Code color theme to a Shiki-loadable theme object, by reading the theme
 * JSON from its contributing extension (built-in or marketplace) and resolving any `include` chain.
 * Returns null on any failure so the webview falls back to dark-plus/light-plus. Reads the theme's
 * TextMate token colors only — it does NOT capture `editor.tokenColorCustomizations` or semantic tokens.
 */
export const resolveActiveShikiTheme = async (): Promise<ThemeJson | null> => {
	const label = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme')
	if (!label) return null

	for (const extension of vscode.extensions.all) {
		const themes = extension.packageJSON?.contributes?.themes as
			| Array<{ label?: string; id?: string; path: string }>
			| undefined
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
