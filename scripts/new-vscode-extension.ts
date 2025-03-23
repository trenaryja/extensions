import { confirm, input } from '@inquirer/prompts'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as R from 'remeda'

async function main() {
  // Prompt for extension name in Title Case
  const extensionNameTitleCase = await input({
    message: 'What is the name of your extension? (Title Case, e.g., "My Extension")',
    validate: (input: string) => {
      if (!input.trim()) return 'Extension name cannot be empty'
      return true
    },
  })

  const extensionNameKebabCase = R.toKebabCase(extensionNameTitleCase)

  // Validate the kebab case name
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(extensionNameKebabCase)) {
    console.error(
      'Error: Generated kebab-case name is invalid. Please use a name that translates to a valid kebab-case format.',
    )
    process.exit(1)
  }

  console.log(`Using name: ${extensionNameTitleCase} (${extensionNameKebabCase})`)

  // Create the extension directory
  const extensionDir = path.join(process.cwd(), 'packages', extensionNameKebabCase)
  if (fs.existsSync(extensionDir)) {
    const overwrite = await confirm({
      message: `Directory packages/${extensionNameKebabCase} already exists. Overwrite?`,
      default: false,
    })

    if (!overwrite) {
      console.log('Operation cancelled.')
      return
    }

    fs.rmSync(extensionDir, { recursive: true, force: true })
  }
  fs.mkdirSync(extensionDir, { recursive: true })

  const tempDir = path.join(process.cwd(), 'temp_vscode_clone')
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })

  try {
    execSync(`git clone --depth 1 https://github.com/microsoft/vscode-extension-samples.git "${tempDir}"`, {
      stdio: 'inherit',
    })

    const sampleDir = path.join(tempDir, 'helloworld-minimal-sample')
    if (!fs.existsSync(sampleDir)) throw new Error(`Sample directory not found: ${sampleDir}`)

    // Only copy specific files
    const filesToCopy = ['package.json', 'extension.js', 'README.md']
    for (const file of filesToCopy) {
      const srcPath = path.join(sampleDir, file)
      const destPath = path.join(extensionDir, file)

      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath)
      } else {
        console.warn(`Warning: File ${file} not found in the sample directory`)
      }
    }

    // Update package.json with the new extension name
    const packageJsonPath = path.join(extensionDir, 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    packageJson.name = extensionNameKebabCase
    packageJson.displayName = extensionNameTitleCase
    packageJson.description = `${extensionNameTitleCase} VSCode Extension`
    packageJson.publisher = 'trenaryja'
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))

    // Add entry to .vscode/launch.json
    const vscodeDir = path.join(process.cwd(), '.vscode')
    if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir, { recursive: true })

    const launchJsonPath = path.join(vscodeDir, 'launch.json')
    let launchJson: any = { version: '0.2.0', configurations: [] }

    if (fs.existsSync(launchJsonPath)) {
      try {
        launchJson = JSON.parse(fs.readFileSync(launchJsonPath, 'utf8'))
      } catch (error) {
        console.warn(`Warning: Could not parse existing launch.json: ${error.message}`)
      }
    }

    // Add the new configuration
    const newConfig = {
      name: `${extensionNameTitleCase} Extension`,
      type: 'extensionHost',
      request: 'launch',
      runtimeExecutable: '${execPath}',
      args: [`--extensionDevelopmentPath=\${workspaceFolder}/packages/${extensionNameKebabCase}`],
    }

    // Ensure configurations array exists
    if (!launchJson.configurations) launchJson.configurations = []

    // Check if configuration already exists
    const configExists = launchJson.configurations.some((config: any) => config.name === newConfig.name)

    if (!configExists) {
      launchJson.configurations.push(newConfig)
      fs.writeFileSync(launchJsonPath, JSON.stringify(launchJson, null, 2))
      console.log(`✅ Added launch configuration for ${extensionNameTitleCase}`)
    } else {
      console.log(`ℹ️ Launch configuration for ${extensionNameTitleCase} already exists`)
    }

    console.log(
      `✅ VSCode extension '${extensionNameTitleCase}' successfully created in packages/${extensionNameKebabCase}!`,
    )
  } catch (error) {
    console.error(`❌ Error creating extension: ${error.message}`)
    process.exit(1)
  } finally {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
