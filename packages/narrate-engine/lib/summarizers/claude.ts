import { createCliSummarizer } from './shared'

// Thinking off and the ambient config stripped: 14-62 s per summary drops to 3-5 s at 8x lower
// cost, measured on real transcript messages, with no loss of summary quality.
// `--tools` is variadic, so its empty value must stay last or it swallows the flags after it.
export const claudeSummarizer = createCliSummarizer(
	'claude',
	[
		'claude',
		'-p',
		'--output-format',
		'text',
		'--model',
		'haiku',
		'--strict-mcp-config',
		'--mcp-config',
		'{"mcpServers":{}}',
		'--setting-sources',
		'',
		'--tools',
		'',
	],
	{ MAX_THINKING_TOKENS: '0' },
)
