import { type EditorView, WidgetType } from '@codemirror/view'

type WidgetSpec<T> = {
	/** Whether two widget values are equal — lets CodeMirror reuse the DOM instead of re-rendering. */
	eq: (a: T, b: T) => boolean
	toDOM: (value: T, view: EditorView) => HTMLElement
	/** Default: ignore all events (the widget is inert chrome). Return false for events CM should handle. */
	ignoreEvent?: (event: Event) => boolean
}

/**
 * Functional factory around CodeMirror's class-based `WidgetType` — the one framework-mandated class,
 * confined here so feature code stays class-free. Returns a `(value) => WidgetType` builder.
 */
export const defineWidget = <T>(spec: WidgetSpec<T>) => {
	class FunctionalWidget extends WidgetType {
		constructor(readonly value: T) {
			super()
		}
		eq(other: FunctionalWidget) {
			return spec.eq(this.value, other.value)
		}
		toDOM(view: EditorView) {
			return spec.toDOM(this.value, view)
		}
		ignoreEvent(event: Event) {
			return spec.ignoreEvent ? spec.ignoreEvent(event) : true
		}
	}
	return (value: T) => new FunctionalWidget(value)
}
