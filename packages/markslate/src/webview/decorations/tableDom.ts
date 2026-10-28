import type { Cell } from './tableMachine'

export const cellTd = (table: HTMLElement, cell: Cell) => {
	const row =
		cell.row < 0 ? table.querySelector(':scope thead tr') : table.querySelectorAll(':scope tbody tr')[cell.row]
	const td = row?.children[cell.col]
	return td instanceof HTMLElement ? td : undefined
}

export const cellContentEl = (table: HTMLElement, cell: Cell) =>
	cellTd(table, cell)?.querySelector<HTMLElement>('.md-td-content')

const placeCaret = (el: HTMLElement, toStart: boolean) => {
	const range = document.createRange()
	range.selectNodeContents(el)
	range.collapse(toStart)
	const selection = window.getSelection()
	selection?.removeAllRanges()
	selection?.addRange(range)
}

export const placeCaretEnd = (el: HTMLElement) => placeCaret(el, false)
export const placeCaretStart = (el: HTMLElement) => placeCaret(el, true)

// Is the caret at the very start / end of this editing cell? Range-based, so it holds regardless of whether the
// browser anchored the caret in the text node or on the element (e.g. right after we collapse it to the end).
const caretAtEdge = (el: HTMLElement, atStart: boolean) => {
	const selection = window.getSelection()
	if (!selection?.isCollapsed || !selection.anchorNode || !el.contains(selection.anchorNode)) return false
	const range = document.createRange()
	range.selectNodeContents(el)
	if (atStart) range.setEnd(selection.anchorNode, selection.anchorOffset)
	else range.setStart(selection.anchorNode, selection.anchorOffset)
	return range.toString().length === 0 // nothing between the caret and that edge
}

export const caretAtStart = (el: HTMLElement) => caretAtEdge(el, true)
export const caretAtEnd = (el: HTMLElement) => caretAtEdge(el, false)
