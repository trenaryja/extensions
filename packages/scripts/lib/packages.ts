import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { getRepoRoot } from './git'

export type WorkspacePackage = {
	name: string
	displayName?: string
	version: string
	path: string
	packageJsonPath: string
	changelog: boolean
}

/**
 * Discover all workspace packages and filter to those with "changelog": true
 */
export const getChangelogPackages = (): WorkspacePackage[] => {
	return getWorkspacePackages().filter((pkg) => pkg.changelog)
}

/**
 * Discover all workspace packages from the packages/ directory
 */
export const getWorkspacePackages = (): WorkspacePackage[] => {
	const root = getRepoRoot()
	const packagesDir = join(root, 'packages')

	if (!existsSync(packagesDir)) return []

	return readdirSync(packagesDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => {
			const pkgPath = join(packagesDir, entry.name)
			const pkgJsonPath = join(pkgPath, 'package.json')

			if (!existsSync(pkgJsonPath)) return null

			const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))

			return {
				name: pkgJson.name as string,
				displayName: pkgJson.displayName as string | undefined,
				version: pkgJson.version as string,
				path: pkgPath,
				packageJsonPath: pkgJsonPath,
				changelog: pkgJson.changelog === true,
			}
		})
		.filter((pkg): pkg is WorkspacePackage => pkg !== null)
}

/**
 * Find a specific changelog-enabled package by name
 */
export const findPackage = (name: string): WorkspacePackage | undefined => {
	return getChangelogPackages().find((pkg) => pkg.name === name)
}
