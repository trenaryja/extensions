import { launchCommand, LaunchType, showHUD, showToast, Toast } from '@raycast/api'
import { errorMessage, toggle } from './lib/engine'

export default async function Command() {
	try {
		const state = await toggle()
		// Refreshes the menu bar icon; fails harmlessly when that command is disabled.
		await launchCommand({ name: 'menu-bar', type: LaunchType.Background }).catch(() => undefined)
		return await showHUD(state.running ? `Hearing ${state.input}` : 'Monitoring off')
	} catch (error) {
		return showToast({ style: Toast.Style.Failure, title: 'Could not toggle monitoring', message: errorMessage(error) })
	}
}
