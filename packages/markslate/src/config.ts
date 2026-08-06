import { createConfig } from '@repo/vscode-utils'
import { configSchema } from './config.schema'

/** Typed, runtime-validated config accessor derived from the Zod SSOT. */
export const getConfig = createConfig(configSchema)
