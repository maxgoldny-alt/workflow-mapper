# Workflow Mapper: from diagrammer to operational discovery

Implementation plan for the AI-assisted operational mapping iteration. Written before the refactor; kept as the record of what was decided.

## 1. What stays

Everything that already works in the swimlane editor is kept as the **detailed process view**:

- custom canvas, pan/zoom, marquee, group drag, snap, nudge
- lanes as actors, lane reorder/resize, node clamp to lane
- node/edge inline rename, inspector editing
- derived handoffs and the handoff tray
- undo/redo (now over the whole model, not one process)
- PNG/SVG/Mermaid/JSON export, JSON import (all older formats migrate)
- templates (migrated to the new shape)

`components/workflow-canvas.tsx` loses its header, footer, persistence and workflow-picker responsibilities and becomes `components/process-canvas.tsx`: a pure view/editor of one process. App-level state moves to `components/app.tsx`.

## 2. Data model changes (`lib/model.ts`, version 5)

The canvas is a view of a semantic model. One saved **Workspace** = one company.

```
Workspace { id, name, model }
Model {
  version: 5
  company: { name }
  areas: ProcessArea[]        // overview containers, ordered left→right
  areaLinks: AreaLink[]       // major handoffs between areas
  processes: Process[]        // each belongs to one area; holds the swimlane doc
  actors: Actor[]             // people / roles / teams / customers, shared across processes
  platforms: Platform[]       // technology products (Microsoft 365, QuickBooks Online)
  systems: SystemInstance[]   // the company's instances (Orders shared mailbox)
  dataObjects: DataObject[]   // reusable "what moves" (Order PDF, Customer record)
  questions: Question[]       // unresolved questions with refs into the model
  interview: { messages }     // transcript; each message records what it derived
}
Process { id, areaId, name, purpose?, doc: { lanes, nodes, connections } }
```

Hierarchy is fixed at three levels: **Company → Process Area → Process → steps**. The "value stream" level is the company overview itself (areas in order). No arbitrary nesting.

**Nodes** keep `label/type/x/y/lane` and gain `systemId?`, `dataIn?/dataOut?` (DataObject ids), `verification?`. Node types: step, decision, trigger, tool, system, note.

**Connections** replace the single `mechanism` with independent dimensions:

- `channel`: email, phone, sms, website, web-form, slack, teams, whatsapp, chat, spreadsheet, csv, paper, api, system, in-person, other, unknown
- `execution`: human, system, hybrid, unknown
- `integration`: none, possible, configured, live, unknown
- `triggerKind` + free-text `trigger`
- `payload` text and/or `dataObjectIds`
- `verification`: confirmed, reported, inferred, unknown

Lanes reference an `actorId` and keep a display name. Positions stay on nodes and areas because the canvas is a direct-manipulation editor; nothing else in the model is positional.

## 3. Migration

`lib/storage.ts` key becomes `workflow-mapper-v5`. Chain: v2 → v3 → v4 (existing code) → v5. A v4 save (list of workflows) becomes one workspace where each old workflow is a Process Area with one Process. Old `mechanism` maps to channel/execution/integration:

| mechanism | channel | execution | integration |
|---|---|---|---|
| manual | other | human | none |
| email | email | human | none |
| chat | chat | human | none |
| spreadsheet | spreadsheet | human | none |
| api-available | api | unknown | possible |
| api-wired | api | system | live |
| automated | system | system | live |
| unknown | unknown | unknown | unknown |

JSON import accepts v3, v4 (single process) and v5 (workspace). Export JSON writes v5.

## 4. New components

- `components/app.tsx` — shell: top bar, breadcrumbs, view switch, AI drawer toggle, export; owns model state, history, navigation, selection
- `components/overview-canvas.tsx` — Process Area cards with links, drag to arrange, double-click to drill in
- `components/area-view.tsx` — one area: its processes as cards
- `components/process-canvas.tsx` — the existing swimlane editor, extracted
- `components/interview-panel.tsx` — AI drawer with text and voice controls
- `components/bottom-tray.tsx` — Handoffs | Findings | Questions tabs (evolves handoff-table)
- `components/inspector.tsx` — gains Area, Process, System, Actor sections; hidden when nothing is selected
- `components/report-dialog.tsx` — generated documentation

## 5. AI interview architecture

- `lib/ai/ops.ts` — the only way AI touches the model: a small set of typed operations (`ensureArea`, `ensureProcess`, `ensureActor`, `ensureSystem`, `ensureDataObject`, `addNode`, `connect`, `setFact`, `addQuestion`, `answerQuestion`). `applyOps(model, ops)` places new nodes automatically and records evidence (which message produced them). Every op carries `verification`; AI ops default to `reported` when restating the user and `inferred` when guessing. Nothing an AI op does can set `confirmed`.
- `lib/ai/provider.ts` — `Interviewer` interface: `(transcript, model, focus) → { say, ops }`.
- `lib/ai/claude.ts` + `app/api/interview/route.ts` — Claude via the Anthropic SDK with a forced tool call that returns `{ say, ops }`. Key from `ANTHROPIC_API_KEY`; model from `INTERVIEW_MODEL`. Never bundled to the client.
- `lib/ai/scripted.ts` — deterministic fallback interviewer used when no key is configured. Slot-filling state machine covering the order-intake scenario (channels → system → platform → who monitors → trigger → next step → destination → re-entry → exception paths). Keyword extraction only; anything it cannot parse becomes an unresolved question, never a guess.
- The panel shows, under each AI turn, what that turn created ("+ Actor Veronica, + System Orders mailbox, ? 1 question").

## 6. Voice architecture

`lib/voice/` exposes `SpeechInput` and `SpeechOutput` interfaces and a `createVoice()` factory. First implementation uses the Web Speech API (`SpeechRecognition` for input, `speechSynthesis` for output), detected at runtime. Unsupported browsers get text mode with the mic control disabled and a tooltip. Transcript lands in the editable answer box; an "auto-send" toggle submits on final result. Controls: mic on/off, stop listening, mute AI speech. Swapping to a cloud STT/TTS provider means adding another implementation behind the same interface.

## 7. Hierarchy / Process Area architecture

Navigation state: `{ level: "company" } | { level: "area", areaId } | { level: "process", processId }`. Breadcrumb: `Company > Area > Process`. Overview cards summarise from the model: actors and systems used by the area's processes, process count, open questions, manual handoffs (execution = human across lanes), finding count. Area links are the overview's edges. Double-click an area with one process opens it directly; with several, opens the area view.

## 8. Findings architecture

`lib/findings.ts` computes findings from structure and facts, never from guesses. Each finding: `{ id, rule, level: "observation" | "potential" | "verified", title, detail, ref }`. Rules in this iteration: manual re-entry, duplicate data entry, human polling, cross-actor handoff, spreadsheet transport, email transport, undefined owner, decision with one branch, disconnected step, unknown trigger, unknown channel, unknown system, single-person dependency, step with no output, output with no consumer, repeated data object entry. All start as observations. "Potential" only when the rule is structural and confirmed (e.g. same DataObject re-entered into two systems by a human). "Verified" requires platform capabilities marked verified, which nothing sets in this iteration, so no technology recommendations are produced.

Views (Operational, Actors, Systems, Data, Gaps, Opportunity) are overlays on the same canvas: dimming and badges via `lib/views.ts`.

## 9. Intentionally not implemented

- Value stream as a separate entity (the company overview plays that role)
- Future/proposed state model
- Platform capability database and any technology recommendations
- Auth, multi-user, billing, sharing
- Cloud STT/TTS providers (interface only)
- Infinite nesting, cross-process edges on the detailed canvas
- AI-driven layout beyond "next free slot in the actor's lane"
