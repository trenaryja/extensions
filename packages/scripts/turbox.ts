#!/usr/bin/env bun

import { intro, select } from '@clack/prompts'
import chalk from 'chalk'
import { Command } from 'commander'
import { changelog } from '@/commands/changelog'
import { release } from '@/commands/release'
import { handleCancel, runCLI } from '@/lib/cli'

const program = new Command()
	.name('turbox')
	.description('Monorepo CLI for releases and changelogs')
	.version('0.0.1')

program
	.command('release')
	.description('Release a package: version bump, changelog, tag, and stage')
	.option('-p, --package <name>', 'Package name (skip interactive selection)')
	.option('-b, --bump <type>', 'Semver bump type: patch, minor, or major')
	.option('-c, --commit', 'Auto-commit after staging')
	.action((options) => release(options))

program
	.command('changelog')
	.description('Generate changelogs for packages or a monorepo summary')
	.option('-p, --package <name>', 'Single package (deterministic git-cliff)')
	.option('--packages <names>', 'Multiple packages, comma-separated')
	.option('-s, --summary', 'Generate monorepo summary via Ollama')
	.option('-m, --model <name>', 'Ollama model override')
	.action((options) => changelog(options))

const interactive = async (): Promise<void> => {
	intro(chalk.bold('turbox'))

	const command = handleCancel(
		await select({
			message: 'What would you like to do?',
			options: [
				{ value: 'release' as const, label: 'Release', hint: 'version bump, changelog, tag, and stage' },
				{ value: 'changelog' as const, label: 'Changelog', hint: 'generate changelogs or monorepo summary' },
			],
		}),
	)

	switch (command) {
		case 'release':
			return release({})
		case 'changelog':
			return changelog({})
	}
}

const main = async () => {
	// If no subcommand provided, drop into interactive mode
	const hasSubcommand = process.argv.length > 2 && !process.argv[2].startsWith('-')
	if (hasSubcommand) {
		await program.parseAsync(process.argv)
	} else {
		await interactive()
	}
}

runCLI(main)
