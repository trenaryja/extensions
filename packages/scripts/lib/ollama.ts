import type { LiteralUnion } from 'type-fest'

export type OllamaModel = LiteralUnion<
	| 'codellama'
	| 'deepseek-coder-v2'
	| 'llama3.2:1b'
	| 'llama3.2'
	| 'mistral'
	| 'qwen2.5-coder:14b'
	| 'qwen2.5-coder:32b'
	| 'qwen2.5-coder:7b',
	string
>

export type Message = {
	role: 'assistant' | 'system' | 'user'
	content: string
}

const OLLAMA_CHAT_URL = 'http://localhost:11434/v1/chat/completions'
const OLLAMA_TAGS_URL = 'http://localhost:11434/api/tags'

/**
 * Check if Ollama is running and reachable
 */
export const isOllamaAvailable = async (): Promise<boolean> => {
	try {
		const response = await fetch(OLLAMA_TAGS_URL)
		return response.ok
	} catch {
		return false
	}
}

/**
 * Fetch locally installed Ollama models
 */
export const getInstalledModels = async (): Promise<string[]> => {
	try {
		const response = await fetch(OLLAMA_TAGS_URL)
		if (!response.ok) return []

		const data = (await response.json()) as {
			models: { name: string }[]
		}

		return data.models.map((m) => m.name)
	} catch {
		return []
	}
}

/**
 * Validate that a model is installed locally
 */
export const isModelInstalled = async (model: string): Promise<boolean> => {
	const models = await getInstalledModels()
	return models.some((m) => m === model || m.startsWith(`${model}:`))
}

/**
 * Send a chat completion request to Ollama
 */
export const chat = async (model: OllamaModel, messages: Message[], url = OLLAMA_CHAT_URL): Promise<string> => {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model, messages, stream: false }),
	})

	if (!response.ok) throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`)

	const data = (await response.json()) as {
		choices: { message: { content: string } }[]
	}

	const content = data.choices?.[0]?.message?.content?.trim()
	if (!content) throw new Error('Empty response from Ollama')
	return content
}

// 🚩 EXTRACTABLE: Ollama client — already exists in /Users/justin/Git/bin/lib/ollama/ollama.ts
// This version adds getInstalledModels() and isModelInstalled() which should be upstreamed.
