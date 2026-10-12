// `import x from './y.py' with { type: 'text' }` — how the compiled binary carries the Python worker.
declare module '*.py' {
	const source: string
	export default source
}

declare module '*.toml' {
	const source: string
	export default source
}
