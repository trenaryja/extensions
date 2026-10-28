import type { ModelId } from '@repo/hearsay-core'
import { findModel, listModels, resolveModel } from '@repo/hearsay-core'
import * as vscode from 'vscode'
import { getConfig } from './config'

/** Picking a model starts its download while a dictation may start another; both wait on the same one. */
const downloads = new Map<string, Promise<string>>()

const download = (id: ModelId, dir: string, output: vscode.LogOutputChannel) => {
	const label = findModel(id)?.label
	output.info(`downloading the ${label} model`)
	// `withProgress` hands back a Thenable, which has no `finally`.
	return Promise.resolve(
		vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: `Hearsay: downloading the ${label} model`,
				cancellable: true,
			},
			(progress, token) => {
				const controller = new AbortController()
				token.onCancellationRequested(() => controller.abort())
				let reported = 0
				return resolveModel({
					id,
					dir,
					signal: controller.signal,
					onProgress: ({ received, total }) => {
						progress.report({ increment: ((received - reported) / total) * 100 })
						reported = received
					},
				})
			},
		),
	)
}

/**
 * The configured model's path on disk, downloading it first if it isn't there. `resolveModel` returns
 * instantly on a cached one, so the notification only ever goes up for a real download.
 */
export const resolveConfiguredModel = async (dir: string, output: vscode.LogOutputChannel) => {
	const localPath = getConfig('hearsay.modelPath')
	const id = getConfig('hearsay.model')
	if (localPath || (await listModels(dir)).some((entry) => entry.id === id && entry.path))
		return resolveModel({ id, dir, localPath: localPath || undefined })

	const pending = downloads.get(id) ?? download(id, dir, output)
	downloads.set(id, pending)
	return pending.finally(() => downloads.delete(id))
}
