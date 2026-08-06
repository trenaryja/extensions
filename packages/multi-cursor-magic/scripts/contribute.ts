import { syncContributes } from '@repo/vscode-utils/contribute'
import { fileURLToPath } from 'node:url'

import { commands } from '../src/commands'

const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url))
const check = process.argv.includes('--check')

await syncContributes(packageJsonPath, { commands }, { check })
console.log(check ? '✓ contributes: no drift' : '✓ contributes: synced package.json from registry')
