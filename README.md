# Workflow Mapper

Explain how the business works; an operational model builds itself.

An AI interviewer asks the questions an operations analyst would ask, one at a time, and turns the answers into a structured **current-state** model: process areas, processes, actors, steps, decisions, systems, platforms, data objects, handoffs, and the questions nobody has answered yet. The canvas is a view of that model, and everything the AI creates can be edited by hand.

## Levels

```
Company  →  Process Area  →  Process  →  Steps
```

- **Company overview**: one card per process area, arrows for the major handoffs between them. No detail leaks up.
- **Area**: its processes as cards.
- **Process**: the swimlane editor. Each lane is an actor; every lane-crossing edge is a handoff.

Breadcrumbs in the top bar move between levels. Double-click an area or process card to drill in.

## Handoffs record how work moves today

Each connection carries independent facts, not one blended "mechanism":

| Dimension | Values |
|---|---|
| Channel | email, phone, sms, website, web form, Slack, Teams, WhatsApp, chat, spreadsheet, CSV, paper, API, direct system action, in person, other, unknown |
| Execution | human, system, hybrid, unknown |
| Integration | none, possible, configured, live, unknown |
| Trigger | how the receiving side knows it is ready (a person checks, submission, webhook, schedule, approval, file, event) |
| Payload | free text and/or references to reusable data objects |
| Verification | confirmed, reported, inferred, unknown |

Systems are first-class: a **platform** (Microsoft 365) is separate from the company's **system instance** (Orders shared mailbox: shared account, owned by Veronica). Platform capability fields exist but stay empty until verified. Nothing is assumed.

## AI interview

Click **AI interview**. With `ANTHROPIC_API_KEY` set, Claude runs the interview (server-side route, key never reaches the browser). Without a key, a scripted interviewer covers the intake-style flow deterministically. Either way:

- one question per turn; "I don't know" becomes an open question, never a guess
- every turn lists what it derived (+ Actor, + System, ? question) under the AI's message
- AI-created facts are marked *reported* or *inferred*; only a person editing by hand marks something *confirmed*

**Voice mode** (Web Speech API where the browser supports it): questions are read aloud, the microphone opens, the transcript lands in the answer box and can be edited before it is sent. Mic on/off, stop, mute, and auto-send controls sit above the input. Providers live behind `lib/voice` so cloud STT/TTS can replace them later.

```bash
cp .env.example .env.local   # then set ANTHROPIC_API_KEY
```

## Views

Same model, different overlays: Operational, Actors, Systems, Data, Gaps, Opportunity.

## Findings and reports

`lib/findings.ts` derives findings from structure and recorded facts only: manual re-entry, duplicate entry, human polling, email/spreadsheet/chat transport, missing decision branches, unknown triggers, single-person dependencies, and so on. Findings are **observations** by default; **potential** opportunities need confirmed facts; **verified** opportunities need verified platform capabilities, which this version never fabricates.

**Report** generates current-state documentation from the model: summary, SOP, roles, systems inventory, handoff table, data flow, open questions, findings. Unknowns print as UNKNOWN.

## Editing

| Action | How |
|---|---|
| Add a node | `1`–`6` then click in a lane (step, decision, trigger, tool, system, note) |
| Add an actor lane | `L` |
| Connect | drag a dot on a node onto another node |
| Multi-select | drag on empty space, Shift-click, Ctrl+A; arrow keys nudge |
| Rename | double-click |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z (across the whole model) |
| Link areas | drag the dot on an area card onto another card |

## Data and migration

Everything is saved in the browser's localStorage. Saves from earlier versions migrate on load (free-form screens → lanes; single `mechanism` → channel/execution/integration; a list of workflows → one company with an area per workflow). Import accepts old and new JSON; export writes the current format plus Mermaid, SVG and PNG per process.

See `docs/PLAN.md` for the architecture and what was intentionally left out.

## Development

```bash
npm install
npm run dev
```

`npm run lint`, `npx tsc --noEmit`, and `npx next build` are all expected to pass.
