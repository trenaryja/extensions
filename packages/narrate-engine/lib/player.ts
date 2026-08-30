import { rm } from 'node:fs/promises'
import { basename } from 'node:path'
import { run } from './backends/shared'
import { paths, requestStop } from './state'

const readPid = async () => {
	const file = Bun.file(paths.pid)
	if (!(await file.exists())) return null
	const pid = Number((await file.text()).trim())
	return Number.isInteger(pid) && pid > 0 ? pid : null
}

// `ps -o comm=` prints the executable path, so compare the basename.
const isAfplay = async (pid: number) => {
	const { stdout } = await run(['ps', '-p', String(pid), '-o', 'comm='])
	const command = stdout.trim()
	return command.length > 0 && basename(command) === 'afplay'
}

export const playWav = async (path: string, speed: number, signal: AbortSignal) => {
	signal.throwIfAborted()
	const child = Bun.spawn(['afplay', '-r', String(speed), path], { stdout: 'ignore', stderr: 'ignore' })
	await Bun.write(paths.pid, String(child.pid))
	const kill = () => child.kill()
	signal.addEventListener('abort', kill, { once: true })

	try {
		await child.exited
	} finally {
		signal.removeEventListener('abort', kill)
		// The next chunk may already own the pid file: only clear our own entry.
		if ((await readPid()) === child.pid) await rm(paths.pid, { force: true })
	}
}

export const stopPlayback = async () => {
	await requestStop()
	const pid = await readPid()
	if (pid === null) return false

	const running = await isAfplay(pid)
	await rm(paths.pid, { force: true })
	if (!running) return false

	try {
		process.kill(pid, 'SIGTERM')
	} catch {
		return false
	}

	return true
}
