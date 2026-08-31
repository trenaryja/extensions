import { ensureStateDirs, paths } from '../state'
import type { Summarizer, SummarizerId } from '../types'
import { buildPrompt } from './prompt'

// cwd must stay paths.scratch: these CLIs record a transcript per working directory, and
// narrate/lib/sources/transcript.ts drops messages whose cwd is the scratch dir so summarizing
// never feeds its own output back in as a source.
const runInScratch = async (
	command: string[],
	prompt: string,
	{ signal, env = {} }: { signal: AbortSignal; env?: Record<string, string> },
) => {
	ensureStateDirs()
	const child = Bun.spawn(command, {
		cwd: paths.scratch,
		// Bun.spawn stops inheriting once `env` is set, and these CLIs need PATH, HOME and USER to authenticate.
		env: { ...process.env, ...env },
		stdin: new TextEncoder().encode(prompt),
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const kill = () => child.kill()
	signal.addEventListener('abort', kill, { once: true })

	try {
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		])
		signal.throwIfAborted()
		if (exitCode !== 0)
			throw new Error(`${command[0]} exited ${exitCode}: ${stderr.trim() || stdout.trim() || 'no output'}`)
		return stdout.trim()
	} finally {
		signal.removeEventListener('abort', kill)
	}
}

export const createCliSummarizer = (id: SummarizerId, command: string[], env?: Record<string, string>): Summarizer => ({
	id,
	available: async () => !!Bun.which(command[0]!),
	summarize: (text, signal) => runInScratch(command, buildPrompt(text), { signal, env }),
})
