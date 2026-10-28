import * as R from 'remeda'
import * as vscode from 'vscode'

const BLOCKS = '▁▂▃▄▅▆▇█'

/** The helper's 16 FFT bands folded in pairs — eight glyphs read as a meter without crowding the status bar. */
const meter = (bands: readonly number[]) =>
	R.pipe(
		bands,
		R.chunk(2),
		R.map((pair) => BLOCKS[Math.round(Math.max(...pair) * (BLOCKS.length - 1))]),
	).join('')

const STATES = {
	idle: { text: '$(mic)', tooltip: 'Hearsay: start dictating' },
	recording: { text: '$(mic-filled)', tooltip: 'Hearsay: recording — click to finish' },
	transcribing: { text: '$(sync~spin)', tooltip: 'Hearsay: transcribing' },
}

export type StatusState = keyof typeof STATES

export const createStatus = (command: string) => {
	const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
	item.command = command

	const show = (state: StatusState) => {
		item.text = STATES[state].text
		item.tooltip = STATES[state].tooltip
		item.backgroundColor = state === 'recording' ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined
		item.show()
	}

	show('idle')
	return {
		show,
		level: (bands: readonly number[]) => (item.text = `${STATES.recording.text} ${meter(bands)}`),
		// Replaces the meter rather than joining it: the status bar truncates, and the words matter more.
		preview: (text: string) => (item.text = `${STATES.recording.text} ${text}`),
		dispose: () => item.dispose(),
	}
}
