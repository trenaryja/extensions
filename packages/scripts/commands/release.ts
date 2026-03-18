import { intro, log, note, outro, select, spinner } from '@clack/prompts'
import chalk from 'chalk'
import { readFileSync, writeFileSync } from 'fs'
import { basename, join, relative } from 'path'
import { handleCancel } from '@/lib/cli'
import { generateChangelog, isGitCliffInstalled } from '@/lib/cliff'
import { createTag, getRepoRoot, stageFiles } from '@/lib/git'
import { type WorkspacePackage, getChangelogPackages } from '@/lib/packages'

type ReleaseOptions = {
	package?: string
	bump?: 'patch' | 'minor' | 'major'
	commit?: boolean
}

const bumpVersion = (current: string, bump: 'patch' | 'minor' | 'major'): string => {
	const parts = current.split('.').map(Number)
	if (parts.length !== 3 || parts.some(isNaN)) {
		throw new Error(`Invalid semver: ${current}`)
	}

	// 🚩 EXTRACTABLE: semver bump helper — generic utility, could live in
	// /Users/justin/Git/bin/lib/semver/semver.ts
	switch (bump) {
		case 'major':
			return `${parts[0] + 1}.0.0`
		case 'minor':
			return `${parts[0]}.${parts[1] + 1}.0`
		case 'patch':
			return `${parts[0]}.${parts[1]}.${parts[2] + 1}`
	}
}

const selectPackage = async (packages: WorkspacePackage[]): Promise<WorkspacePackage> => {
	const selected = await select({
		message: 'Which package do you want to release?',
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

const selectBump = async (currentVersion: string): Promise<'patch' | 'minor' | 'major'> => {
	const selected = await select({
		message: `Current version: ${currentVersion}. How should we bump?`,
		options: [
			{ value: 'patch' as const, label: 'Patch', hint: bumpVersion(currentVersion, 'patch') },
			{ value: 'minor' as const, label: 'Minor', hint: bumpVersion(currentVersion, 'minor') },
			{ value: 'major' as const, label: 'Major', hint: bumpVersion(currentVersion, 'major') },
		],
	})

	return handleCancel(selected)
}

export const release = async (options: ReleaseOptions): Promise<void> => {
	intro(chalk.bold('turbox release'))

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

	// 1. Select package
	const pkg = options.package ? packages.find((p) => p.name === options.package) : await selectPackage(packages)

	if (!pkg) {
		log.error(`Package "${options.package}" not found or does not have "changelog": true.`)
		process.exit(1)
	}

	log.info(`Package: ${chalk.cyan(pkg.displayName || pkg.name)} (${pkg.version})`)

	// 2. Select bump
	const bump = options.bump || (await selectBump(pkg.version))
	const newVersion = bumpVersion(pkg.version, bump)
	const dirName = basename(pkg.path)
	const tagName = `${pkg.name}-v${newVersion}`

	log.info(`Bump: ${pkg.version} → ${chalk.green(newVersion)} (${tagName})`)

	const s = spinner()

	// 3. Bump version in package.json
	s.start('Bumping version in package.json')
	const pkgJson = JSON.parse(readFileSync(pkg.packageJsonPath, 'utf8'))
	pkgJson.version = newVersion
	writeFileSync(pkg.packageJsonPath, JSON.stringify(pkgJson, null, '\t') + '\n')
	s.stop('Version bumped')

	// 4. Generate changelog
	s.start('Generating changelog with git-cliff')
	const changelogPath = join(pkg.path, 'CHANGELOG.md')
	generateChangelog({
		packageName: pkg.name,
		includePath: relative(getRepoRoot(), pkg.path),
		outputPath: changelogPath,
		tagPattern: `${pkg.name}-v*`,
		tag: tagName,
	})
	s.stop('Changelog updated')

	// 5. Create git tag
	s.start(`Creating tag: ${tagName}`)
	createTag(tagName)
	s.stop('Tag created')

	// 6. Stage changes
	s.start('Staging changes')
	stageFiles(pkg.packageJsonPath, changelogPath)
	s.stop('Changes staged')

	// 7. Show summary
	const root = getRepoRoot()
	note(
		[
			`${chalk.dim('Package:')}   ${pkg.name}`,
			`${chalk.dim('Version:')}   ${pkg.version} → ${newVersion}`,
			`${chalk.dim('Tag:')}       ${tagName}`,
			`${chalk.dim('Changelog:')} ${relative(root, changelogPath)}`,
			'',
			chalk.dim('Staged files are ready for review.'),
		].join('\n'),
		'Release Summary',
	)

	// 8. Optionally commit
	if (options.commit) {
		const { commit: gitCommit } = await import('@/lib/git')
		gitCommit(`chore(release): ${tagName}`)
		log.success('Committed.')
	} else {
		log.info(`Run ${chalk.dim(`git commit -m "chore(release): ${tagName}"`)} when ready.`)
	}

	outro('Done!')
}
