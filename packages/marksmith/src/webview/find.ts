import {
	closeSearchPanel,
	findNext,
	findPrevious,
	getSearchQuery,
	highlightSelectionMatches,
	openSearchPanel,
	replaceAll,
	replaceNext,
	search,
	SearchQuery,
	searchKeymap,
	setSearchQuery,
} from '@codemirror/search'
import { Prec } from '@codemirror/state'
import { EditorView, keymap, type Panel } from '@codemirror/view'
import { countMatches } from './searchMatches'

// VS Code-style find/replace widget: a custom @codemirror/search panel that floats top-right like the
// native one, themed with --vscode-* variables and codicons. Mod+F opens find, Mod+Alt+F opens replace.

const showReplaceApi = new WeakMap<EditorView, (show: boolean) => void>()

/** Open the find panel; also the window-level fallback for when focus is outside the editor. */
export const openFind = (view: EditorView, withReplace = false) => {
	openSearchPanel(view)
	if (withReplace) showReplaceApi.get(view)?.(true)
	return true
}

const iconButton = (name: string, title: string, onClick: () => void) => {
	const button = document.createElement('button')
	button.type = 'button'
	button.title = title
	button.className = `md-find-button codicon codicon-${name}`
	// Keep focus in the find input while clicking widget controls.
	button.addEventListener('mousedown', (event) => event.preventDefault())
	button.addEventListener('click', onClick)
	return button
}

function createFindPanel(view: EditorView): Panel {
	const initial = getSearchQuery(view.state)

	const field = (placeholder: string) => {
		const input = document.createElement('input')
		input.className = 'md-find-input'
		input.placeholder = placeholder
		input.setAttribute('aria-label', placeholder)
		return input
	}
	const findInput = field('Find')
	findInput.setAttribute('main-field', 'true')
	const replaceInput = field('Replace')

	const flag = (name: string, title: string, on: boolean) => {
		const button = iconButton(name, title, () => {
			button.classList.toggle('md-find-flag-on')
			commit()
		})
		button.classList.add('md-find-flag')
		button.classList.toggle('md-find-flag-on', on)
		return {
			button,
			get on() {
				return button.classList.contains('md-find-flag-on')
			},
			set on(value: boolean) {
				button.classList.toggle('md-find-flag-on', value)
			},
		}
	}
	const caseFlag = flag('case-sensitive', 'Match Case', initial.caseSensitive)
	const wordFlag = flag('whole-word', 'Match Whole Word', initial.wholeWord)
	const regexpFlag = flag('regex', 'Use Regular Expression', initial.regexp)

	const count = document.createElement('span')
	count.className = 'md-find-count'

	const refresh = () => {
		const query = getSearchQuery(view.state)
		const { total, current } = countMatches(view.state, query)
		count.textContent = !query.search
			? ''
			: total === 0
				? 'No results'
				: current
					? `${current} of ${total}`
					: `${total} found`
		findBox.classList.toggle('md-find-invalid', !!query.search && !query.valid)
	}

	const commit = () => {
		const next = new SearchQuery({
			search: findInput.value,
			replace: replaceInput.value,
			caseSensitive: caseFlag.on,
			wholeWord: wordFlag.on,
			regexp: regexpFlag.on,
			literal: !regexpFlag.on,
		})
		if (!next.eq(getSearchQuery(view.state))) view.dispatch({ effects: setSearchQuery.of(next) })
		else refresh()
	}

	const box = (input: HTMLInputElement, ...flags: HTMLElement[]) => {
		const container = document.createElement('div')
		container.className = 'md-find-box'
		container.append(input, ...flags)
		return container
	}
	const findBox = box(findInput, caseFlag.button, wordFlag.button, regexpFlag.button)

	const close = () => {
		closeSearchPanel(view)
		view.focus()
	}
	const onFieldKey = (event: KeyboardEvent, onEnter: () => void, onShiftEnter = onEnter) => {
		if (event.key === 'Enter') {
			event.preventDefault()
			;(event.shiftKey ? onShiftEnter : onEnter)()
		}
		if (event.key === 'Escape') {
			event.preventDefault()
			close()
		}
	}
	findInput.addEventListener('keydown', (event) =>
		onFieldKey(
			event,
			() => findNext(view),
			() => findPrevious(view),
		),
	)
	replaceInput.addEventListener('keydown', (event) => onFieldKey(event, () => replaceNext(view)))
	findInput.addEventListener('input', commit)
	replaceInput.addEventListener('input', commit)

	const findRow = document.createElement('div')
	findRow.className = 'md-find-row'
	findRow.append(
		findBox,
		count,
		iconButton('arrow-up', 'Previous Match (⇧Enter)', () => findPrevious(view)),
		iconButton('arrow-down', 'Next Match (Enter)', () => findNext(view)),
		iconButton('close', 'Close (Escape)', close),
	)

	const replaceRow = document.createElement('div')
	replaceRow.className = 'md-find-row md-find-replace-row'
	replaceRow.append(
		box(replaceInput),
		iconButton('replace', 'Replace', () => replaceNext(view)),
		iconButton('replace-all', 'Replace All', () => replaceAll(view)),
	)

	const rows = document.createElement('div')
	rows.className = 'md-find-rows'
	rows.append(findRow, replaceRow)

	const wrap = document.createElement('div')
	wrap.className = 'md-find'
	const setReplace = (show: boolean) => {
		wrap.classList.toggle('md-find-replacing', show)
		sash.classList.toggle('codicon-chevron-right', !show)
		sash.classList.toggle('codicon-chevron-down', show)
	}
	const sash = iconButton('chevron-right', 'Toggle Replace', () =>
		setReplace(!wrap.classList.contains('md-find-replacing')),
	)
	sash.classList.add('md-find-sash')
	showReplaceApi.set(view, setReplace)
	wrap.append(sash, rows)

	findInput.value = initial.search
	replaceInput.value = initial.replace ?? ''

	return {
		dom: wrap,
		top: true,
		mount: () => {
			findInput.focus()
			findInput.select()
			refresh()
		},
		update: (update) => {
			let queryChanged = false
			for (const transaction of update.transactions)
				for (const effect of transaction.effects)
					if (effect.is(setSearchQuery)) {
						queryChanged = true
						const query = effect.value
						if (query.search !== findInput.value) findInput.value = query.search
						if ((query.replace ?? '') !== replaceInput.value) replaceInput.value = query.replace ?? ''
						caseFlag.on = query.caseSensitive
						wordFlag.on = query.wholeWord
						regexpFlag.on = query.regexp
					}
			if (queryChanged || update.docChanged || update.selectionSet) refresh()
		},
	}
}

const findTheme = EditorView.theme({
	'.cm-panels': { background: 'transparent' },
	'.cm-panels-top': {
		position: 'absolute',
		top: '0',
		right: '1.25rem',
		left: 'auto',
		zIndex: '300',
		borderBottom: 'none',
	},
	'.md-find': {
		display: 'flex',
		alignItems: 'stretch',
		gap: '2px',
		padding: '4px 4px 4px 0',
		background: 'var(--vscode-editorWidget-background, #252526)',
		color: 'var(--vscode-editorWidget-foreground, var(--vscode-editor-foreground, #ccc))',
		border: '1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.35))',
		borderTop: 'none',
		borderRadius: '0 0 4px 4px',
		boxShadow: '0 2px 8px var(--vscode-widget-shadow, rgba(0,0,0,0.36))',
		fontSize: '12px',
	},
	'.md-find-rows': { display: 'flex', flexDirection: 'column', gap: '4px' },
	'.md-find-row': { display: 'flex', alignItems: 'center', gap: '3px' },
	'.md-find-replace-row': { display: 'none' },
	'.md-find-replacing .md-find-replace-row': { display: 'flex' },
	'.md-find-box': {
		display: 'flex',
		alignItems: 'center',
		gap: '1px',
		paddingRight: '2px',
		width: '220px',
		background: 'var(--vscode-input-background, rgba(128,128,128,0.15))',
		color: 'var(--vscode-input-foreground, inherit)',
		border: '1px solid var(--vscode-input-border, transparent)',
		borderRadius: '2px',
	},
	'.md-find-box:focus-within': { borderColor: 'var(--vscode-focusBorder, #007fd4)' },
	'.md-find-invalid, .md-find-invalid:focus-within': {
		borderColor: 'var(--vscode-inputValidation-errorBorder, #be1100)',
	},
	'.md-find-input': {
		flex: '1',
		minWidth: '0',
		padding: '3px 4px',
		background: 'transparent',
		color: 'inherit',
		border: 'none',
		outline: 'none',
		fontSize: '12px',
		fontFamily: 'inherit',
	},
	'.md-find-button': {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: '20px',
		height: '20px',
		flex: 'none',
		padding: '0',
		background: 'transparent',
		color: 'inherit',
		border: 'none',
		borderRadius: '4px',
		cursor: 'pointer',
		fontSize: '14px',
	},
	'.md-find-button:hover': { background: 'var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2))' },
	'.md-find-flag-on, .md-find-flag-on:hover': {
		background: 'var(--vscode-inputOption-activeBackground, rgba(0,127,212,0.4))',
		color: 'var(--vscode-inputOption-activeForeground, inherit)',
		outline: '1px solid var(--vscode-inputOption-activeBorder, transparent)',
	},
	'.md-find-sash': {
		width: '14px',
		height: 'auto',
		alignSelf: 'stretch',
		borderRadius: '0 0 0 4px',
		fontSize: '12px',
	},
	'.md-find-count': { minWidth: '56px', padding: '0 2px', textAlign: 'center', whiteSpace: 'nowrap', opacity: '0.9' },
	'.cm-searchMatch': { background: 'var(--vscode-editor-findMatchHighlightBackground, rgba(234,92,0,0.33))' },
	'.cm-searchMatch-selected': {
		background: 'var(--vscode-editor-findMatchBackground, rgba(245,152,66,0.6))',
		outline: '1px solid var(--vscode-editor-findMatchBorder, transparent)',
	},
	'.cm-selectionMatch': { background: 'var(--vscode-editor-selectionHighlightBackground, rgba(128,128,128,0.25))' },
})

export const marksmithFind = [
	Prec.high(keymap.of([...searchKeymap, { key: 'Mod-Alt-f', run: (view) => openFind(view, true) }])),
	search({
		top: true,
		createPanel: createFindPanel,
		scrollToMatch: (range) => EditorView.scrollIntoView(range, { y: 'nearest', yMargin: 64 }),
	}),
	highlightSelectionMatches(),
	findTheme,
]
