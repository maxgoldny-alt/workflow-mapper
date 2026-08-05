# Workflow Mapper

Interactive workflow mapping tool — map any process with **Actors, Steps, Decisions, Tools, and Systems**, housed inside **Screens**, connected by typed, directional edges. Direct-manipulation canvas: pick a tool, click to place, drag to connect.

## Controls

| Action | How |
|---|---|
| Select tool | `V` |
| Hand / pan tool | `H` |
| Pan | Hold **Space** and drag, the Hand tool, middle-mouse drag, or just scroll |
| Zoom | `⌘`/`Ctrl` + scroll (zooms to the cursor), or the `+` / `−` buttons |
| Zoom to fit | Click the zoom percentage, or the fit button |
| Add a node | Pick a node type in the left rail (`1`–`5`), then click the canvas — it drops there and you type the name immediately |
| Add a screen | Screen tool (`S`), then drag out a rectangle |
| Connect two nodes | Hover a node, drag one of its four dots onto another node |
| Rename | Double-click a node or a screen title |
| Delete | Select, then `Delete` / `Backspace` |
| Undo / redo | `⌘Z` / `⇧⌘Z` |
| Cancel | `Escape` |

## Features

- **5 node types** — Actor, Step, Decision (dashed), Tool, System, each with its own icon and colour
- **6 edge types** — Sequence, Yes, No, Data (dashed), Uses (dotted), Handoff, all with directional arrowheads that stop cleanly at the node border. Pick the type for the next edge in the top bar, or change any edge's type from the inspector.
- **Screens are frames** — drag a screen header to move it and everything inside; drag its corner to resize. Nodes are assigned to whichever screen they're dropped into, automatically — there is no screen dropdown to maintain.
- **Inspector** — the right panel shows properties for whatever is selected (node, edge, or screen), and nothing else.
- **Light and dark** — light by default, toggle in the top bar.
- **Auto-save** — the whole map persists in your browser (localStorage) automatically
- **Import / Export** — JSON import via the header button; export PNG, SVG, Mermaid, or JSON
- **Mermaid import** — paste `graph LR` syntax to generate a map (decision `{...}` nodes, subgraphs → screens)

## Templates

- **Operational Core** — order intake → operations core → delivery, showing every node and edge type
- **Approval Flow** — basic request/review/approve loop
- **Empty** — start from scratch

## Development

```bash
npm install
npm run dev
```

## Deploying to Vercel

Import this repo on Vercel and accept the defaults — the Next.js preset and
`npm run build` are auto-detected, and the app sits at the repo root, so there
is no Root Directory to change. There are no environment variables or backend
services to configure; workflows are stored in the browser's localStorage.

## Tech Stack

- Next.js (App Router), Tailwind CSS v4, shadcn/ui, Lucide icons
