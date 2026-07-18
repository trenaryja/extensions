// Data for the insert commands. No `vscode` import — safe for the contributes codegen to load.

// The webview places the caret wherever this marker appears in inserted text.
export const CURSOR = String.fromCharCode(0)

// Curated languages for the Insert Code Block picker (Shiki supports far more; these are the common ones).
export const CODE_LANGUAGES = [
	'typescript',
	'javascript',
	'tsx',
	'jsx',
	'json',
	'html',
	'css',
	'python',
	'rust',
	'go',
	'java',
	'c',
	'cpp',
	'csharp',
	'ruby',
	'php',
	'shell',
	'bash',
	'sql',
	'yaml',
	'toml',
	'markdown',
	'dockerfile',
	'graphql',
	'swift',
	'kotlin',
	'lua',
	'diff',
]

export const CALLOUT_TYPES = [
	'note',
	'tip',
	'info',
	'important',
	'success',
	'question',
	'warning',
	'caution',
	'failure',
	'danger',
	'bug',
	'example',
	'quote',
	'abstract',
]

// Diagram type → a starter example (latest mermaid spec). The picker key is the friendly name.
export const MERMAID_EXAMPLES: Record<string, string> = {
	Flowchart: 'flowchart TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[OK]\n  B -->|No| D[Retry]',
	Sequence: 'sequenceDiagram\n  Alice->>Bob: Hello Bob\n  Bob-->>Alice: Hi Alice',
	Class: 'classDiagram\n  class Animal {\n    +String name\n    +move()\n  }\n  Animal <|-- Dog',
	State: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running: start\n  Running --> Idle: stop',
	'Entity Relationship': 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains',
	Gantt: 'gantt\n  title A Gantt Diagram\n  dateFormat YYYY-MM-DD\n  section Section\n  A task :a1, 2026-01-01, 30d',
	Pie: 'pie title Pets\n  "Dogs" : 386\n  "Cats" : 85',
	Mindmap: 'mindmap\n  root((mindmap))\n    Origins\n    Research\n    Tools',
	'Git graph': 'gitGraph\n  commit\n  branch develop\n  commit\n  checkout main\n  merge develop',
}
