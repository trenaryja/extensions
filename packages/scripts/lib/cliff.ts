import { execSync, spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { getRepoRoot } from './git'

/**
 * Check if git-cliff is installed and available on $PATH
 */
export const isGitCliffInstalled = (): boolean => {
	try {
		execSync('git-cliff --version', { stdio: 'ignore' })
		return true
	} catch {
		return false
	}
}

/**
 * Get the path to cliff.toml, searching from repo root
 */
export const getCliffConfigPath = (): string => {
	const root = getRepoRoot()
	const configPath = join(root, 'cliff.toml')

	if (!existsSync(configPath)) {
		throw new Error(`cliff.toml not found at ${configPath}`)
	}

	return configPath
}

type GenerateChangelogOptions = {
	/** Package name for tag pattern matching */
	packageName: string
	/** Path to include for commit filtering */
	includePath: string
	/** Output file path for the changelog */
	outputPath: string
	/** Tag pattern for this package (e.g., "multi-cursor-magic-v*") */
	tagPattern: string
	/** Optional: generate unreleased changes only */
	unreleased?: boolean
	/** Optional: prepend to existing changelog instead of overwriting */
	prepend?: boolean
	/** Optional: tag to use as the latest version */
	tag?: string
}

/**
 * Run git-cliff to generate or update a changelog for a specific package
 */
export const generateChangelog = (options: GenerateChangelogOptions): void => {
	const configPath = getCliffConfigPath()

	const args = [
		'git-cliff',
		'--config',
		configPath,
		'--include-path',
		`${options.includePath}/**`,
		'--tag-pattern',
		options.tagPattern,
		'--output',
		options.outputPath,
	]

	if (options.unreleased) {
		args.push('--unreleased')
	}

	if (options.prepend) {
		args.push('--prepend', options.outputPath)
		// Remove --output when prepending
		const outputIdx = args.indexOf('--output')
		if (outputIdx !== -1) args.splice(outputIdx, 2)
	}

	if (options.tag) {
		args.push('--tag', options.tag)
	}

	const result = spawnSync(args[0], args.slice(1), {
		stdio: 'inherit',
		cwd: getRepoRoot(),
	})

	if (result.status !== 0) {
		throw new Error(`git-cliff failed for ${options.packageName}`)
	}
}

// 🚩 EXTRACTABLE: git-cliff wrapper — this is a generic, project-agnostic interface
// to git-cliff that could live in /Users/justin/Git/bin/lib/cliff/cliff.ts
// The only monorepo-specific part is the options shape, which is just config passed in.
