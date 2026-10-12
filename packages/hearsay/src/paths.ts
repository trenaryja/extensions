import type * as vscode from 'vscode'

/**
 * Where every recording lands. Its own file, not `recordings.ts`, because `commands.ts` names the folder
 * and the contributes codegen imports that module — so nothing it reaches may import `vscode` for real.
 */
export const recordingsDir = (code: typeof vscode, context: vscode.ExtensionContext) =>
	code.Uri.joinPath(context.globalStorageUri, 'recordings')
