import { areaById, laneById, processesInArea, type InterviewMessage, type Model, type Node, type Process, type ProcessArea } from "@/lib/model"
import { outlineOrder } from "@/lib/outline"
import type { Op } from "./ops"

export interface InterviewContext {
  model: Model
  messages: InterviewMessage[]
  focusProcessId?: string
  /** Where the user is when they talk: the whole map, one stage, or one step. */
  level?: "company" | "stage" | "step"
  focusAreaId?: string
  focusNodeId?: string
  /** User-edited interviewer instructions; the default rules when absent. */
  instructions?: string
  /** "map" (default): sketch the flow, few questions per stage. "detail": pin down every handoff. */
  depth?: "map" | "detail"
}

export interface InterviewTurn {
  /** What the interviewer says next. One clear question. */
  say: string
  /** Model changes derived from the user's last answer. */
  ops: Op[]
  /** Which provider served the turn ("Base44" or "Claude"); absent for scripted. */
  provider?: string
  /** Extra provenance: which app/model served it, when the provider reports it. */
  providerDetail?: string
}

/**
 * An interviewer takes the transcript and the current model, and returns the
 * next thing to say plus the structured facts it extracted from the user's
 * latest answer. `userText` is null for the opening turn.
 */
export interface Interviewer {
  readonly name: string
  next(ctx: InterviewContext, userText: string | null): Promise<InterviewTurn>
}

/** Rules appended per depth. Map mode is the default: it keeps the interviewer from going SOP-deep on turn two. */
export const DEPTH_RULES = {
  map: `DEPTH: MAP THE FLOW. You are sketching how work moves through this stage, not writing an SOP.
- Ask only about: what starts the stage, who does each step, what the next step is, who it hands off to and how (email, chat, system, paper), and which system a step lives in (its name only).
- Never ask about product versions, cloud vs on-premise, screens, alerts, field names, configuration, or how a system is set up.
- When an answer is vague or shared ("everyone", "there's a system", "it depends", "departments"), record ONE addQuestion stating the exact gap and move on to the next step. Do not dig.
- Aim for 4 to 8 steps per stage. When the stage has a start, its main steps, and an end, say it is sketched in one sentence and ask which stage to do next.`,
  detail: `DEPTH: GO DEEP. The flow of this stage is sketched; now pin it down for an SOP.
- For every handoff: channel, who moves it, how the receiving side knows it is ready, and what document or record moves.
- For every system: which product, who owns the account, what goes in and out.
- Ask about decision branches one case at a time. Still one question per turn.`,
} as const

export const OPENING_QUESTION = "First, the business. What's the company called, and what does it do, in a sentence?"

const DEFAULT_COMPANY_NAMES = new Set(["", "new company", "my company"])

export interface ResolvedFocus {
  level: "company" | "stage" | "step"
  area?: ProcessArea
  /** The workflow under the focused stage (the focused process, else the stage's most-mapped one). */
  process?: Process
  node?: Node
}

/** Resolve the context's ids to the stage, workflow and step the user is looking at. */
export function resolveFocus(ctx: InterviewContext): ResolvedFocus {
  const m = ctx.model
  let node: Node | undefined
  let process: Process | undefined
  if (ctx.focusNodeId && ctx.level !== "company" && ctx.level !== "stage") {
    for (const p of m.processes) {
      const n = p.doc.nodes.find((x) => x.id === ctx.focusNodeId)
      if (n) {
        node = n
        process = p
        break
      }
    }
  }
  let area = process ? areaById(m, process.areaId) : ctx.focusAreaId ? areaById(m, ctx.focusAreaId) : undefined
  const focusProc = ctx.focusProcessId ? m.processes.find((p) => p.id === ctx.focusProcessId) : undefined
  if (!area && ctx.level === "stage" && focusProc) area = areaById(m, focusProc.areaId)
  if (area && !process) {
    const inArea = processesInArea(m, area.id)
    process = focusProc && focusProc.areaId === area.id ? focusProc : [...inArea].sort((a, b) => b.doc.nodes.length - a.doc.nodes.length)[0]
  }
  const level = node ? "step" : area && ctx.level !== "company" ? "stage" : "company"
  return { level, area: level === "company" ? undefined : area, process: level === "company" ? undefined : process, node }
}

const isMapped = (m: Model, areaId: string) => processesInArea(m, areaId).some((p) => p.doc.nodes.length > 0)
const actorOf = (p: Process, n: Node) => laneById(p.doc, n.lane)?.actor?.trim() || "someone"

/** The first question for where the user is: the whole map, one stage, or one step. */
export function contextualOpening(ctx: InterviewContext): string {
  const m = ctx.model
  const f = resolveFocus(ctx)
  if (f.level === "step" && f.node && f.process) {
    const doc = f.process.doc
    const n = f.node
    const next = doc.connections
      .filter((c) => c.from === n.id && c.type !== "uses" && c.type !== "data")
      .map((c) => doc.nodes.find((x) => x.id === c.to))
      .find((x): x is Node => !!x)
    if (next && next.lane !== n.lane) return `'${n.label}' is done by ${actorOf(f.process, n)}. How does the next person know it's ready?`
    return `What happens right after '${n.label}'?`
  }
  if (f.level === "stage" && f.area) {
    const steps = f.process ? outlineOrder(f.process.doc) : []
    const last = steps[steps.length - 1]
    if (!last || !f.process) return `We're in ${f.area.name}. What's the first thing that happens here, and who does it?`
    return `We're in ${f.area.name}. After '${last.label}' by ${actorOf(f.process, last)}, what happens next?`
  }
  if (!m.areas.length) return OPENING_QUESTION
  const main = [...m.areas].filter((a) => !a.side).sort((a, b) => a.order - b.order)
  const mappedAny = m.areas.some((a) => isMapped(m, a.id))
  if (!mappedAny) {
    const company = DEFAULT_COMPANY_NAMES.has(m.company.name.trim().toLowerCase()) ? "your business" : m.company.name.trim()
    return `We have the loop for ${company}: ${main.map((a) => a.name).join(" → ")}. Which stage do you want to talk through first?`
  }
  const gap = main.find((a) => !isMapped(m, a.id)) ?? m.areas.find((a) => !isMapped(m, a.id))
  if (gap) return `${gap.name} isn't mapped yet. How does work usually arrive there?`
  return "Every stage has a workflow. Which one do you want to go deeper on?"
}

/**
 * Default interviewer instructions. Users can override these per company from
 * the panel; the override is sent instead of this text on every turn.
 */
export const INTERVIEWER_RULES = `You are a sharp operations analyst interviewing the owner of a small business about how work ACTUALLY happens today. You are building a current-state map, step by step, from what they say. You are not designing improvements.

Start:
- Turn one asks for the company name and what the business does. From the answer record setCompany {name, industry, description}. Industry is a short label like "food distribution", "property management", "sheet-metal fabrication". Then ask which process to map first ("order intake", "onboarding a new tenant"…), suggesting two that fit that industry. Suggesting is not creating: do not emit ensureProcess until the user names the process.
- From then on, ask like someone who knows that trade. Use its vocabulary (pick tickets, work orders, lease applications) and expect its usual systems. Never ask a question that would be identical for any business.

How to ask:
- Exactly ONE question per turn. Short, plain, specific. No preamble, no summary of what they just said. Never two questions joined with "and".
- Follow the work, in order. After each answer, ask about the very next thing that happens to that order/request/job: who does it, in which system, or how they knew it was ready.
- The question that matters most after any handoff: "How does [next person] know it's ready?" Ask it every time a new person or team takes over.
- Pin down vague words immediately: "the system" → which system; "someone" → who; "they send it" → how (email, chat, spreadsheet, API) and who.
- When a decision appears ("if it's approved…", "it depends"), ask what the cases are, then follow ONE case at a time and come back for the others.
- Ask which product when a tool is named loosely: "Outlook" → Microsoft 365 or Exchange? "QuickBooks" → Online or Desktop? One question, then move on.
- Accept "I don't know" and move on; record it as a question (addQuestion). Never invent.
- Do not ask about things already in the current model. Read it before asking.
- Speech-to-text answers can be garbled or cut off. If an answer is unclear, ask them to say the missing part again; do not guess.

What to record (ops) from EVERY answer:
- Each action the speaker describes → addNode in the lane of the actor who performs it. Actors are people, roles, teams, or the customer. Labels are short verb phrases ("Create quote in Ivory").
- Chain every new step to the previous step with connect. A handoff between two actors must carry channel, execution and triggerKind. Never leave a new step unconnected.
- Intake channels (email, website, phone, text…) → one trigger node each in the Customer lane, each connected to the first step that handles it.
- Systems named → ensureSystem (with platform when known, accountType when known, owner when known). Steps that use a system → addNode with "system".
- Documents/records that move (PDF, order, invoice, packing slip, tracking number) → dataIn/dataOut/dataObjects.
- Phases that are clearly done (intake, quoting, picking, packing, shipping, billing) → frame with the step labels.
- The current model's areas are the company's business-loop stages (Lead Source, Intake, Fulfillment…). Every process belongs under one of them. Reuse those names; never create a new area when a stage fits.
- Mark each op "reported" when the user said it, "inferred" when you are guessing. Never "confirmed".
- Include only fields you actually know. Omit everything else. Never write "unknown", "N/A" or copied filler into a field.

Do not recommend automation or claim what any software can do. When the process being mapped has a start, every step, every decision branch, every handoff with channel and trigger, and an end, say so in one sentence and ask whether there is an exception path or another process to map.`
