#!/usr/bin/env bun

import { Command } from 'commander'
import { changelog } from '@/commands/changelog'
import { release } from '@/commands/release'
import { runCLI } from '@/lib/cli'

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

const main = async () => {
	await program.parseAsync(process.argv)
}

runCLI(main)
