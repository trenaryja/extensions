# extensions

Justin Trenary's editor and launcher extensions — VS Code and Raycast — in one Turborepo.

## Extensions

- [`markslate`](packages/markslate) — a live-preview markdown editor: tables, callouts, math, and mermaid diagrams, all editable in place
- [`multi-cursor-magic`](packages/multi-cursor-magic) — multi-cursor transformation tools for dates, numbers, geographic data, and more · [Marketplace](https://marketplace.visualstudio.com/items?itemName=trenaryja.multi-cursor-magic)

## Shared packages

- [`@repo/vscode-utils`](packages/vscode-utils) — command registry, webview scaffolding, contributes codegen, esbuild config, and headless Chromium helpers for screenshots and demo GIFs
- [`template-vscode-extension`](packages/template-vscode-extension) — the starting point for new extensions (`bun run new:vscode-extension`)

## Development

```sh
bun install
bun run chk     # typecheck, format check, lint
bun run fix     # apply formatting and lint fixes
```

Releases are per-package: conventional commits, git-cliff changelogs, and `<package>-v<version>` tags.

## License

MIT
