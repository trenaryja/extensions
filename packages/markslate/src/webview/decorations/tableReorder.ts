import type { Axis } from './tableModel'
import { moveAt } from './tableModel'

// The index (0..cells.length) a pointer at `pos` would drop before, given each cell's start/end along one axis.
const dropIndexAt = (bounds: { start: number; end: number }[], pos: number) => {
	for (const [i, bound] of bounds.entries()) if (pos < (bound.start + bound.end) / 2) return i

	return bounds.length
}

type DragItem = { cells: HTMLElement[]; start: number; size: number }

// Every column (header cell + its data cells) or every data row, with its position along the drag axis.
// Captured at drag start — a drag makes no document edit until the drop, so the widget DOM is frozen and we
// can animate it freely with transforms.
function collectDragItems(table: HTMLElement, axis: Axis): DragItem[] {
	const rows = [...table.querySelectorAll<HTMLElement>(':scope tbody tr')]
	if (axis === 'row')
		return rows.map((tr) => {
			const rect = tr.getBoundingClientRect()
			return { cells: [tr], start: rect.top, size: rect.height }
		})
	const headers = [...table.querySelectorAll<HTMLElement>(':scope thead th')]
	return headers.map((th, col) => {
		const cells = [th, ...rows.map((tr) => tr.children[col])].filter((cell) => cell instanceof HTMLElement)
		const rect = th.getBoundingClientRect()
		return { cells, start: rect.left, size: rect.width }
	})
}

// Each item's target start after moving `from` before `to`, laid out edge-to-edge from the first item's start.
function targetStarts(items: Pick<DragItem, 'start' | 'size'>[], from: number, to: number) {
	const order = moveAt(items.keys().toArray(), from, to)
	const result: number[] = []
	let cursor = items[0]?.start ?? 0

	for (const index of order) {
		result[index] = cursor
		cursor += items[index]?.size ?? 0
	}

	return result
}

type CellMotion = { axis: Axis; motion: 'instant' | 'animated' }

const offsetCells = (cells: HTMLElement[], offset: number, { axis, motion }: CellMotion) => {
	for (const cell of cells) {
		cell.style.transition = motion === 'animated' ? 'transform 0.16s ease' : 'none'
		cell.style.transform = offset ? (axis === 'col' ? `translateX(${offset}px)` : `translateY(${offset}px)`) : ''
	}
}

export type ReorderContext = {
	handle: HTMLElement
	axis: Axis
	index: number
	frame: HTMLElement
	table: HTMLElement
	onClick: () => void
	commit: (to: number) => void
}

const axisPos = (axis: Axis, event: PointerEvent) => (axis === 'col' ? event.clientX : event.clientY)

// A grip either reorders its column/row or opens its menu. Dragging lifts the grabbed item to follow the
// pointer, slides the others aside to open a gap where it will land, and settles it into the gap on release —
// then commits the markdown rewrite (whose rebuilt DOM matches the settled layout, so there's no flash).
export function attachReorder({ handle, axis, index, frame, table, onClick, commit }: ReorderContext) {
	handle.addEventListener('pointerdown', (down) => {
		down.preventDefault()
		down.stopPropagation()
		handle.setPointerCapture(down.pointerId)
		const origin = axisPos(axis, down)
		let dragging = false
		let items: DragItem[] = []
		let drop = index

		const move = (event: PointerEvent) => {
			if (!dragging) {
				if (Math.abs(event.clientX - down.clientX) + Math.abs(event.clientY - down.clientY) < 4) return
				dragging = true
				items = collectDragItems(table, axis)
				frame.classList.add(`md-dragging-${axis}`)
				for (const cell of items[index]?.cells ?? []) cell.classList.add('md-drag-lift')
			}

			// grabbed item tracks the pointer
			offsetCells(items[index]?.cells ?? [], axisPos(axis, event) - origin, { axis, motion: 'instant' })
			drop = dropIndexAt(
				items.map((item) => ({ start: item.start, end: item.start + item.size })),
				axisPos(axis, event),
			)
			const targets = targetStarts(items, index, drop)
			for (const [i, item] of items.entries())
				if (i !== index) offsetCells(item.cells, (targets[i] ?? item.start) - item.start, { axis, motion: 'animated' })
		}

		const finishListeners = () => {
			handle.removeEventListener('pointermove', move)
			// mutual teardown: up/cancel call finishListeners, which must unbind them
			handle.removeEventListener('pointerup', up)
			// mutual teardown: up/cancel call finishListeners, which must unbind them
			handle.removeEventListener('pointercancel', cancel)
			if (handle.hasPointerCapture(down.pointerId)) handle.releasePointerCapture(down.pointerId)
		}

		const clearDrag = () => {
			frame.classList.remove(`md-dragging-${axis}`)

			for (const item of items)
				for (const cell of item.cells) {
					cell.style.transform = ''
					cell.style.transition = ''
					cell.classList.remove('md-drag-lift')
				}
		}

		// A drag can end without a pointerup — a touch/gesture interruption or the browser stealing the capture.
		// Reset so the widget isn't stranded in drag-visual state with the move/up listeners still attached.
		const cancel = () => {
			finishListeners()
			if (dragging) clearDrag()
		}

		const up = () => {
			finishListeners()
			if (!dragging) return void onClick()
			const targets = targetStarts(items, index, drop)
			// settle into the gap
			offsetCells(items[index]?.cells ?? [], (targets[index] ?? 0) - (items[index]?.start ?? 0), {
				axis,
				motion: 'animated',
			})
			const moved = drop !== index && drop !== index + 1
			setTimeout(() => {
				if (moved) return void commit(drop) // rewrite: the rebuilt DOM already matches the settled layout
				clearDrag()
			}, 170)
		}

		handle.addEventListener('pointermove', move)
		handle.addEventListener('pointerup', up)
		handle.addEventListener('pointercancel', cancel)
	})
}
