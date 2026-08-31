import { Facet } from '@codemirror/state'
import type { EditorState, Transaction } from '@codemirror/state'

export type SourceRange = { from: number; to: number }

// Ranges currently shown as raw markdown source (e.g. a revealed table). Decoration plugins read this and
// skip these ranges, so the source stays byte-accurate — no inline styling, no hidden syntax delimiters.
export const rawSourceRanges = Facet.define<readonly SourceRange[], readonly SourceRange[]>({
	combine: (values) => values.flat(),
})

export const inRawSource = (ranges: readonly SourceRange[], from: number, to: number) =>
	ranges.some((range) => from < range.to && to > range.from)

/**
 * Whether any selection range touches `[from, to]`. Used as the "reveal to edit" test: when the
 * cursor is inside a rendered block (code/callout/table/mermaid) we skip its widget and show the
 * raw, editable markdown instead.
 */
export const selectionTouches = (state: EditorState, from: number, to: number) =>
	state.selection.ranges.some((range) => range.from <= to && range.to >= from)

/**
 * Like {@link selectionTouches}, but only for non-empty (ranged) selections — a bare caret doesn't count.
 * Tables use this so a plain click never flips them into raw-source mode; the source is revealed only on a
 * deliberate selection (drag-select, or the "Edit source" action, which selects the table's range).
 */
export const selectionRangeTouches = (state: EditorState, from: number, to: number) =>
	state.selection.ranges.some((range) => range.from < range.to && range.from <= to && range.to >= from)

/** True when a transaction changed the document or the selection — the triggers for rebuilding decorations. */
export const docOrSelectionChanged = (transaction: Transaction) =>
	transaction.docChanged || !transaction.startState.selection.eq(transaction.state.selection)
