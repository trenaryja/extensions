import { fileURLToPath } from 'node:url'
import { syncContributes } from '@repo/vscode-utils/contribute'
import { configSchema } from '../src/config.schema'
import { commands, customEditors, walkthroughs } from '../src/contributes'

const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url))
const check = process.argv.includes('--check')

await syncContributes(
	packageJsonPath,
	{ commands, customEditors, config: { schema: configSchema, title: 'Marksmith' }, extra: { walkthroughs } },
	{ check },
)

console.log(check ? '✓ contributes: no drift' : '✓ contributes: synced package.json from registry')
