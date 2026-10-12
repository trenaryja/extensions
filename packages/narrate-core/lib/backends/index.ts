import type { BackendId, SpeechBackend } from '../types'
import { kokoroBackend } from './kokoro'
import { sayBackend } from './say'

export { stopWorker, workerStatus } from './kokoro'

export const backends: Record<BackendId, SpeechBackend> = { kokoro: kokoroBackend, say: sayBackend }

export const getBackend = (id: BackendId) => backends[id]
