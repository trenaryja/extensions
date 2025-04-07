import * as R from 'remeda'
import * as vscode from 'vscode'
import { commands } from './commands'

export function activate(context: vscode.ExtensionContext) {
  console.log('Multi Cursor Magic is now active!')

  R.pipe(
    commands,
    R.values(),
    R.forEach(({ command, callback }) => {
      context.subscriptions.push(vscode.commands.registerCommand(command, callback))
    }),
  )
}
