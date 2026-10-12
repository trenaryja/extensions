import { createConfig } from '@repo/vscode-utils'
import { configSchema } from './config.schema'

/**
 * Typed, runtime-validated config accessor derived from the Zod SSOT. Not merged into
 * `config.schema.ts`: `createConfig` reaches the `vscode` namespace, and the contributes codegen
 * imports the schema from a plain bun process where that import would throw.
 */
export const getConfig = createConfig(configSchema)
