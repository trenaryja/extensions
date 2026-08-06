# Mermaid Diagrams

← [Back to test suite](test.md)

Colors come from mermaid's own `default` (light) / `dark` theme — not your VS Code theme.
Per-diagram overrides are possible via `classDef` / `style` (see the flowchart) or `%%{init}%%` directives.

---

## Flowchart (with styling)

```mermaid
flowchart TD
    A[Open .md file] --> B{Extension active?}
    B -- Yes --> C[Load CodeMirror editor]
    B -- No --> D[Default text editor]
    C --> E[Apply decorations]

    subgraph Decorations
        E --> F[Code blocks]
        E --> G[Callouts]
        E --> H[Mermaid]
    end

    classDef highlight fill:#4fc1ff,stroke:#1b6ca8,color:#08131c
    class C highlight
```

---

## Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant W as Webview
    participant E as Extension
    participant D as Document
    W->>E: ready
    E->>D: getText()
    D-->>E: content
    E->>W: init { content, settings }
    loop on every keystroke
        W->>W: rebuild decorations
    end
    alt has unsaved edits
        W->>E: edit { content }
        E->>D: applyEdit()
    else no changes
        W-->>W: idle
    end
    Note over W,D: 300ms debounce before edits are sent
```

---

## Class Diagram

```mermaid
classDiagram
    class EditorProvider {
        +resolveCustomTextEditor()
        -getHtml()
        -pendingWebviewEdit
    }
    class Webview {
        +createEditor()
        +applyExternalUpdate()
    }
    EditorProvider --> Webview : postMessage
    Webview --> EditorProvider : postMessage
```

---

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Editing : keypress
    Editing --> Saving : debounce 300ms
    Saving --> Idle : applyEdit complete
    Saving --> Editing : keypress during save
```

---

## Entity Relationship

```mermaid
erDiagram
    DOCUMENT ||--o{ BLOCK : contains
    BLOCK ||--o{ DECORATION : renders
    DOCUMENT {
        string uri
        string content
    }
    BLOCK {
        string type
        int fromLine
        int toLine
    }
    DECORATION {
        string kind
        string cssClass
    }
```

---

## User Journey

```mermaid
journey
    title Editing a document
    section Open
        Open .md file: 5: User
        Load editor: 3: Extension
    section Write
        Type markdown: 5: User
        See live preview: 5: User
    section Save
        Auto-save: 4: Extension
```

---

## Gantt Chart

```mermaid
gantt
    title Marksmith milestones
    dateFormat YYYY-MM-DD
    section Foundation
        SSOT registry      :done, f1, 2026-06-01, 7d
        Editor provider    :done, f2, after f1, 5d
    section Rendering
        Code blocks        :done, r1, after f2, 6d
        Callouts           :done, r2, after r1, 5d
        Mermaid chrome     :active, r3, after r2, 4d
    section Polish
        Tables             :r4, after r3, 5d
        Zen mode           :r5, after r4, 6d
```

---

## Pie Chart

```mermaid
pie title Webview bundle breakdown
    "CodeMirror" : 35
    "Mermaid" : 60
    "Other" : 5
```

---

## Mindmap

```mermaid
mindmap
    root((Marksmith))
        Writing
            WYSIWYG
            Zen mode
            Slash menu
        Rendering
            Code blocks
            Callouts
            Mermaid
        Migration
            Obsidian
            PKM
```

---

## Timeline

```mermaid
timeline
    title Marksmith roadmap
    v1.0 : Live preview : Code blocks : Callouts
    v1.1 : Tables : Mermaid chrome
    v1.2 : Zen mode : Slash menu
    v2.0 : PKM : Obsidian migration
```

---

## Quadrant Chart

```mermaid
quadrantChart
    title Feature priority
    x-axis Low Effort --> High Effort
    y-axis Low Value --> High Value
    quadrant-1 Do now
    quadrant-2 Plan
    quadrant-3 Backlog
    quadrant-4 Reconsider
    WYSIWYG: [0.4, 0.9]
    Tables: [0.5, 0.7]
    PKM: [0.8, 0.4]
    Zen mode: [0.3, 0.5]
```

---

## Git Graph

```mermaid
gitGraph
    commit id: "init"
    commit id: "feat: tiptap"
    branch feat/codemirror-rewrite
    checkout feat/codemirror-rewrite
    commit id: "feat: codemirror editor"
    commit id: "feat: decorations"
    commit id: "feat: callouts"
```

---

## Requirement Diagram

```mermaid
requirementDiagram
    requirement wysiwyg {
        id: 1
        text: Render markdown live in CodeMirror.
        risk: medium
        verifymethod: demonstration
    }
    element editor {
        type: webview
    }
    editor - satisfies -> wysiwyg
```

---

## XY Chart

```mermaid
xychart-beta
    title "Bundle size by dependency (KB)"
    x-axis [CodeMirror, Shiki, Mermaid, Other]
    y-axis "Size (KB)" 0 --> 9000
    bar [1200, 3800, 8600, 400]
    line [1200, 3800, 8600, 400]
```

---

## Sankey Diagram

```mermaid
sankey-beta

Solar,Battery,30
Wind,Battery,20
Battery,Home,35
Battery,Grid,15
```

---

## Block Diagram

```mermaid
block-beta
    columns 3
    a["Parser"] b["Decorations"] c["Renderer"]
    d["CodeMirror"]:3
    style b fill:#b478ff,color:#08131c
```

---

## Packet Diagram

```mermaid
packet-beta
    0-15: "Source Port"
    16-31: "Destination Port"
    32-63: "Sequence Number"
    64-95: "Acknowledgment Number"
```

---

## Kanban

```mermaid
kanban
    Todo
        [Tables support]
        [Zen mode]
    In Progress
        [Mermaid chrome]
    Done
        [Code blocks]
        [Callouts]
        [Images]
```
