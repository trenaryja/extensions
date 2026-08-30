import { showHUD, showToast, Toast } from '@raycast/api'
import { errorMessage, stop } from './lib/narrate'

export default async function Command() {
	try {
		const { stopped } = await stop()
		return await showHUD(stopped ? 'Narration stopped' : 'Nothing playing')
	} catch (error) {
		return showToast({ style: Toast.Style.Failure, title: 'Could not stop', message: errorMessage(error) })
	}
}
