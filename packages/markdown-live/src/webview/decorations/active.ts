import type { EditorState } from '@codemirror/state'
import type { Transaction } from '@codemirror/state'

/**
 * Whether any selection range touches `[from, to]`. Used as the "reveal to edit" test: when the
 * cursor is inside a rendered block (code/callout/table/mermaid) we skip its widget and show the
 * raw, editable markdown instead.
 */
export const selectionTouches = (state: EditorState, from: number, to: number) =>
	state.selection.ranges.some((range) => range.from <= to && range.to >= from)

/** True when a transaction changed the document or the selection — the triggers for rebuilding decorations. */
export const docOrSelectionChanged = (transaction: Transaction) =>
	transaction.docChanged || !transaction.startState.selection.eq(transaction.state.selection)
