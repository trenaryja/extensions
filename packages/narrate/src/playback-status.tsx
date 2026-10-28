import { Action, ActionPanel, Icon, List, showToast, Toast } from '@raycast/api'
import { useCachedPromise } from '@raycast/utils'
import { useEffect, useRef, useState } from 'react'
import * as R from 'remeda'
import type { HistoryEntry, PlaybackState, Sentence, Status } from './lib/narrate'
import {
	describeRateChange,
	errorMessage,
	history,
	isActive,
	nudgeRate,
	pause,
	RATE_STEP,
	replay,
	resume,
	seek,
	status,
	stop,
} from './lib/narrate'
import { relativeTime } from './lib/relative-time'

const POLL_MS = 1000

const usePlaybackStatus = () => {
	const [state, setState] = useState<Status>()
	const [failure, setFailure] = useState<string>()

	useEffect(() => {
		let cancelled = false
		const tick = () => {
			status()
				.then((next) => cancelled || setState(next))
				.catch((error: unknown) => cancelled || setFailure(errorMessage(error)))
		}
		tick()
		const timer = setInterval(tick, POLL_MS)

		return () => {
			cancelled = true
			clearInterval(timer)
		}
	}, [])

	return { state, failure }
}

const report = (title: string, work: Promise<unknown>) => {
	work.catch((error: unknown) => showToast({ style: Toast.Style.Failure, title, message: errorMessage(error) }))
}

// showHUD would dismiss the window this view lives in, so the rate change reports as a toast instead.
const changeRate = async (direction: 1 | -1) => {
	const change = await nudgeRate(direction)
	if (change !== null) await showToast({ style: Toast.Style.Success, title: describeRateChange(change) })
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

const sentenceIcon = (sentence: Sentence, index: number, current: number) => {
	if (sentence.start === -1) return { value: Icon.CircleProgress, tooltip: 'rendering' }
	if (index < current) return Icon.CircleFilled
	if (index === current) return Icon.Play
	return Icon.Circle
}

const sentenceAccessories = (sentence: Sentence, index: number, skipped: number[]) =>
	R.pipe(
		[
			sentence.start === -1 ? null : { text: clock(sentence.start) },
			skipped.includes(index) ? { tag: 'skipped' } : null,
		],
		R.filter(R.isNonNullish),
	)

const historyAccessories = (entry: HistoryEntry) =>
	R.pipe(
		[
			{ text: relativeTime(entry.finishedAt), tooltip: entry.finishedAt },
			{ text: `${entry.backend}/${entry.voiceId}` },
			entry.phase === 'done' ? null : { tag: entry.phase },
		],
		R.filter(R.isNonNullish),
	)

const playbackSubtitle = (state: PlaybackState) =>
	[
		state.phase,
		`${state.sentenceIndex + 1}/${state.sentences.length}`,
		`${clock(state.position)}/${clock(state.duration)}`,
		`${state.speed}×`,
		`${state.backend}/${state.voiceId}`,
	].join(' · ')

const EmptyView = ({ state, failure }: { state?: Status; failure?: string }) => {
	const failed = state?.phase === 'error'
	return (
		<List.EmptyView
			title={failure ? 'narrate failed' : failed ? 'Narration failed' : 'Nothing playing'}
			description={failure ?? (failed ? state.error : 'Start one from Recent Messages or Read Selection.')}
			icon={failure || failed ? Icon.Warning : Icon.SpeakerOff}
		/>
	)
}

const HistorySection = ({ entries }: { entries: readonly HistoryEntry[] }) => (
	<List.Section title='History'>
		{entries.map((entry) => (
			<List.Item
				key={entry.finishedAt}
				title={entry.label}
				icon={Icon.SpeechBubble}
				accessories={historyAccessories(entry)}
				actions={
					<ActionPanel>
						<Action title='Play Again' icon={Icon.Play} onAction={() => report('Could not replay', replay(entry))} />
						<Action.CopyToClipboard title='Copy Text' content={entry.text} />
					</ActionPanel>
				}
			/>
		))}
	</List.Section>
)

export default function Command() {
	const { state, failure } = usePlaybackStatus()
	const { data, isLoading: loadingHistory, revalidate } = useCachedPromise(history, [])
	// Auto-follow yanks the selection to the sentence being spoken; arrowing away turns it off until re-enabled.
	const [follow, setFollow] = useState(true)
	const active = state !== undefined && isActive(state)
	const current = active ? state.sentenceIndex : -1

	// The status poll must not drag history along with it; a narration coming to rest is the only thing that adds to it.
	const wasActiveRef = useRef(false)
	useEffect(() => {
		if (wasActiveRef.current && !active) revalidate()
		wasActiveRef.current = active
	}, [active, revalidate])

	const onSelectionChange = (id: string | null) => {
		if (active && id !== null && id !== String(current)) setFollow(false)
	}

	const jump = (index: number) => {
		setFollow(true)
		report('Could not seek', seek(index))
	}

	const paused = active && state.phase === 'paused'

	const togglePause = () => (paused ? report('Could not resume', resume()) : report('Could not pause', pause()))

	// Raycast only intercepts a shortcut carrying cmd, ctrl or opt; a bare-shift one types into the filter field.
	const controls = (
		<>
			<Action
				title='Speed Up'
				icon={Icon.ChevronUp}
				shortcut={{ modifiers: ['cmd'], key: '=' }}
				onAction={() => report('Could not change rate', changeRate(1))}
			/>
			<Action
				title='Slow Down'
				icon={Icon.ChevronDown}
				shortcut={{ modifiers: ['cmd'], key: '-' }}
				onAction={() => report('Could not change rate', changeRate(-1))}
			/>
			<Action
				title='Stop'
				icon={Icon.Stop}
				shortcut={{ modifiers: ['ctrl'], key: 'x' }}
				onAction={() => report('Could not stop', stop())}
			/>
		</>
	)

	return (
		<List
			isLoading={(state === undefined && !failure) || loadingHistory}
			selectedItemId={follow && active ? String(current) : undefined}
			onSelectionChange={onSelectionChange}
			navigationTitle={active ? state.label : 'Narrate'}
			searchBarPlaceholder='Filter sentences…'
		>
			<EmptyView state={state} failure={failure} />
			{active && (
				<List.Section
					title={follow ? 'Following' : 'Auto-follow off — ↵ on a sentence to jump'}
					subtitle={playbackSubtitle(state)}
				>
					{state.sentences.map((sentence, index) => (
						<List.Item
							// the index IS the identity here: it is also the row id the selection tracks
							key={index}
							id={String(index)}
							title={sentence.text}
							icon={sentenceIcon(sentence, index, current)}
							accessories={sentenceAccessories(sentence, index, state.skipped)}
							actions={
								<ActionPanel>
									<Action title='Jump Here' icon={Icon.ArrowRightCircle} onAction={() => jump(index)} />
									<Action
										title={paused ? 'Resume' : 'Pause'}
										icon={paused ? Icon.Play : Icon.Pause}
										shortcut={{ modifiers: ['cmd'], key: 'return' }}
										onAction={togglePause}
									/>
									{!follow && <Action title='Turn on Auto-Follow' icon={Icon.Eye} onAction={() => setFollow(true)} />}
									<Action.CopyToClipboard title='Copy Sentence' content={sentence.text} />
									<ActionPanel.Section title={`Rate (±${RATE_STEP})`}>{controls}</ActionPanel.Section>
								</ActionPanel>
							}
						/>
					))}
				</List.Section>
			)}
			{!active && <HistorySection entries={data ?? []} />}
		</List>
	)
}
