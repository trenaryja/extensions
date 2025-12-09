import * as fs from 'fs'
import * as path from 'path'
import * as prettier from 'prettier'

export const formatFile = async (filePath: string): Promise<void> => {
	try {
		const content = fs.readFileSync(filePath, 'utf8')
		const rootPackageJsonPath = path.join(process.cwd(), 'package.json')
		const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'))
		const prettierConfig = rootPackageJson.prettier || {}
		const formatted = await prettier.format(content, { ...prettierConfig, filepath: filePath })
		fs.writeFileSync(filePath, formatted)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.warn(`Warning: Could not format file ${filePath}: ${message}`)
	}
}

export const copyFiles = (source: string, destination: string) => {
	const entries = fs.readdirSync(source, { withFileTypes: true })

	for (const entry of entries) {
		const srcPath = path.join(source, entry.name)
		const destPath = path.join(destination, entry.name)
		if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue
		if (entry.isDirectory()) {
			fs.mkdirSync(destPath, { recursive: true })
			copyFiles(srcPath, destPath)
		} else {
			fs.copyFileSync(srcPath, destPath)
		}
	}
}
