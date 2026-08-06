import { registerCommands } from '@repo/vscode-utils'
import type * as vscode from 'vscode'
import { commands } from './contributes'
import { registerMarksmithEditor } from './editorProvider'

export const activate = (context: vscode.ExtensionContext) => {
	context.subscriptions.push(registerMarksmithEditor(context))
	registerCommands(context, commands)
}

export const deactivate = () => {}
