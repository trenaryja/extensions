import { launchCommand, LaunchType } from '@raycast/api'

export const openStatus = () => launchCommand({ name: 'playback-status', type: LaunchType.UserInitiated })
