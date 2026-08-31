import { confirm, input } from '@inquirer/prompts'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as R from 'remeda'
import { copyFiles, formatFile, toMessage } from './utils'

// Null when the directory already exists and the user declines to overwrite it.
const prepareDirectory = async (extensionDir: string, kebabName: string) => {
	if (fs.existsSync(extensionDir)) {
		const overwrite = await confirm({
			message: `Directory packages/${kebabName} already exists. Overwrite?`,
			default: false,
		})

		if (!overwrite) return null
		fs.rmSync(extensionDir, { recursive: true, force: true })
	}

	fs.mkdirSync(extensionDir, { recursive: true })
	const templateDir = path.join(process.cwd(), 'packages', 'template-vscode-extension')
	if (!fs.existsSync(templateDir)) throw new Error(`Template directory not found: ${templateDir}`)
	copyFiles(templateDir, extensionDir)
	return extensionDir
}

const writePackageJson = (extensionDir: string, titleCaseName: string, kebabName: string) => {
	const packageJsonPath = path.join(extensionDir, 'package.json')
	if (!fs.existsSync(packageJsonPath)) throw new Error(`package.json not found in template`)
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
	packageJson.name = kebabName
	packageJson.displayName = titleCaseName
	packageJson.description = `${titleCaseName} VSCode Extension`
	fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
	return packageJsonPath
}

const nameExtensionSource = (extensionDir: string, kebabName: string) => {
	const extensionTsPath = path.join(extensionDir, 'extension.ts')
	if (!fs.existsSync(extensionTsPath)) return null
	const source = fs.readFileSync(extensionTsPath, 'utf8')
	const named = source.replace(
		/Congratulations, your extension "[^"]+" is now active!/g,
		`Congratulations, your extension "${kebabName}" is now active!`,
	)
	fs.writeFileSync(extensionTsPath, named)
	return extensionTsPath
}

const addLaunchConfig = (titleCaseName: string, kebabName: string) => {
	const vscodeDir = path.join(process.cwd(), '.vscode')
	if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir, { recursive: true })
	const launchJsonPath = path.join(vscodeDir, 'launch.json')
	let launchJson = { version: '0.2.0', configurations: [] as { name: string }[] }

	if (fs.existsSync(launchJsonPath)) {
		try {
			launchJson = JSON.parse(fs.readFileSync(launchJsonPath, 'utf8'))
		} catch (error) {
			console.warn(`Warning: Could not parse existing launch.json: ${toMessage(error)}`)
		}
	}

	const newConfig = {
		name: `Ext: ${titleCaseName}`,
		type: 'extensionHost',
		request: 'launch',
		runtimeExecutable: '${execPath}',
		args: [`--extensionDevelopmentPath=\${workspaceFolder}/packages/${kebabName}`],
	}

	if (!launchJson.configurations) launchJson.configurations = []

	if (launchJson.configurations.some((config) => config.name === newConfig.name)) {
		console.log(`ℹ️ Launch configuration for ${titleCaseName} already exists`)
		return null
	}

	launchJson.configurations.push(newConfig)
	fs.writeFileSync(launchJsonPath, JSON.stringify(launchJson, null, 2))
	console.log(`✅ Added launch configuration for ${titleCaseName}`)
	return launchJsonPath
}

const installDependencies = (extensionDir: string) => {
	console.log(`📦 Installing dependencies...`)

	try {
		execSync('bun install', { cwd: extensionDir, stdio: 'inherit' })
		console.log(`✅ Dependencies installed successfully!`)
	} catch (error) {
		console.error(`⚠️ Failed to install dependencies. You may need to run 'bun install' manually.`)
		console.error(error)
	}
}

async function main() {
	const extensionNameTitleCase = await input({
		message: 'What is the name of your extension? (Title Case, e.g., "My Extension")',
		validate: (name: string) => (name.trim() ? true : 'Extension name cannot be empty'),
	})

	const extensionNameKebabCase = R.toKebabCase(extensionNameTitleCase)
	console.log(`Using name: ${extensionNameTitleCase} (${extensionNameKebabCase})`)
	const extensionDir = path.join(process.cwd(), 'packages', extensionNameKebabCase)

	try {
		if (!(await prepareDirectory(extensionDir, extensionNameKebabCase))) {
			console.log('Operation cancelled.')
			return
		}

		const written = [
			writePackageJson(extensionDir, extensionNameTitleCase, extensionNameKebabCase),
			nameExtensionSource(extensionDir, extensionNameKebabCase),
			addLaunchConfig(extensionNameTitleCase, extensionNameKebabCase),
		]

		console.log(`🎨 Formatting generated files...`)
		await Promise.all(R.pipe(written, R.filter(R.isNonNull), R.map(formatFile)))
		console.log(
			`✅ VSCode extension '${extensionNameTitleCase}' successfully created in packages/${extensionNameKebabCase}!`,
		)

		installDependencies(extensionDir)

		console.log(`\n🚀 Next steps:`)
		console.log(`  1. cd packages/${extensionNameKebabCase}`)
		console.log(`  2. bun dev`)
		console.log(`  3. Press F5 to start debugging your extension`)
	} catch (error) {
		console.error(`❌ Error creating extension: ${toMessage(error)}`)
		process.exit(1)
	}
}

main().catch((err) => {
	console.error('Error:', err)
	process.exit(1)
})
