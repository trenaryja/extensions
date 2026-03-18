import { cancel, isCancel } from '@clack/prompts'

/**
 * Wraps a CLI main() function with standard error handling:
 * - Clack cancel (Ctrl+C / Esc) exits cleanly with code 0
 * - Inquirer's ExitPromptError (Ctrl+C) exits cleanly with code 0
 * - All other errors are logged and exit with code 1
 */
export const runCLI = (main: () => Promise<void>): void => {
	main().catch((err) => {
		if (err?.name === 'ExitPromptError') {
			console.log('\nCancelled.\n')
			process.exit(0)
		}

		console.error(err)
		process.exit(1)
	})
}

/**
 * Check if a clack prompt was cancelled and exit gracefully
 */
export const handleCancel = <T>(value: T | symbol): T => {
	if (isCancel(value)) {
		cancel('Cancelled.')
		process.exit(0)
	}
	return value as T
}
