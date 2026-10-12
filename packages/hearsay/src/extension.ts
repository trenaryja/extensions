import type * as vscode from 'vscode'
import { registerCommands } from '@repo/vscode-utils'
import { commands } from './commands'
import { session } from './session'

export const activate = (context: vscode.ExtensionContext) => {
	registerCommands(context, commands)
	session(context)
}
