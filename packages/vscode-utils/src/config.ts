import { z } from 'zod'

/** VS Code-specific fields that sit alongside a setting's generated JSON Schema. */
export type SettingMeta = {
	description?: string
	markdownDescription?: string
	scope?: 'application' | 'machine' | 'machine-overridable' | 'window' | 'resource' | 'language-overridable'
	order?: number
	enumDescriptions?: string[]
	markdownEnumDescriptions?: string[]
	deprecationMessage?: string
	markdownDeprecationMessage?: string
}

/**
 * Attach VS Code configuration metadata to a Zod schema. Typed (not blind `.meta()` passthrough),
 * so you can't accidentally clobber core JSON Schema keywords like `type`.
 */
export const setting = <T extends z.ZodType>(schema: T, meta: SettingMeta = {}) => schema.meta(meta)

/** The shape of a config SSOT: a flat object keyed by fully-qualified setting id. */
export type ConfigSchema = z.ZodObject

/** Turn a Zod object schema into a `contributes.configuration` block for package.json. */
export const configToContributes = (schema: ConfigSchema, title: string) => ({
	title,
	properties: z.toJSONSchema(schema, { io: 'input' }).properties,
})
