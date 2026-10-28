import type { Extension } from '@codemirror/state'
import { blocksPlugin } from './blocks'
import { calloutsPlugin } from './callouts'
import { codeHoverTools } from './codeblocks'
import { inlineDecorationsPlugin } from './inline'
import { mathPlugin } from './math'
import type { MermaidRenderMode } from './mermaid'
import { createMermaidPlugin } from './mermaid'
import { tablesPlugin } from './tables'
import { treeBlocksPlugin } from './treeBlocks'

export function createDecorationExtensions(getMode: () => MermaidRenderMode): Extension[] {
	return [
		// StateFields first (own multi-line replace ranges)
		calloutsPlugin,
		createMermaidPlugin(getMode),
		tablesPlugin,
		mathPlugin,
		// ViewPlugins (line/mark decos only)
		blocksPlugin,
		// Tree-driven structural rendering (headings, lists, tasks, code blocks) — works inside callouts too.
		treeBlocksPlugin,
		inlineDecorationsPlugin,
		codeHoverTools,
	]
}
