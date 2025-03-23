import { confirm, input } from '@inquirer/prompts'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as prettier from 'prettier'
import * as R from 'remeda'

// Format a file with prettier
const formatFile = async (filePath: string): Promise<void> => {
  try {
    // Read the file
    const content = fs.readFileSync(filePath, 'utf8')

    // Read the package.json to get the prettier config
    const rootPackageJsonPath = path.join(process.cwd(), 'package.json')
    const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'))
    const prettierConfig = rootPackageJson.prettier || {}

    // Format the content
    const formatted = await prettier.format(content, {
      ...prettierConfig,
      filepath: filePath, // This helps prettier determine the parser based on file extension
    })

    // Write the formatted content back
    fs.writeFileSync(filePath, formatted)
  } catch (error) {
    console.warn(`Warning: Could not format file ${filePath}: ${error.message}`)
  }
}

const copyFiles = (source: string, destination: string) => {
  const entries = fs.readdirSync(source, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(source, entry.name)
    const destPath = path.join(destination, entry.name)

    // Skip node_modules and git directories
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
      continue
    }

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true })
      copyFiles(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

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

  try {
    // Path to template extension
    const templateDir = path.join(process.cwd(), 'packages', 'template-vscode-extension')
    if (!fs.existsSync(templateDir)) throw new Error(`Template directory not found: ${templateDir}`)

    // Copy all files from template
    copyFiles(templateDir, extensionDir)

    // List of files to format
    const filesToFormat: string[] = []

    // Update package.json
    const packageJsonPath = path.join(extensionDir, 'package.json')
    if (!fs.existsSync(packageJsonPath)) throw new Error(`package.json not found in template`)
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    packageJson.name = extensionNameKebabCase
    packageJson.displayName = extensionNameTitleCase
    packageJson.description = `${extensionNameTitleCase} VSCode Extension`
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
    filesToFormat.push(packageJsonPath)

    // Update extension.ts to reference the new extension name
    const extensionTsPath = path.join(extensionDir, 'extension.ts')
    if (fs.existsSync(extensionTsPath)) {
      let extensionTs = fs.readFileSync(extensionTsPath, 'utf8')
      extensionTs = extensionTs.replace(
        /Congratulations, your extension "[^"]+" is now active!/g,
        `Congratulations, your extension "${extensionNameKebabCase}" is now active!`,
      )
      fs.writeFileSync(extensionTsPath, extensionTs)
      filesToFormat.push(extensionTsPath)
    }

    // Add entry to .vscode/launch.json
    const vscodeDir = path.join(process.cwd(), '.vscode')
    if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir, { recursive: true })
    const launchJsonPath = path.join(vscodeDir, 'launch.json')
    let launchJson = { version: '0.2.0', configurations: [] as { name: string }[] }

    if (fs.existsSync(launchJsonPath)) {
      try {
        launchJson = JSON.parse(fs.readFileSync(launchJsonPath, 'utf8'))
      } catch (error) {
        console.warn(`Warning: Could not parse existing launch.json: ${error.message}`)
      }
    }

    // Add the new configuration
    const newConfig = {
      name: `Ext: ${extensionNameTitleCase}`,
      type: 'extensionHost',
      request: 'launch',
      runtimeExecutable: '${execPath}',
      args: [`--extensionDevelopmentPath=\${workspaceFolder}/packages/${extensionNameKebabCase}`],
    }

    // Ensure configurations array exists
    if (!launchJson.configurations) launchJson.configurations = []

    // Check if configuration already exists
    const configExists = launchJson.configurations.some((config) => config.name === newConfig.name)

    if (!configExists) {
      launchJson.configurations.push(newConfig)
      fs.writeFileSync(launchJsonPath, JSON.stringify(launchJson, null, 2))
      filesToFormat.push(launchJsonPath)
      console.log(`✅ Added launch configuration for ${extensionNameTitleCase}`)
    } else {
      console.log(`ℹ️ Launch configuration for ${extensionNameTitleCase} already exists`)
    }

    // Format all modified files with prettier
    console.log(`🎨 Formatting generated files...`)
    await Promise.all(filesToFormat.map(formatFile))

    console.log(
      `✅ VSCode extension '${extensionNameTitleCase}' successfully created in packages/${extensionNameKebabCase}!`,
    )

    // Run pnpm install in the new extension directory
    console.log(`📦 Installing dependencies...`)
    try {
      execSync('pnpm install', {
        cwd: extensionDir,
        stdio: 'inherit', // Show the output in the console
      })
      console.log(`✅ Dependencies installed successfully!`)
    } catch (error) {
      console.error(`⚠️ Failed to install dependencies. You may need to run 'pnpm install' manually.`)
      console.error(error)
    }

    // Final instructions
    console.log(`\n🚀 Next steps:`)
    console.log(`  1. cd packages/${extensionNameKebabCase}`)
    console.log(`  2. pnpm dev`)
    console.log(`  3. Press F5 to start debugging your extension`)
  } catch (error) {
    console.error(`❌ Error creating extension: ${error.message}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
