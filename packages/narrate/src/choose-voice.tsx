import { useState } from 'react'
import { Action, ActionPanel, Form, Icon, List, popToRoot, showToast, Toast, useNavigation } from '@raycast/api'
import { useCachedPromise } from '@raycast/utils'
import * as R from 'remeda'
import { BACKEND_IDS } from '@repo/narrate-engine/types'
import {
	clearVoice,
	currentBackend,
	DEFAULT_BACKEND,
	errorMessage,
	listVoices,
	playText,
	PREVIEW_SAMPLE,
	previewText,
	selectBackend,
	selectedVoice,
	selectVoice,
	setPreviewText,
} from './lib/narrate'
import type { BackendId, Voice } from './lib/narrate'

const BACKEND_TITLES: Record<BackendId, string> = { kokoro: 'Kokoro', say: 'macOS say' }

const SECTIONS = ['Standard', 'Eloquence', 'Novelty'] as const

const QUALITY_ORDER = ['premium', 'enhanced', 'default'] as const

const ALL_LANGUAGES = ''

const displayNames = new Intl.DisplayNames(['en-US'], { type: 'language' })

// `of` throws a RangeError on anything that is not a well-formed BCP-47 tag.
const languageName = (tag: string) => {
	try {
		return displayNames.of(tag) ?? tag
	} catch {
		return tag
	}
}

const systemLanguage = () => {
	const [locale] = Intl.DateTimeFormat().resolvedOptions().locale.split('-u-')
	return (locale ?? 'en-US').toLowerCase()
}

const languagesOf = (voices: Voice[]) =>
	R.pipe(
		voices,
		R.map((voice) => voice.language),
		R.filter(R.isTruthy),
		R.unique(),
		R.sortBy(languageName),
	)

const sectionOf = (voice: Voice) =>
	voice.novelty ? 'Novelty' : voice.family === 'eloquence' ? 'Eloquence' : 'Standard'

const qualityRank = (voice: Voice) => QUALITY_ORDER.indexOf(voice.quality ?? 'default')

type BackendVoices = { backend: BackendId; voices: Voice[]; error?: string }

// One broken backend still leaves the other browsable, so failures are per backend rather than thrown.
const loadCatalog = () =>
	Promise.all(
		R.map(BACKEND_IDS, async (backend): Promise<BackendVoices> => {
			try {
				return { backend, voices: await listVoices(backend) }
			} catch (reason) {
				return { backend, voices: [], error: errorMessage(reason) }
			}
		}),
	)

const loadActive = async () => {
	const backend = await currentBackend()
	return { backend, voiceId: await selectedVoice(backend) }
}

type Filter = { backend: BackendId; language: string }

const encodeFilter = ({ backend, language }: Filter) => `${backend}:${language}`

const decodeFilter = (value: string) => {
	const [backend = '', language = ''] = value.split(':')
	return { backend: R.isIncludedIn(backend, BACKEND_IDS) ? backend : DEFAULT_BACKEND, language }
}

const seedFilter = (catalog: BackendVoices[], backend: BackendId) => {
	const voices = catalog.find((entry) => entry.backend === backend)?.voices ?? []
	const spoken = voices.find((voice) => voice.language.toLowerCase() === systemLanguage())
	return { backend, language: spoken?.language ?? ALL_LANGUAGES }
}

const PreviewTextForm = ({
	initial,
	onSpeak,
	onSave,
}: {
	initial: string
	onSpeak: (text: string) => void
	onSave: (text: string) => Promise<void>
}) => {
	const { pop } = useNavigation()
	const [text, setText] = useState(initial)

	const save = async () => {
		await onSave(text)
		pop()
	}

	return (
		<Form
			navigationTitle='Edit Preview Text'
			actions={
				<ActionPanel>
					<Action.SubmitForm title='Save' icon={Icon.Check} onSubmit={save} />
					<Action
						title='Speak This'
						icon={Icon.Play}
						shortcut={{ modifiers: ['cmd'], key: 'p' }}
						onAction={() => onSpeak(text)}
					/>
				</ActionPanel>
			}
		>
			<Form.TextArea
				id='previewText'
				title='Preview Text'
				placeholder={PREVIEW_SAMPLE}
				info='What ⌘P speaks when previewing a voice. Empty uses the built-in sample.'
				value={text}
				onChange={setText}
			/>
		</Form>
	)
}

export default function Command() {
	const { data: catalog, isLoading } = useCachedPromise(loadCatalog)
	const { data: active, revalidate: revalidateActive } = useCachedPromise(loadActive)
	const { data: phrase, revalidate: revalidatePhrase } = useCachedPromise(previewText)
	const [picked, setPicked] = useState<Filter>()

	const ready = catalog !== undefined && active !== undefined
	const browsing = picked ?? (ready ? seedFilter(catalog, active.backend) : { backend: DEFAULT_BACKEND, language: '' })
	const browsed = catalog?.find((entry) => entry.backend === browsing.backend)
	const backendTitle = BACKEND_TITLES[browsing.backend]

	const grouped = R.pipe(
		browsed?.voices ?? [],
		R.filter((voice) => browsing.language === ALL_LANGUAGES || voice.language === browsing.language),
		R.sortBy(qualityRank, (voice) => voice.name.toLowerCase()),
		R.groupBy(sectionOf),
	)

	const setActive = async (voice: Voice) => {
		await selectBackend(browsing.backend)
		await selectVoice(browsing.backend, voice.id)
		revalidateActive()
		await showToast({ style: Toast.Style.Success, title: `${voice.name} now reads via ${backendTitle}` })
		await popToRoot()
	}

	const reset = async () => {
		await clearVoice(browsing.backend)
		revalidateActive()
		await showToast({ style: Toast.Style.Success, title: `Back to the default ${backendTitle} voice` })
	}

	// Previewing narrates for real, so it takes over any narration already playing.
	const speak = async (voice: Voice, text: string) => {
		const toast = await showToast({ style: Toast.Style.Animated, title: `Previewing ${voice.name}…` })

		try {
			await playText(text, `${voice.name} preview`, { backend: browsing.backend, voice: voice.id })
			toast.style = Toast.Style.Success
			toast.title = `Previewing ${voice.name}`
		} catch (reason) {
			toast.style = Toast.Style.Failure
			toast.title = 'Could not preview'
			toast.message = errorMessage(reason)
		}
	}

	return (
		<List
			isLoading={isLoading}
			searchBarPlaceholder='Search voices…'
			searchBarAccessory={
				ready ? (
					<List.Dropdown
						tooltip='Backend and language'
						value={encodeFilter(browsing)}
						onChange={(value) => setPicked(decodeFilter(value))}
					>
						{R.map(catalog, (entry) => (
							<List.Dropdown.Section key={entry.backend} title={BACKEND_TITLES[entry.backend]}>
								<List.Dropdown.Item
									title='All languages'
									value={encodeFilter({ backend: entry.backend, language: ALL_LANGUAGES })}
								/>
								{R.map(languagesOf(entry.voices), (language) => (
									<List.Dropdown.Item
										key={language}
										title={languageName(language)}
										value={encodeFilter({ backend: entry.backend, language })}
									/>
								))}
							</List.Dropdown.Section>
						))}
					</List.Dropdown>
				) : undefined
			}
		>
			<List.EmptyView
				title={browsed?.error ? 'narrate failed' : 'No voices'}
				description={browsed?.error ?? `${backendTitle} has no voices for this language.`}
				icon={browsed?.error ? Icon.Warning : Icon.SpeakerOff}
			/>
			{R.map(SECTIONS, (section) => {
				const voices = grouped[section]
				if (!voices?.length) return null
				return (
					<List.Section key={section} title={section} subtitle={String(voices.length)}>
						{R.map(voices, (voice) => {
							const inUse = active?.backend === browsing.backend && active.voiceId === voice.id
							return (
								<List.Item
									key={voice.id}
									title={voice.name}
									subtitle={voice.id}
									icon={inUse ? Icon.CheckCircle : Icon.Circle}
									accessories={R.filter(
										[
											voice.gender ? { text: R.capitalize(voice.gender) } : undefined,
											voice.quality && voice.quality !== 'default' ? { text: R.capitalize(voice.quality) } : undefined,
											browsing.language === ALL_LANGUAGES && voice.language
												? { text: languageName(voice.language) }
												: undefined,
											inUse ? { tag: 'in use' } : undefined,
										],
										R.isDefined,
									)}
									actions={
										<ActionPanel>
											<Action title='Set as Active Voice' icon={Icon.CheckCircle} onAction={() => setActive(voice)} />
											<Action
												title='Preview'
												icon={Icon.Play}
												shortcut={{ modifiers: ['cmd'], key: 'p' }}
												onAction={() => speak(voice, phrase ?? PREVIEW_SAMPLE)}
											/>
											<Action.Push
												title='Edit Preview Text'
												icon={Icon.Pencil}
												shortcut={{ modifiers: ['cmd'], key: 'e' }}
												target={
													<PreviewTextForm
														initial={phrase ?? PREVIEW_SAMPLE}
														onSpeak={(text) => speak(voice, text)}
														onSave={async (text) => {
															await setPreviewText(text)
															revalidatePhrase()
														}}
													/>
												}
											/>
											<Action
												title={`Use the Default ${backendTitle} Voice`}
												icon={Icon.Undo}
												shortcut={{ modifiers: ['cmd', 'shift'], key: 'backspace' }}
												onAction={reset}
											/>
										</ActionPanel>
									}
								/>
							)
						})}
					</List.Section>
				)
			})}
		</List>
	)
}
