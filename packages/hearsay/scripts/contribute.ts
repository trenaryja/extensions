import { syncContributes } from '@repo/vscode-utils/contribute'
import { fileURLToPath } from 'node:url'
import { commands } from '../src/commands'
import { configSchema } from '../src/config.schema'
import { CANCEL, TOGGLE } from '../src/ids'

const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url))
const check = process.argv.includes('--check')

/** A terminal hands every non-`cmd` keystroke to the shell unless the command is listed here. */
const configurationDefaults = { 'terminal.integrated.commandsToSkipShell': [TOGGLE, CANCEL] }

await syncContributes(
	packageJsonPath,
	{ commands, config: { schema: configSchema, title: 'Hearsay' }, extra: { configurationDefaults } },
	{ check },
)
console.log(check ? '✓ contributes: no drift' : '✓ contributes: synced package.json from registry')
