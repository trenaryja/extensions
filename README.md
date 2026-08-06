# vscode-extensions

Justin Trenary's VS Code extensions, in one Turborepo.

## Extensions

- [`markslate`](packages/markslate) — a live-preview markdown editor: tables, callouts, math, and mermaid diagrams, all editable in place
- [`multi-cursor-magic`](packages/multi-cursor-magic) — multi-cursor transformation tools for dates, numbers, geographic data, and more · [Marketplace](https://marketplace.visualstudio.com/items?itemName=trenaryja.multi-cursor-magic)

## Shared packages

- [`@repo/vscode-utils`](packages/vscode-utils) — command registry, webview scaffolding, and contributes codegen shared by the extensions
- [`@repo/config`](packages/config) — shared TypeScript and ESLint configuration
- [`template-vscode-extension`](packages/template-vscode-extension) — the starting point for new extensions (`bun run new:vscode-extension`)

## Development

```sh
bun install
bun run check   # typecheck, format check, build everything
bun run fix     # apply formatting and lint fixes
```

Releases are per-package: conventional commits, git-cliff changelogs, and `<package>-v<version>` tags.

## License

MIT
