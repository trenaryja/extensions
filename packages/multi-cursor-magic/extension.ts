import { format } from 'date-fns'
import * as vscode from 'vscode'
import { monthFormats, parseMonth } from './utils'

export function activate(context: vscode.ExtensionContext) {
  console.log('Multi Cursor Magic is now active!')

  const disposable = vscode.commands.registerCommand('multiCursorMagic.formatMonths', async () => {
    const editor = vscode.window.activeTextEditor
    if (!editor) return vscode.window.showInformationMessage('No editor is active')
    if (editor.selections.length === 0) return vscode.window.showInformationMessage('No selections found')

    const validatedMonths = editor.selections.map((selection) => parseMonth(editor.document.getText(selection)))

    if (validatedMonths.some((month) => month === null))
      return vscode.window.showErrorMessage('One or more selections could not be parsed as a valid month.')

    const userSelectedFormat = await vscode.window.showQuickPick(
      monthFormats.map((monthFormat) => ({ ...monthFormat, description: monthFormat.formatStr })),
      { placeHolder: 'Select a month format' },
    )
    if (!userSelectedFormat) return

    editor.edit((editBuilder) => {
      editor.selections.forEach((selection, index) => {
        const month = validatedMonths[index]
        if (month) editBuilder.replace(selection, format(month, userSelectedFormat.formatStr))
      })
    })
  })

  context.subscriptions.push(disposable)
}

export function deactivate() {}
