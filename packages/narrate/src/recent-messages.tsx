import { basename } from 'node:path'
import { useState } from 'react'
import {
	Action,
	ActionPanel,
	Clipboard,
	confirmAlert,
	Icon,
	List,
	openExtensionPreferences,
	showToast,
	Toast,
} from '@raycast/api'
import { useCachedPromise } from '@raycast/utils'
import * as R from 'remeda'
import { errorMessage, listMessages, messageText, playMessage, summarizeAndPlay, summarizer } from './lib/narrate'
import type { TranscriptMessage } from './lib/narrate'
import { openStatus } from './lib/open-status'
import { relativeTime } from './lib/relative-time'

const ALL_DIRECTORIES = 'all'

const play = async (message: TranscriptMessage) => {
	const toast = await showToast({ style: Toast.Style.Animated, title: 'Starting narration…' })

	try {
		const started = await playMessage(message.id)
		toast.style = Toast.Style.Success
		toast.title = `Narrating ${started.sentenceTotal} sentences`
		await openStatus()
	} catch (error) {
		toast.style = Toast.Style.Failure
		toast.title = 'Could not narrate'
		toast.message = errorMessage(error)
	}
}

// Summarizing is the one thing here that spends tokens, so it stays off until it is turned on by hand.
const offerSummarizer = async () => {
	const turnOn = await confirmAlert({
		title: 'Summarize messages with an LLM?',
		message:
			'Summarizing runs an LLM CLI on this Mac — Claude Code on Haiku, or OpenCode — and spends tokens on your account. Play reads the message in full and never calls an LLM.',
		icon: Icon.Stars,
		primaryAction: { title: 'Choose a Summarizer' },
	})
	if (turnOn) await openExtensionPreferences()
}

const summarize = async (message: TranscriptMessage) => {
	if (summarizer() === 'off') return offerSummarizer()
	const toast = await showToast({ style: Toast.Style.Animated, title: 'Summarizing…', message: 'usually 20–60 s' })

	try {
		const { playback } = await summarizeAndPlay(message.id)
		toast.style = Toast.Style.Success
		toast.title = `Narrating summary, ${playback.sentenceTotal} sentences`
		await openStatus()
	} catch (error) {
		toast.style = Toast.Style.Failure
		toast.title = 'Could not summarize'
		toast.message = errorMessage(error)
	}
}

const copy = async (message: TranscriptMessage) => {
	try {
		await Clipboard.copy(await messageText(message.id))
		await showToast({ style: Toast.Style.Success, title: 'Copied message text' })
	} catch (error) {
		await showToast({ style: Toast.Style.Failure, title: 'Could not copy', message: errorMessage(error) })
	}
}

const cwdOptions = (messages: TranscriptMessage[]) =>
	R.pipe(
		messages,
		R.sortBy([(message) => message.timestamp, 'desc']),
		R.uniqueBy((message) => message.cwd),
		R.map((message) => message.cwd),
	)

export default function Command() {
	const { data, isLoading, error } = useCachedPromise(listMessages, [])
	const [cwdFilter, setCwdFilter] = useState<string>(ALL_DIRECTORIES)

	const messages = R.pipe(
		data ?? [],
		R.sortBy([(message) => message.timestamp, 'desc']),
		R.filter((message) => cwdFilter === ALL_DIRECTORIES || message.cwd === cwdFilter),
	)

	return (
		<List
			isLoading={isLoading}
			searchBarPlaceholder='Search recent responses…'
			searchBarAccessory={
				<List.Dropdown tooltip='Filter by Directory' value={cwdFilter} onChange={setCwdFilter}>
					<List.Dropdown.Item title='All directories' value={ALL_DIRECTORIES} />
					{cwdOptions(data ?? []).map((cwd) => (
						<List.Dropdown.Item key={cwd} title={basename(cwd)} value={cwd} />
					))}
				</List.Dropdown>
			}
		>
			<List.EmptyView
				title={error ? 'narrate failed' : 'No recent responses'}
				description={error ? errorMessage(error) : 'Claude Code transcripts under ~/.claude/projects show up here.'}
				icon={error ? Icon.Warning : Icon.SpeechBubble}
			/>
			{messages.map((message) => (
				<List.Item
					key={message.id}
					title={message.preview}
					accessories={[
						{ tag: basename(message.cwd), tooltip: message.cwd },
						{ text: relativeTime(message.timestamp), tooltip: message.timestamp },
					]}
					actions={
						<ActionPanel>
							<Action title='Play' icon={Icon.Play} onAction={() => play(message)} />
							<Action
								title={summarizer() === 'off' ? 'Summarize & Play…' : 'Summarize & Play'}
								icon={Icon.Stars}
								shortcut={{ modifiers: ['cmd', 'shift'], key: 's' }}
								onAction={() => summarize(message)}
							/>
							<Action
								title='Copy Message Text'
								icon={Icon.Clipboard}
								shortcut={{ modifiers: ['cmd'], key: 'c' }}
								onAction={() => copy(message)}
							/>
							<Action title='Open Playback Status' icon={Icon.List} onAction={openStatus} />
						</ActionPanel>
					}
				/>
			))}
		</List>
	)
}
