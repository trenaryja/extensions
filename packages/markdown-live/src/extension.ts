import { registerCommands } from '@repo/vscode-utils'
import type * as vscode from 'vscode'
import { commands } from './contributes'
import { registerMarkdownLiveEditor } from './editorProvider'

export const activate = (context: vscode.ExtensionContext) => {
	context.subscriptions.push(registerMarkdownLiveEditor(context))
	registerCommands(context, commands)
}

export const deactivate = () => {}
