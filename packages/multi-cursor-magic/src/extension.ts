import type * as vscode from 'vscode'

import { registerCommands } from '@repo/vscode-utils'

import { commands } from './commands'

export const activate = (context: vscode.ExtensionContext) => {
	console.log('Multi-Cursor Magic is now active!')
	registerCommands(context, commands)
}
