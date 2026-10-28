import { Catalog, createSearch } from './search'

type Bridge = { picking: () => boolean; pick: (drawable: string) => void }

const isBridge = (value: unknown): value is Bridge =>
	typeof value === 'object' &&
	value !== null &&
	'picking' in value &&
	'pick' in value &&
	typeof value.picking === 'function' &&
	typeof value.pick === 'function'

/** Injected by PickerActivity; absent when the page is opened outside the app. */
const injected: unknown = Reflect.get(window, 'Glyphary')
const bridge = isBridge(injected) ? injected : undefined
const cellWidth = 88
const cellHeight = 104

const element = <T extends Element>(selector: string, type: new () => T) => {
	const found = document.querySelector(selector)
	if (!(found instanceof type)) throw new TypeError(`${selector} missing from index.html`)
	return found
}

const search = element('#search', HTMLInputElement)
const setSelect = element('#set', HTMLSelectElement)
const count = element('#count', HTMLElement)
const grid = element('#grid', HTMLElement)
const toast = element('#toast', HTMLElement)
const toastText = element('#toast > .alert', HTMLElement)

const catalog = Catalog.parse(await (await fetch('/icons.json')).json())
const index = createSearch(catalog)
setSelect.append(
	new Option(`All sets (${index.names.length.toLocaleString()})`, ''),
	...catalog.sets.map((set, setIndex) => new Option(`${set.name} (${set.icons.length})`, String(setIndex))),
)

let matches: number[] = []
/** Keyed by result position; a cell kept across scrolls keeps its image, which Java would otherwise re-render. */
let cells = new Map<number, HTMLElement>()

const clearCells = () => {
	for (const button of cells.values()) button.remove()
	cells = new Map()
}

const showToast = (text: string) => {
	toastText.textContent = text
	toast.classList.remove('hidden')
	setTimeout(() => toast.classList.add('hidden'), 1500)
}

const choose = (drawable: string) => (bridge?.picking() ? bridge.pick(drawable) : showToast(drawable))

const cell = (position: number, columns: number, width: number) => {
	const drawable = index.names[matches[position] ?? -1]
	if (drawable === undefined) throw new Error(`No icon at result ${position}`)
	const button = document.createElement('button')
	button.className = 'btn btn-ghost absolute h-auto flex-col flex-nowrap justify-start gap-1 px-1 py-2 font-normal'
	Object.assign(button.style, {
		left: `${(position % columns) * width}px`,
		top: `${Math.floor(position / columns) * cellHeight}px`,
		width: `${width}px`,
		height: `${cellHeight}px`,
	})
	button.innerHTML = `<img src="/icon/${drawable}" width="48" height="48" alt="" /><span class="line-clamp-2 text-[10px] break-all opacity-60">${drawable}</span>`
	button.addEventListener('click', () => choose(drawable))
	return button
}

/** Only rows near the viewport exist in the DOM; 51k buttons at once stalls the WebView. */
const render = () => {
	const columns = Math.max(1, Math.floor(grid.clientWidth / cellWidth))
	const width = grid.clientWidth / columns
	grid.style.height = `${Math.ceil(matches.length / columns) * cellHeight}px`
	const firstRow = Math.max(0, Math.floor((window.scrollY - grid.offsetTop) / cellHeight) - 2)
	const lastRow = firstRow + Math.ceil(window.innerHeight / cellHeight) + 4
	const visible = new Map<number, HTMLElement>()
	for (let position = firstRow * columns; position < Math.min(matches.length, lastRow * columns); position++)
		visible.set(position, cells.get(position) ?? cell(position, columns, width))
	for (const [position, button] of cells) if (!visible.has(position)) button.remove()
	grid.append(...[...visible].filter(([position]) => !cells.has(position)).map(([, button]) => button))
	cells = visible
}

const filter = () => {
	matches = index.search(search.value, setSelect.value ? Number(setSelect.value) : undefined)
	count.textContent = `${matches.length.toLocaleString()} ${matches.length === 1 ? 'icon' : 'icons'}`
	clearCells()
	window.scrollTo({ top: 0 })
	render()
}

let pending = 0

/** One search per frame, however fast the keyboard fires. */
const scheduleFilter = () => {
	cancelAnimationFrame(pending)
	pending = requestAnimationFrame(filter)
}

search.addEventListener('input', scheduleFilter)
search.addEventListener('keydown', (e) => e.key === 'Enter' && search.blur())
setSelect.addEventListener('change', filter)
window.addEventListener('scroll', render, { passive: true })
window.addEventListener('resize', () => {
	clearCells()
	render()
})
filter()
