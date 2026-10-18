import * as vscode from 'vscode'
import { dictate, NATIVE_BINARY } from '@repo/hearsay-core'
import type { DictateEvent, DictateSession } from '@repo/hearsay-core/types'
import type { Focus } from './commands'
import { TOGGLE } from './ids'
import { getConfig } from './config'
import { createGhost } from './ghost'
import { insert } from './insert'
import { resolveConfiguredModel } from './model'
import { createStatus } from './status'
import { nextRecording, pruneRecordings } from './recordings'

/** Zero, not just an event the extension ignores: a preview nobody renders still costs a whole whisper pass. */
const previewInterval = () => (getConfig('hearsay.livePreview') === 'off' ? 0 : getConfig('hearsay.partialMs'))

const create = (context: vscode.ExtensionContext) => {
	const status = createStatus(TOGGLE)
	const output = vscode.window.createOutputChannel('Hearsay', { log: true })
	const ghost = createGhost()
	context.subscriptions.push(status, output, ghost)

	const binary = vscode.Uri.joinPath(context.extensionUri, 'assets', NATIVE_BINARY).fsPath
	const models = vscode.Uri.joinPath(context.globalStorageUri, 'models').fsPath

	/** Cancelling a download is a choice, not a failure worth a toast. */
	const report = (error: unknown) => {
		if (error instanceof Error && error.name === 'AbortError') return void output.info('download cancelled')
		output.error(error instanceof Error ? error : String(error))
		return vscode.window.showErrorMessage(`Hearsay: ${error instanceof Error ? error.message : String(error)}`)
	}

	const prepareModel = () => resolveConfiguredModel(models, output).catch(report)

	// Picked in the quick pick or typed into settings alike: the download starts now, not at the next dictation.
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('hearsay.model')) void prepareModel()
		}),
	)

	let active: DictateSession | undefined
	let running: Promise<unknown> | undefined
	let inStatus = false
	let focus: Focus | undefined

	/** `escape` is bound to cancel only while this is set, so it keeps its usual meaning otherwise. */
	const recording = (on: boolean) => vscode.commands.executeCommand('setContext', 'hearsay.recording', on)

	/** Only a `TextEditor` can be decorated — anywhere else, or with no editor open, the preview goes to the status bar. */
	const preview = (text: string) => {
		const how = getConfig('hearsay.livePreview')
		inStatus = how === 'status' || focus !== undefined || (how === 'ghost' && !ghost.show(text))
		if (inStatus) status.preview(text)
	}

	const clearPreview = () => {
		ghost.clear()
		inStatus = false
		status.show('recording')
	}

	const dictation = async () => {
		const path = await resolveConfiguredModel(models, output)
		const wav = await nextRecording(context)
		const device = getConfig('hearsay.device')
		const threads = getConfig('hearsay.threads')

		status.show('transcribing')
		active = dictate(binary, path, {
			device: device || undefined,
			out: wav,
			language: getConfig('hearsay.language'),
			threads: threads || undefined,
			partialMs: previewInterval(),
			silenceMs: getConfig('hearsay.silenceMs'),
			maxSeconds: getConfig('hearsay.maxUtteranceSeconds'),
			dictionary: { vocabulary: getConfig('hearsay.vocabulary'), replacements: getConfig('hearsay.replacements') },
			chime: getConfig('hearsay.chime'),
		})

		let committed = 0
		const unplaced: string[] = []

		/** Clearing the preview and editing in the same turn is what stops the tail rendering twice. */
		const commit = async ({ text, raw, seconds }: DictateEvent & { event: 'utterance' }) => {
			clearPreview()
			if (!text) return
			const where = await insert(text, committed > 0, focus)
			output.info(`${seconds.toFixed(2)}s → ${where ?? 'nowhere'}: ${text}`)
			if (raw !== text) output.info(`  whisper heard: ${raw}`)
			if (where) committed += 1
			else unplaced.push(text)
		}

		const finish = async (event: DictateEvent & { event: 'done' }) => {
			output.info(`${event.seconds.toFixed(2)}s in ${committed} utterance(s) — ${wav}`)
			await pruneRecordings(context)
			if (event.samples) return
			// An ungranted microphone reads as digital silence rather than an error, and the VAD trims it away.
			output.warn('the recording held no audio — is microphone access granted to VS Code?')
			void vscode.window.showWarningMessage('Hearsay: heard only silence — check that VS Code has microphone access.')
		}

		try {
			for await (const event of active.events) {
				if (event.event === 'ready') {
					output.info(`recording from ${device || 'the default device'} into ${wav}`)
					status.show('recording')
					await recording(true)
				} else if (event.event === 'loaded') output.info(`loaded ${path} in ${event.loadMs}ms`)
				else if (event.event === 'level' && !inStatus) status.level(event.bands)
				else if (event.event === 'partial') preview(event.text)
				else if (event.event === 'utterance') await commit(event)
				else if (event.event === 'done') await finish(event)
				else if (event.event === 'cancelled') output.info('cancelled')
			}
		} finally {
			active = undefined
			clearPreview()
			await recording(false)
		}

		if (!unplaced.length) return
		const text = unplaced.join(' ')
		await vscode.env.clipboard.writeText(text)
		output.warn('no editor or terminal was focused — copied to the clipboard instead')
		void vscode.window.showInformationMessage(`Hearsay: no editor or terminal focused — copied “${text}”`)
	}

	// Not `async`: the in-flight promise is the busy flag, so a second press lands before the first resolves.
	const toggle = (focused?: Focus) => {
		if (active) return active.stop()
		if (running) return
		focus = focused
		output.info(`dictating into ${focus ?? 'the editor'}`)
		running = dictation()
			.catch(report)
			.finally(() => {
				running = undefined
				status.show('idle')
			})
	}

	/** Drops the utterance in flight. Anything already committed stays — `cmd+z` per utterance undoes it. */
	const cancel = () => active?.cancel()

	return { toggle, cancel, prepareModel }
}

let current: ReturnType<typeof create> | undefined

/** One session per window. Built at activation, because its status bar item is the only visible affordance. */
export const session = (context: vscode.ExtensionContext) => (current ??= create(context))
