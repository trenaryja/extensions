import { createCliSummarizer } from './shared'

// opencode prints its `> build · <model>` banner to stderr, so stdout needs no cleanup.
export const opencodeSummarizer = createCliSummarizer('opencode', ['opencode', 'run', '-m', 'opencode/big-pickle'])
