import * as vscode from 'vscode'

/**
 * The partial rendered as an `after` decoration on a zero-width range at each cursor. A decoration is
 * not document text: whisper revising "recognize speech" into "wreck a nice beach" replaces it with no
 * retraction, no undo entry, and nothing to corrupt if the document changes underneath.
 */
export const createGhost = () => {
	const type = vscode.window.createTextEditorDecorationType({
		after: { color: new vscode.ThemeColor('editorGhostText.foreground'), fontStyle: 'italic' },
	})

	let shown: vscode.TextEditor | undefined

	const clear = () => {
		shown?.setDecorations(type, [])
		shown = undefined
	}

	/** False when there is no editor to decorate — the caller previews in the status bar instead. */
	const show = (text: string) => {
		const editor = vscode.window.activeTextEditor
		// Focus can move mid-utterance, and the editor we decorated keeps the decoration until told.
		if (editor !== shown) clear()
		if (!editor) return false

		shown = editor
		editor.setDecorations(
			type,
			editor.selections.map((selection) => ({
				range: new vscode.Range(selection.active, selection.active),
				renderOptions: { after: { contentText: text } },
			})),
		)
		return true
	}

	return {
		show,
		clear,
		dispose: () => {
			clear()
			type.dispose()
		},
	}
}
