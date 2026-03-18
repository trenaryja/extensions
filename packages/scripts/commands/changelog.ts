import { intro, log, multiselect, note, outro, select, spinner } from '@clack/prompts'
import chalk from 'chalk'
import { readFileSync } from 'fs'
import { join, relative } from 'path'
import { handleCancel } from '@/lib/cli'
import { generateChangelog, isGitCliffInstalled } from '@/lib/cliff'
import { getRepoRoot } from '@/lib/git'
import { chat, getInstalledModels, isModelInstalled, isOllamaAvailable } from '@/lib/ollama'
import { type WorkspacePackage, getChangelogPackages } from '@/lib/packages'

type ChangelogOptions = {
	package?: string
	packages?: string
	summary?: boolean
	model?: string
}

type ChangelogScope = 'single' | 'multiple' | 'summary'

const selectScope = async (): Promise<ChangelogScope> => {
	const selected = await select({
		message: 'What would you like to generate?',
		options: [
			{ value: 'single' as const, label: 'Single package', hint: 'deterministic git-cliff' },
			{ value: 'multiple' as const, label: 'Multiple packages', hint: 'deterministic git-cliff per package' },
			{ value: 'summary' as const, label: 'Monorepo summary', hint: 'AI-generated prose → root CHANGELOG.md' },
		],
	})

	return handleCancel(selected)
}

const selectSinglePackage = async (packages: WorkspacePackage[]): Promise<WorkspacePackage> => {
	const selected = await select({
		message: 'Which package?',
		options: packages.map((pkg) => ({
			value: pkg.name,
			label: pkg.displayName || pkg.name,
			hint: `v${pkg.version}`,
		})),
	})

	const name = handleCancel(selected)
	const pkg = packages.find((p) => p.name === name)
	if (!pkg) throw new Error(`Package not found: ${name}`)
	return pkg
}

const selectMultiplePackages = async (packages: WorkspacePackage[]): Promise<WorkspacePackage[]> => {
	const selected = await multiselect({
		message: 'Which packages?',
		options: packages.map((pkg) => ({
			value: pkg.name,
			label: pkg.displayName || pkg.name,
			hint: `v${pkg.version}`,
		})),
		required: true,
	})

	const names = handleCancel(selected)
	return packages.filter((p) => names.includes(p.name))
}

const generatePackageChangelog = (pkg: WorkspacePackage): void => {
	const root = getRepoRoot()
	const changelogPath = join(pkg.path, 'CHANGELOG.md')

	generateChangelog({
		packageName: pkg.name,
		includePath: relative(root, pkg.path),
		outputPath: changelogPath,
		tagPattern: `${pkg.name}-v*`,
	})
}

const selectOllamaModel = async (configuredModel?: string): Promise<string> => {
	const models = await getInstalledModels()

	if (models.length === 0) {
		throw new Error('No Ollama models installed. Run: ollama pull llama3.2')
	}

	// If a model is configured and installed, use it
	if (configuredModel) {
		const installed = models.some((m) => m === configuredModel || m.startsWith(`${configuredModel}:`))
		if (installed) return configuredModel
		log.warn(`Configured model "${configuredModel}" is not installed.`)
	}

	// Prompt user to select from installed models
	const selected = await select({
		message: 'Select an Ollama model for summarization:',
		options: models.map((m) => ({ value: m, label: m })),
	})

	return handleCancel(selected)
}

const generateSummary = async (packages: WorkspacePackage[], model?: string): Promise<void> => {
	const root = getRepoRoot()

	// Check Ollama availability
	if (!(await isOllamaAvailable())) {
		log.error('Ollama is not running. Start it with: ollama serve')
		process.exit(1)
	}

	const selectedModel = await selectOllamaModel(model)
	log.info(`Using model: ${chalk.cyan(selectedModel)}`)

	// Collect changelogs from all packages
	const changelogs: string[] = []
	for (const pkg of packages) {
		const changelogPath = join(pkg.path, 'CHANGELOG.md')
		try {
			const content = readFileSync(changelogPath, 'utf8')
			changelogs.push(`## ${pkg.displayName || pkg.name}\n\n${content}`)
		} catch {
			// No changelog yet, skip
		}
	}

	if (changelogs.length === 0) {
		log.warn('No package changelogs found. Generate package changelogs first.')
		return
	}

	const s = spinner()
	s.start('Generating monorepo summary with AI...')

	const prompt = [
		'You are summarizing changes across a monorepo for a root-level CHANGELOG entry.',
		'Below are the individual package changelogs. Summarize the most recent changes across all packages into a concise prose summary.',
		'Focus on what matters to someone looking at the monorepo as a whole — major features, important fixes, cross-cutting changes.',
		'Write in past tense. Be concise. Do not use markdown headers, just prose paragraphs.',
		'',
		changelogs.join('\n\n---\n\n'),
	].join('\n')

	const summary = await chat(selectedModel, [{ role: 'user', content: prompt }])

	s.stop('Summary generated')

	const date = new Date().toISOString().split('T')[0]
	const entry = `## ${date}\n\n${summary}\n\n`

	// Append to root CHANGELOG.md
	const rootChangelogPath = join(root, 'CHANGELOG.md')
	let existing = ''
	try {
		existing = readFileSync(rootChangelogPath, 'utf8')
	} catch {
		// File doesn't exist yet
	}

	const { writeFileSync } = await import('fs')
	const header = '# Changelog\n\n'

	if (existing.startsWith('# Changelog')) {
		// Prepend new entry after header
		const afterHeader = existing.replace(/^# Changelog\n\n/, '')
		writeFileSync(rootChangelogPath, `${header}${entry}${afterHeader}`)
	} else if (existing) {
		writeFileSync(rootChangelogPath, `${header}${entry}${existing}`)
	} else {
		writeFileSync(rootChangelogPath, `${header}${entry}`)
	}

	note(
		[
			`${chalk.dim('Model:')}     ${selectedModel}`,
			`${chalk.dim('Output:')}    ${relative(root, rootChangelogPath)}`,
			`${chalk.dim('Date:')}      ${date}`,
			'',
			summary.slice(0, 200) + (summary.length > 200 ? '...' : ''),
		].join('\n'),
		'Monorepo Summary',
	)
}

export const changelog = async (options: ChangelogOptions): Promise<void> => {
	intro(chalk.bold('turbox changelog'))

	// Preflight
	if (!isGitCliffInstalled()) {
		log.error('git-cliff is not installed. Install it with: brew install git-cliff')
		process.exit(1)
	}

	const packages = getChangelogPackages()
	if (packages.length === 0) {
		log.error('No packages with "changelog": true found in package.json files.')
		process.exit(1)
	}

	// Determine scope from flags or interactive prompt
	let scope: ChangelogScope

	if (options.summary) {
		scope = 'summary'
	} else if (options.package) {
		scope = 'single'
	} else if (options.packages) {
		scope = 'multiple'
	} else {
		scope = await selectScope()
	}

	const s = spinner()

	switch (scope) {
		case 'single': {
			const pkg = options.package
				? packages.find((p) => p.name === options.package)
				: await selectSinglePackage(packages)

			if (!pkg) {
				log.error(`Package "${options.package}" not found.`)
				process.exit(1)
			}

			s.start(`Generating changelog for ${pkg.name}`)
			generatePackageChangelog(pkg)
			s.stop(`Changelog updated: ${relative(getRepoRoot(), join(pkg.path, 'CHANGELOG.md'))}`)
			break
		}

		case 'multiple': {
			let selectedPkgs: WorkspacePackage[]

			if (options.packages) {
				const names = options.packages.split(',').map((n) => n.trim())
				selectedPkgs = packages.filter((p) => names.includes(p.name))
				if (selectedPkgs.length === 0) {
					log.error('No matching packages found.')
					process.exit(1)
				}
			} else {
				selectedPkgs = await selectMultiplePackages(packages)
			}

			for (const pkg of selectedPkgs) {
				s.start(`Generating changelog for ${pkg.name}`)
				generatePackageChangelog(pkg)
				s.stop(`Updated: ${relative(getRepoRoot(), join(pkg.path, 'CHANGELOG.md'))}`)
			}
			break
		}

		case 'summary': {
			await generateSummary(packages, options.model)
			break
		}
	}

	outro('Done!')
}
