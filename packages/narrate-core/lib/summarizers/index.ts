import type { Summarizer, SummarizerId } from '../types'
import { claudeSummarizer } from './claude'
import { opencodeSummarizer } from './opencode'

export const summarizers: Record<SummarizerId, Summarizer> = {
	claude: claudeSummarizer,
	opencode: opencodeSummarizer,
}

export const getSummarizer = (id: SummarizerId) => summarizers[id]
