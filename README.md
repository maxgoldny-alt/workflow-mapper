# Workflow Mapper

A clean map of how a business actually runs today, end to end. Not how it should run: how it runs, dysfunction included.

A business owner opens it, tells the AI what the business does (or picks an industry template), and gets an overview of every stage in order on one screen. From there they talk through each stage (or type the steps in) and the map fills itself. The same facts feed the diagram, the SOP, the data-flow view, and the diagnostics: manual handoffs, re-entered data, one-person dependencies, open questions. The result can go to a consultant, an automation builder, or an AI agent.

## Three zoom levels, one model

```
Overview  →  Stage page (Steps · Diagram · SOP · Data)  →  Edit by hand
```

- **Overview**: the table of contents. Every workflow stage in the order work flows, ending where the business ends (a loop back exists only if you add one). Mapped stages show their key steps and a depth meter; unmapped stages show what is typical, dashed. Exceptions sit on a side path. Pills name what the map shows is broken: double entry, manual handoffs, one-person dependencies, disconnected steps. Click a connector to say what moves between two stages.
- **Stage page**: one stage, four tabs on the same data. **Steps** is the fast capture layer: add, rename, reassign, delete steps without a canvas. **Diagram** is the swimlane view (read-mostly). **SOP** is the generated procedure. **Data** shows systems used, what moves between people, and data in/out per step.
- **Edit by hand**: the full swimlane editor, opened on purpose from the Diagram tab. Drawing tools, connect handles, lanes, frames, overlays live only here.

## AI, assisted not interview-only

The interviewer starts wherever you are: on the map it asks which stage to talk through; on a stage it asks what happens first or what comes after the last step; on a step it asks how the next person knows it is ready. It knows the typical stages for the kind of business and adds one to the map when you describe work that belongs there, but it never forces a stage you do not have. "I don't know" becomes an open question, never a guess.

Providers: Base44 InvokeLLM when `BASE44_APP_ID` is set (see AGENTS.md), Anthropic when `ANTHROPIC_API_KEY` is set, otherwise a scripted fallback so the app always works.

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
