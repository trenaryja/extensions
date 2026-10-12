import * as vscode from 'vscode'
import { getConfig } from './config'
import { recordingsDir } from './paths'

/** `sv` formats as ISO in local time, matching the output channel's stamps; `:` is illegal on Windows. */
const stamp = () => new Date().toLocaleString('sv').replace(' ', 'T').replaceAll(':', '-')

/** Creates the folder on the way, so the helper never has to. */
export const nextRecording = async (context: vscode.ExtensionContext) => {
	const dir = recordingsDir(vscode, context)
	await vscode.workspace.fs.createDirectory(dir)
	return vscode.Uri.joinPath(dir, `${stamp()}.wav`).fsPath
}

/** Run after a recording, never before: a keep of 0 would otherwise delete the one just made. */
export const pruneRecordings = async (context: vscode.ExtensionContext) => {
	const dir = recordingsDir(vscode, context)
	const entries = await vscode.workspace.fs.readDirectory(dir)
	// Not `slice(0, -keep)`: a keep of 0 makes that `slice(0, -0)`, which is `slice(0, 0)` and keeps everything.
	const names = entries.map(([name]) => name).sort()
	for (const name of names.slice(0, names.length - getConfig('hearsay.keepRecordings')))
		await vscode.workspace.fs.delete(vscode.Uri.joinPath(dir, name))
}
