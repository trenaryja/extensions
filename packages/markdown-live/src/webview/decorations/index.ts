import type { Extension } from '@codemirror/state'
import { inlineDecorationsPlugin } from './inline'
import { blocksPlugin } from './blocks'
import { codeRenderPlugin } from './codeblocks'
import { treeBlocksPlugin } from './treeBlocks'
import { tablesPlugin } from './tables'
import { calloutsPlugin } from './callouts'
import { createMermaidPlugin, type MermaidRenderMode } from './mermaid'
import { mathPlugin } from './math'

export function createDecorationExtensions(getMode: () => MermaidRenderMode): Extension[] {
	return [
		// StateFields first (own multi-line replace ranges)
		calloutsPlugin,
		codeRenderPlugin,
		createMermaidPlugin(getMode),
		tablesPlugin,
		mathPlugin,
		// ViewPlugins (line/mark decos only)
		blocksPlugin,
		// Tree-driven structural rendering (headings, lists, tasks, editable code chrome) — works in callouts too.
		treeBlocksPlugin,
		inlineDecorationsPlugin,
	]
}
