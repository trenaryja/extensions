# Template VS Code Extension

## Development Workflow

1.  Start the extension in watch mode:

    ```bash
    pnpm dev
    ```

2.  Launch the extension in debug mode: In VS Code, press `F5` to start debugging the extension (This launches an Extension Development Host window).

3.  **Important:** For changes to take effect, you **MUST** reload the Extension Development Host window (`Ctrl+R` or `Cmd+R`) after making changes.

## Key Configuration

- **Command Matching**: Ensure the `command` value in `package.json`'s `contributes.commands` array matches exactly the string passed to `vscode.commands.registerCommand` in your `extension.ts` file.

  ```json
  // package.json
  "contributes": {
      "commands": [{
          "command": "extension.yourCommand",
          "title": "Your Command"
      }]
  }
  ```

  ```typescript
  // extension.ts
  vscode.commands.registerCommand('extension.yourCommand', () => {
    vscode.window.showInformationMessage('Command executed!')
  })
  ```

## Useful Resources

- [VS Code Extension API Documentation](https://code.visualstudio.com/api/references/vscode-api)
- [VS Code Extension Guide](https://code.visualstudio.com/api)
- [VS Code Debugging](https://code.visualstudio.com/docs/editor/debugging)
