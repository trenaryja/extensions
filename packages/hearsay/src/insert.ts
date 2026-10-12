import * as vscode from 'vscode'
import type { Focus } from './commands'

/** Utterances arrive one at a time with no separator, so the gap between them has to be made here. */
const spaced = (editor: vscode.TextEditor, selection: vscode.Selection, text: string) => {
	if (!selection.isEmpty || selection.active.character === 0) return text
	const before = editor.document.getText(new vscode.Range(selection.active.translate(0, -1), selection.active))
	return /\s/.test(before) ? text : ` ${text}`
}

/**
 * `focus` is where the recording started; without it the text goes to the editor. Returns undefined when
 * there is nowhere to put it, so the caller can hand the text back some other way.
 * `continuing` marks every utterance after a recording's first, which neither the terminal nor `type` can detect.
 */
export const insert = async (text: string, continuing = false, focus?: Focus) => {
	const joined = continuing ? ` ${text}` : text

	// `type` lands in whichever editor widget has focus, and does nothing in the terminal.
	if (focus === 'input') {
		await vscode.commands.executeCommand('type', { text: joined })
		return 'input'
	}

	const terminal = vscode.window.activeTerminal

	if (focus === 'terminal' && terminal) {
		terminal.sendText(joined, false)
		return 'terminal'
	}

	const editor = vscode.window.activeTextEditor
	if (!editor) return undefined
	// One edit for every cursor, so a multi-cursor selection is replaced everywhere in a single undo step.
	await editor.edit((builder) => {
		for (const selection of editor.selections) builder.replace(selection, spaced(editor, selection, text))
	})
	return 'editor'
}
