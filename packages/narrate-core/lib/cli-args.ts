import * as R from 'remeda'

export type FlagKind = 'boolean' | 'number' | 'string'

export type FlagSpec = Record<string, FlagKind>

type FlagValue<Kind extends FlagKind> = Kind extends 'boolean' ? boolean : Kind extends 'number' ? number : string

export type ParsedArgs<Spec extends FlagSpec> = {
	flags: { [Key in keyof Spec as Spec[Key] extends 'boolean' ? Key : never]: boolean } & {
		[Key in keyof Spec as Spec[Key] extends 'boolean' ? never : Key]?: FlagValue<Spec[Key]>
	}
	positional: string[]
}

// A typo'd short flag (`-json`) would otherwise land in the positionals and be silently ignored.
const isDashed = (arg: string) => arg.length > 1 && arg.startsWith('-')

const coerce = (kind: Exclude<FlagKind, 'boolean'>, name: string, raw: string | undefined) => {
	if (raw === undefined) throw new Error(`--${name} requires a value`)
	if (kind === 'string') return raw
	const value = Number(raw)
	if (!Number.isFinite(value)) throw new Error(`--${name} expects a number, got: ${raw}`)
	return value
}

export const parseFlags = <Spec extends FlagSpec>(args: string[], spec: Spec): ParsedArgs<Spec> => {
	const flags: Record<string, boolean | number | string> = {}
	for (const [name, kind] of R.entries(spec)) if (kind === 'boolean') flags[name] = false
	const positional: string[] = []
	let index = 0

	while (index < args.length) {
		const arg = args[index]! // while-guard: index < args.length
		index += 1

		if (!arg.startsWith('--')) {
			if (isDashed(arg)) throw new Error(`unknown flag: ${arg}`)
			positional.push(arg)
			continue
		}

		const equals = arg.indexOf('=')
		const name = equals === -1 ? arg.slice(2) : arg.slice(2, equals)
		const inline = equals === -1 ? undefined : arg.slice(equals + 1)
		const kind = spec[name]
		if (!kind) throw new Error(`unknown flag: ${arg}`)

		if (kind === 'boolean') {
			if (inline !== undefined) throw new Error(`--${name} takes no value`)
			flags[name] = true
			continue
		}

		const raw = inline ?? args[index]
		if (inline === undefined) index += 1
		flags[name] = coerce(kind, name, raw)
	}

	// The mapped return type splits booleans from optionals; the accumulator can't be typed that way.
	return { flags: flags as ParsedArgs<Spec>['flags'], positional }
}

type PickIdOptions<Id extends string> = { fallback: Id; flag: string }

// Rejects a free-form flag value that isn't one of `ids`, keeping the union type intact.
export const pickId = <Id extends string>(
	ids: readonly Id[],
	value: string | undefined,
	{ fallback, flag }: PickIdOptions<Id>,
) => {
	if (value === undefined) return fallback
	const match = ids.find((id) => id === value)
	if (!match) throw new Error(`--${flag} must be one of: ${ids.join(', ')}`)
	return match
}
