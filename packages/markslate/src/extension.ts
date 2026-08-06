import { registerCommands } from '@repo/vscode-utils'
import type * as vscode from 'vscode'
import { commands } from './contributes'
import { registerMarkSlateEditor } from './editorProvider'

export const activate = (context: vscode.ExtensionContext) => {
	context.subscriptions.push(registerMarkSlateEditor(context))
	registerCommands(context, commands)
}

export const deactivate = () => {}
