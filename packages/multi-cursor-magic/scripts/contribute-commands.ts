import { promises as fs } from 'fs'
import moduleAlias from 'module-alias'
import * as path from 'path'

moduleAlias.addAlias('vscode', path.join(__dirname, 'fake-vscode'))

async function main() {
  const { commands } = await import('../src/commands')
  const packageJsonPath = path.join(__dirname, '..', 'package.json')

  const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8')
  const packageJson = JSON.parse(packageJsonContent)

  const updatedCommands = Object.entries(commands).map(([title, { command }]) => ({ title, command }))

  packageJson.contributes = packageJson.contributes || {}
  packageJson.contributes.commands = updatedCommands

  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8')

  console.log(`Updated contributes.commands in package.json at ${packageJsonPath}`)
}

main().catch((error) => {
  console.error('Error updating contributes.commands in package.json:', error)
  process.exit(1)
})
