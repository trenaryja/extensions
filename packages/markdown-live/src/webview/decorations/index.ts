import type { Extension } from '@codemirror/state'
import { headingsPlugin } from './headings'
import { inlineDecorationsPlugin } from './inline'
import { blocksPlugin } from './blocks'
import { codeblocksPlugin } from './codeblocks'
import { listsPlugin } from './lists'
import { tasksPlugin } from './tasks'
import { tablesPlugin } from './tables'
import { calloutsPlugin } from './callouts'
import { createMermaidPlugin, type MermaidRenderMode } from './mermaid'

export function createDecorationExtensions(getMode: () => MermaidRenderMode): Extension[] {
	return [
		// StateFields first (own multi-line replace ranges)
		calloutsPlugin,
		codeblocksPlugin,
		createMermaidPlugin(getMode),
		tablesPlugin,
		// ViewPlugins (line/mark decos only)
		blocksPlugin,
		headingsPlugin,
		tasksPlugin,
		listsPlugin,
		inlineDecorationsPlugin,
	]
}
