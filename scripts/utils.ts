import * as fs from 'fs'
import * as path from 'path'
import * as prettier from 'prettier'

// Format a file with prettier
export const formatFile = async (filePath: string): Promise<void> => {
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

export const copyFiles = (source: string, destination: string) => {
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
