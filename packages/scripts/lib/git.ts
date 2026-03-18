import { execSync, spawnSync } from 'child_process'

export const isGitRepo = (): boolean => {
	try {
		execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' })
		return true
	} catch {
		return false
	}
}

export const getRepoRoot = (): string => {
	return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
}

export const createTag = (tag: string): void => {
	const result = spawnSync('git', ['tag', tag], { stdio: 'inherit' })
	if (result.status !== 0) throw new Error(`Failed to create tag: ${tag}`)
}

export const deleteTag = (tag: string): void => {
	spawnSync('git', ['tag', '-d', tag], { stdio: 'ignore' })
}

export const getLatestTag = (pattern: string): string | null => {
	try {
		return execSync(`git tag -l "${pattern}" --sort=-v:refname`, { encoding: 'utf8' }).trim().split('\n')[0] || null
	} catch {
		return null
	}
}

export const stageFiles = (...files: string[]): void => {
	const result = spawnSync('git', ['add', ...files], { stdio: 'inherit' })
	if (result.status !== 0) throw new Error('Failed to stage files')
}

export const commit = (message: string): void => {
	const result = spawnSync('git', ['commit', '-m', message], { stdio: 'inherit' })
	if (result.status !== 0) throw new Error('git commit failed')
}

export const getStagedDiff = (): string => {
	try {
		return execSync('git diff --staged', { encoding: 'utf8' }).trim()
	} catch {
		throw new Error('Failed to get staged diff. Are you in a git repo?')
	}
}

export const getDiff = (): string => {
	try {
		return execSync('git diff', { encoding: 'utf8' }).trim()
	} catch {
		throw new Error('Failed to get diff.')
	}
}
