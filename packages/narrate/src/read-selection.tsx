import { getSelectedText, showHUD, showToast, Toast } from '@raycast/api'
import { errorMessage, playText } from './lib/narrate'
import { openStatus } from './lib/open-status'

export default async function Command() {
	let text: string
	try {
		text = await getSelectedText()
	} catch {
		return showHUD('Select some text first')
	}
	if (!text.trim()) return showHUD('Select some text first')

	try {
		const started = await playText(text, `Selection: ${text.trim().slice(0, 60)}`)
		// Raycast throws when Playback Status is disabled; the narration is already running, so say so instead.
		return await openStatus().catch(() => showHUD(`Narrating ${started.sentenceTotal} sentences`))
	} catch (error) {
		return showToast({ style: Toast.Style.Failure, title: 'Could not narrate', message: errorMessage(error) })
	}
}
