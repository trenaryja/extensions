import { showHUD, showToast, Toast } from '@raycast/api'
import { describeRateChange, errorMessage, nudgeRate } from './narrate'

export const nudge = async (direction: 1 | -1) => {
	try {
		const change = await nudgeRate(direction)
		return await showHUD(change === null ? 'Nothing playing' : describeRateChange(change))
	} catch (error) {
		return showToast({ style: Toast.Style.Failure, title: 'Could not change rate', message: errorMessage(error) })
	}
}
