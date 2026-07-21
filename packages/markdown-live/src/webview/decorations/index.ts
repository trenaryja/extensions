import type { Extension } from '@codemirror/state'
import { inlineDecorationsPlugin } from './inline'
import { blocksPlugin } from './blocks'
import { codeScrollSync } from './codeblocks'
import { treeBlocksPlugin } from './treeBlocks'
import { tablesPlugin } from './tables'
import { calloutsPlugin } from './callouts'
import { createMermaidPlugin, type MermaidRenderMode } from './mermaid'
import { mathPlugin } from './math'

export function createDecorationExtensions(getMode: () => MermaidRenderMode): Extension[] {
	return [
		// StateFields first (own multi-line replace ranges)
		calloutsPlugin,
		createMermaidPlugin(getMode),
		tablesPlugin,
		mathPlugin,
		// ViewPlugins (line/mark decos only)
		blocksPlugin,
		// Tree-driven structural rendering (headings, lists, tasks, fenced code) — works inside callouts too.
		treeBlocksPlugin,
		inlineDecorationsPlugin,
		codeScrollSync,
	]
}
