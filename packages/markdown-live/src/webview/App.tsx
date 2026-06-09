import { Markdown, type MarkdownStorage } from 'tiptap-markdown'
import Image from '@tiptap/extension-image'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'

declare const acquireVsCodeApi: () => {
	postMessage: (msg: unknown) => void
	getState: () => unknown
	setState: (state: unknown) => void
}

const vscode = acquireVsCodeApi()

type ExtensionMessage = { type: 'update'; content: string }

export function App() {
	const sendTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
	// Ensures we only send 'ready' once, even if the editor instance changes.
	const initialized = useRef(false)

	const editor = useEditor({
		extensions: [
			StarterKit,
			Image,
			Markdown.configure({
				html: false,
				transformPastedText: true,
				transformCopiedText: false,
			}),
		],
		content: '',
		editorProps: {
			attributes: {
				class: 'markdown-live-editor',
				spellcheck: 'true',
			},
		},
		onUpdate({ editor }) {
			if (sendTimeout.current) clearTimeout(sendTimeout.current)
			sendTimeout.current = setTimeout(() => {
				// biome-ignore lint/suspicious/noExplicitAny: tiptap-markdown adds storage.markdown at runtime, not reflected in TipTap's Storage type
				const markdown = ((editor.storage as Record<string, any>).markdown as MarkdownStorage).getMarkdown()
				vscode.postMessage({ type: 'edit', content: markdown })
			}, 300)
		},
	})

	// Signal ready and auto-focus once, when the editor first mounts.
	useEffect(() => {
		if (!editor || initialized.current) return
		initialized.current = true
		vscode.postMessage({ type: 'ready' })
		editor.commands.focus()
	}, [editor])

	// Flush pending debounce on unmount so no edits are lost.
	useEffect(() => {
		return () => {
			if (sendTimeout.current) clearTimeout(sendTimeout.current)
		}
	}, [])

	// Apply incoming content updates from the extension.
	// setContent(content, false) suppresses onUpdate so we don't echo back.
	useEffect(() => {
		const handler = (event: MessageEvent<ExtensionMessage>) => {
			if (event.data.type !== 'update') return
			if (!editor) return
			editor.commands.setContent(event.data.content, { emitUpdate: false })
		}
		window.addEventListener('message', handler)
		return () => window.removeEventListener('message', handler)
	}, [editor])

	return (
		<>
			<style>{editorStyles}</style>
			<EditorContent editor={editor} />
		</>
	)
}

const editorStyles = `
.markdown-live-editor {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 3rem;
  min-height: 100vh;
  outline: none;
  line-height: 1.6;
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-editor-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  font-size: var(--vscode-editor-font-size, 14px);
}

.markdown-live-editor h1 { font-size: 2em; font-weight: 700; margin: 1em 0 0.5em; }
.markdown-live-editor h2 { font-size: 1.5em; font-weight: 600; margin: 1em 0 0.5em; }
.markdown-live-editor h3 { font-size: 1.25em; font-weight: 600; margin: 1em 0 0.5em; }
.markdown-live-editor h4 { font-size: 1.1em; font-weight: 600; margin: 1em 0 0.5em; }
.markdown-live-editor h5, .markdown-live-editor h6 { font-size: 1em; font-weight: 600; margin: 1em 0 0.5em; }

.markdown-live-editor p { margin: 0.5em 0; }

.markdown-live-editor ul, .markdown-live-editor ol {
  padding-left: 1.5em;
  margin: 0.5em 0;
}
.markdown-live-editor li { margin: 0.25em 0; }
.markdown-live-editor li::marker { color: var(--vscode-editor-foreground); }

.markdown-live-editor strong { font-weight: 700; }
.markdown-live-editor em { font-style: italic; }

.markdown-live-editor code {
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 0.9em;
  background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15));
  border-radius: 3px;
  padding: 0.1em 0.35em;
}

.markdown-live-editor pre {
  background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15));
  border-radius: 4px;
  padding: 1em;
  overflow-x: auto;
  margin: 0.75em 0;
}
.markdown-live-editor pre code {
  background: transparent;
  padding: 0;
}

.markdown-live-editor blockquote {
  border-left: 3px solid var(--vscode-activityBarBadge-background, #007acc);
  padding-left: 1em;
  margin: 0.75em 0;
  opacity: 0.8;
}

.markdown-live-editor hr {
  border: none;
  border-top: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.3));
  margin: 1.5em 0;
}

.markdown-live-editor img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

.markdown-live-editor a {
  color: var(--vscode-textLink-foreground, #007acc);
  text-decoration: underline;
}

.markdown-live-editor ::selection {
  background: var(--vscode-editor-selectionBackground);
}

.markdown-live-editor .ProseMirror-focused { outline: none; }
`
