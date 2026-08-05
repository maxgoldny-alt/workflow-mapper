# Workflow Mapper

Interactive workflow mapping tool — map any process with **Actors, Steps, Decisions, Tools, and Systems**, housed inside draggable **Screens**, connected by typed, directional edges.

Built in the same style/engine as the Wireflow wiring-diagram tool (dark v0/Vercel aesthetic).

## Features

- **5 node types** — Actor (cyan), Step (indigo), Decision (amber, dashed), Tool (green), System (violet), each with its own icon and glow
- **6 edge types** — Sequence, Yes, No, Data (dashed), Uses (dotted), Handoff — all with directional arrowheads; click a type in the header to highlight that flow
- **Screens** — group boxes that house nodes; drag a screen header to move it with everything inside; add/rename/delete screens from the Edit panel
- **Edit mode** — add/edit/delete nodes, edges, and screens
- **Auto-save** — the whole map persists in your browser (localStorage) automatically
- **Import / Export** — JSON import via the header button; export PNG, SVG, Mermaid, or JSON
- **Mermaid import** — paste `graph LR` syntax to generate a map (decision `{...}` nodes, subgraphs → screens)
- **Zoom & pan** — Ctrl+Scroll to zoom, Alt+Drag or middle-click to pan

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

This app lives in the `workflow-mapper/` subdirectory of the repo, so when you
import the project on Vercel set **Root Directory** to `workflow-mapper`.
Everything else is auto-detected (Next.js framework preset, `npm run build`).
There are no environment variables or backend services to configure — the app
stores workflows in the browser's localStorage.

## Tech Stack

- Next.js (App Router), Tailwind CSS v4, shadcn/ui, Lucide icons
