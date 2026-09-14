# Workflow Mapper

Map who does what, how work is handed off, and how data actually moves today.

Every **actor** is a swimlane. **Steps, decisions, tools, systems, and notes** sit in the lane of whoever owns them. Any edge that crosses from one lane into another is a **handoff**, and every edge records the **mechanism** it runs on right now: manual, email, chat, spreadsheet, API available, API wired, or automated. The handoff table at the bottom lists every lane crossing, most manual first, so the "what should we automate" list writes itself.

## Controls

| Action | How |
|---|---|
| Select tool | `V` |
| Hand / pan tool | `H`, or hold **Space** and drag, middle-mouse drag, or scroll |
| Zoom | `Ctrl` + scroll (zooms to the cursor), or the `+` / `−` buttons |
| Zoom to fit | Click the zoom percentage, or the fit button |
| Add a node | Pick a type in the left rail (`1`–`5`), then click the canvas. It lands in the lane under the cursor and you type its name immediately |
| Add an actor lane | `L`, the lane button in the left rail, or "Add actor lane" in the inspector |
| Reorder lanes | Drag a lane header up or down, or use Up / Down in the inspector |
| Resize a lane | Drag the lane's bottom border |
| Move a step to another actor | Drag it into that lane. Its edges become handoffs automatically |
| Connect two nodes | Hover a node, drag one of its four dots onto another node |
| Set how a handoff happens | Select the edge, pick a mechanism, fill in "What moves" |
| Rename | Double-click a node, a lane header, or an edge label |
| Delete | Select, then `Delete` / `Backspace` |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Cancel | `Escape` |

## Model

- **Lane** — one actor: `{ id, actor, height, color }`. Lanes stack top to bottom; position is derived from order.
- **Node** — `{ id, label, sublabel, notes, type, x, y, lane }`. Types: step, decision, tool, system, note.
- **Connection** — `{ id, from, to, label, type, mechanism, payload, notes }`. Types: sequence, yes, no, data, uses. Mechanism is how it happens today; payload is what moves.
- **Handoff** — derived, never stored: an edge whose ends are in different lanes.

Edge colour comes from its type. Dash pattern comes from its mechanism: solid means the data moves on its own, dashed means a person is still carrying it.

## Features

- Multiple workflows, switch in the top-bar picker
- Inspector for the selected node, edge, or lane, or the workflow when nothing is selected
- Status-bar filters to dim everything except one edge type or one mechanism
- Handoff table: click a row to select that edge on the board
- Flowing-motion toggle, light and dark themes
- Auto-save to localStorage. Saves from the previous version (free-form screens) migrate on first load: each screen becomes a lane
- Import JSON (old or new format), export PNG, SVG, Mermaid (one subgraph per actor), or JSON

## Templates

- **Operational Core** — Customer, Ops Manager, Warehouse, Systems, with a mix of manual and wired handoffs
- **Approval Flow** — Requester, Manager, Systems
- **Empty** — one lane, nothing else

## Development

```bash
npm install
npm run dev
```

`npm run lint` and `npx tsc --noEmit` should both be clean.

## Deploying to Vercel

Import this repo on Vercel and accept the defaults. There are no environment variables or backend services; workflows live in the browser's localStorage.

## Tech stack

Next.js (App Router), React 19, Tailwind CSS v4, shadcn/ui, Lucide icons.
