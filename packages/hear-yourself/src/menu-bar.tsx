import { Color, Icon, MenuBarExtra, showToast, Toast } from '@raycast/api'
import { usePromise } from '@raycast/utils'
import * as R from 'remeda'
import type { Running, Settings } from './lib/engine'
import { choose, devices, errorMessage, restart, settings, start, status, stop } from './lib/engine'

type Act = (work: () => Promise<unknown>, failure: string) => () => void

const load = async () => {
	const [state, available, chosen] = await Promise.all([status(), devices(), settings()])
	return { state, available, chosen }
}

const menuIcon = (running?: Running) => {
	if (!running) return Icon.MicrophoneDisabled
	if (running.waitingFor) return { source: Icon.Microphone, tintColor: Color.Orange }
	if (running.switchInput ?? running.switchOutput) return { source: Icon.Microphone, tintColor: Color.Blue }
	return Icon.Microphone
}

const menuTooltip = (running?: Running) => {
	if (!running) return 'Monitoring off'
	return running.waitingFor ? 'Paused, waiting for devices' : 'Hearing yourself'
}

const Controls = ({ running, act }: { running?: Running; act: Act }) => {
	if (!running)
		return <MenuBarExtra.Item title='Start Monitoring' icon={Icon.Play} onAction={act(start, 'Could not start')} />
	// One restart re-resolves both defaults, so the offers can't be taken separately.
	const offered = R.unique(R.filter([running.switchInput, running.switchOutput], R.isNonNull))
	return (
		<>
			{running.waitingFor && (
				<MenuBarExtra.Item
					title={running.waitingFor.length > 0 ? `Waiting for ${running.waitingFor.join(' and ')}` : 'Reconnecting…'}
					icon={Icon.Plug}
				/>
			)}
			{offered.length > 0 && (
				<MenuBarExtra.Item
					title={`Switch to ${offered.join(' and ')}`}
					icon={Icon.Switch}
					onAction={act(restart, 'Could not switch devices')}
				/>
			)}
			<MenuBarExtra.Item title='Stop Monitoring' icon={Icon.Stop} onAction={act(stop, 'Could not stop')} />
		</>
	)
}

const Diagnostics = ({ running }: { running: Running }) => (
	<MenuBarExtra.Section title='Diagnostics'>
		<MenuBarExtra.Item
			title={`Level: ${running.inputPeakDb === null ? 'silent' : `${Math.round(running.inputPeakDb)} dB`}`}
		/>
		<MenuBarExtra.Item title={`Buffered: ${running.bufferedMs?.toFixed(1) ?? '–'} ms`} />
		<MenuBarExtra.Item title={`Starved: ${running.starved}`} />
		<MenuBarExtra.Item title={`Discarded: ${running.discarded}`} />
	</MenuBarExtra.Section>
)

export default function Command() {
	const { data, isLoading, revalidate } = usePromise(load)
	const running = data?.state.running ? data.state : undefined

	const act: Act = (work, failure) => () =>
		void work()
			.catch((error: unknown) =>
				showToast({ style: Toast.Style.Failure, title: failure, message: errorMessage(error) }),
			)
			.then(() => revalidate())

	const choice = <K extends keyof Settings>(
		key: K,
		title: string,
		options: readonly { title: string; value?: Settings[K] }[],
	) => {
		const current = running ? running[key] : data?.chosen[key]
		return (
			<MenuBarExtra.Submenu title={title}>
				{options.map((option) => (
					<MenuBarExtra.Item
						key={option.title}
						title={option.title}
						icon={option.value === current ? Icon.Checkmark : undefined}
						onAction={act(() => choose(key, option.value), `Could not change ${title.toLowerCase()}`)}
					/>
				))}
			</MenuBarExtra.Submenu>
		)
	}

	const deviceOptions = (names: readonly string[]) => [
		{ title: 'System Default' },
		...names.map((name) => ({ title: name, value: name })),
	]

	return (
		<MenuBarExtra icon={menuIcon(running)} tooltip={menuTooltip(running)} isLoading={isLoading}>
			<MenuBarExtra.Section>
				<Controls running={running} act={act} />
			</MenuBarExtra.Section>
			{data && (
				<MenuBarExtra.Section>
					{choice('input', 'Input', deviceOptions(data.available.inputs))}
					{choice('output', 'Output', deviceOptions(data.available.outputs))}
					{choice(
						'blocksize',
						'Latency',
						[16, 32, 64, 128].map((frames) => ({ title: `${frames} frames`, value: frames })),
					)}
					{choice(
						'volume',
						'Volume',
						[0.5, 0.75, 1, 1.25, 1.5].map((gain) => ({ title: `${gain * 100}%`, value: gain })),
					)}
				</MenuBarExtra.Section>
			)}
			{running && !running.waitingFor && <Diagnostics running={running} />}
		</MenuBarExtra>
	)
}
