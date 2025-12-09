import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext) {
	console.log('Extension activated!')

	// This must exactly match the command in package.json
	const disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World!')
	})

	context.subscriptions.push(disposable)
}

export function deactivate() {}
