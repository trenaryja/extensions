import type { EditorView } from '@codemirror/view'
import { copyMarkdown } from './tableClipboard'
import type { Cell } from './tableMachine'
import type { TableModel } from './tableModel'
import { deleteColumn, deleteRow, deleteTable, insertColumn, insertRow, rewrite, setAlign } from './tableModel'
import { revealSource } from './tableSession'

let currentMenu: { el: HTMLElement; cleanup: () => void } | null = null

const closeMenu = () => {
	currentMenu?.el.remove()
	currentMenu?.cleanup()
	currentMenu = null
}

type MenuItem = 'separator' | { label: string; icon: string; danger?: boolean; onClick: () => void }

// Every menu action rewrites one table.
type MenuCtx = { view: EditorView; model: TableModel }

// Position a menu below-left of an element (used by the grip handles); right-click uses the pointer instead.
const anchorPos = (el: HTMLElement) => {
	const rect = el.getBoundingClientRect()
	return { x: rect.left, y: rect.bottom + 4 }
}

function openMenu(view: EditorView, at: { x: number; y: number }, items: MenuItem[]) {
	closeMenu()
	const menu = document.createElement('div')
	menu.className = 'md-table-menu'
	menu.contentEditable = 'false'

	for (const item of items) {
		if (item === 'separator') {
			const separator = document.createElement('div')
			separator.className = 'md-menu-sep'
			menu.append(separator)
			continue
		}

		const button = document.createElement('button')
		button.type = 'button'
		button.className = item.danger ? 'md-menu-item md-menu-danger' : 'md-menu-item'
		const icon = document.createElement('span')
		icon.className = `codicon codicon-${item.icon}`
		button.append(icon, document.createTextNode(item.label))
		button.addEventListener('click', (event) => {
			event.stopPropagation()
			const run = item.onClick
			closeMenu()
			run()
		})
		menu.append(button)
	}

	// Live inside the editor (so themed styles apply) but position: fixed to escape the table's scroll clip.
	view.dom.append(menu)
	menu.style.left = `${Math.max(8, Math.min(at.x, window.innerWidth - menu.offsetWidth - 8))}px`
	menu.style.top = `${Math.max(8, Math.min(at.y, window.innerHeight - menu.offsetHeight - 8))}px`

	const onDown = (event: Event) => {
		if (!(event.target instanceof Node) || !menu.contains(event.target)) closeMenu()
	}

	const onKey = (event: KeyboardEvent) => event.key === 'Escape' && closeMenu()
	document.addEventListener('pointerdown', onDown, { capture: true })
	document.addEventListener('keydown', onKey, { capture: true })
	currentMenu = {
		el: menu,
		cleanup: () => {
			document.removeEventListener('pointerdown', onDown, true)
			document.removeEventListener('keydown', onKey, true)
		},
	}
}

export const columnMenu = ({ view, model }: MenuCtx, anchor: HTMLElement, col: number) =>
	openMenu(view, anchorPos(anchor), [
		{ label: 'Insert left', icon: 'arrow-left', onClick: () => rewrite(view, model, insertColumn(model, col)) },
		{ label: 'Insert right', icon: 'arrow-right', onClick: () => rewrite(view, model, insertColumn(model, col + 1)) },
		'separator',
		{
			label: 'Align left',
			icon: 'arrow-small-left',
			onClick: () => rewrite(view, model, setAlign(model, col, 'left')),
		},
		{ label: 'Align center', icon: 'arrow-both', onClick: () => rewrite(view, model, setAlign(model, col, 'center')) },
		{
			label: 'Align right',
			icon: 'arrow-small-right',
			onClick: () => rewrite(view, model, setAlign(model, col, 'right')),
		},
		'separator',
		{
			label: 'Delete column',
			icon: 'trash',
			danger: true,
			onClick: () => rewrite(view, model, deleteColumn(model, col)),
		},
	])

export const rowMenu = ({ view, model }: MenuCtx, anchor: HTMLElement, rowIndex: number) =>
	openMenu(view, anchorPos(anchor), [
		{ label: 'Insert above', icon: 'arrow-up', onClick: () => rewrite(view, model, insertRow(model, rowIndex)) },
		{ label: 'Insert below', icon: 'arrow-down', onClick: () => rewrite(view, model, insertRow(model, rowIndex + 1)) },
		'separator',
		{
			label: 'Delete row',
			icon: 'trash',
			danger: true,
			onClick: () => rewrite(view, model, deleteRow(model, rowIndex)),
		},
	])

// The full right-click menu for a cell: row + column + alignment + table actions.
export function cellMenu({ view, model }: MenuCtx, at: { x: number; y: number }, { row, col }: Cell) {
	const deleteRowItem: MenuItem[] =
		row >= 0
			? [
					{
						label: 'Delete row',
						icon: 'trash',
						danger: true,
						onClick: () => rewrite(view, model, deleteRow(model, row)),
					},
				]
			: []
	openMenu(view, at, [
		{
			label: 'Insert row above',
			icon: 'arrow-up',
			onClick: () => rewrite(view, model, insertRow(model, Math.max(0, row))),
		},
		{
			label: 'Insert row below',
			icon: 'arrow-down',
			onClick: () => rewrite(view, model, insertRow(model, row + 1)),
		},
		'separator',
		{ label: 'Insert column left', icon: 'arrow-left', onClick: () => rewrite(view, model, insertColumn(model, col)) },
		{
			label: 'Insert column right',
			icon: 'arrow-right',
			onClick: () => rewrite(view, model, insertColumn(model, col + 1)),
		},
		'separator',
		{
			label: 'Align left',
			icon: 'arrow-small-left',
			onClick: () => rewrite(view, model, setAlign(model, col, 'left')),
		},
		{ label: 'Align center', icon: 'arrow-both', onClick: () => rewrite(view, model, setAlign(model, col, 'center')) },
		{
			label: 'Align right',
			icon: 'arrow-small-right',
			onClick: () => rewrite(view, model, setAlign(model, col, 'right')),
		},
		'separator',
		...deleteRowItem,
		{
			label: 'Delete column',
			icon: 'trash',
			danger: true,
			onClick: () => rewrite(view, model, deleteColumn(model, col)),
		},
		'separator',
		{ label: 'Copy as Markdown', icon: 'copy', onClick: () => copyMarkdown(model) },
		{ label: 'Edit source', icon: 'code', onClick: () => revealSource(view, model) },
		{ label: 'Delete table', icon: 'trash', danger: true, onClick: () => deleteTable(view, model) },
	])
}
