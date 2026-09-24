import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"
import { INTERVIEWER_RULES, OPENING_QUESTION } from "@/lib/ai/provider"

export const runtime = "nodejs"

/**
 * Server side of the AI interviewer. The browser never sees any API key.
 * Providers, in order: Base44's built-in InvokeLLM integration (when
 * BASE44_APP_ID is set — official @base44/sdk external client, anonymous mode,
 * metered against the Base44 app's credit quota), then Anthropic (when
 * ANTHROPIC_API_KEY is set — forced tool call). 503 when neither is
 * configured, so the client can fall back to the scripted interviewer.
 */

const OP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["op"],
  properties: {
    op: {
      type: "string",
      enum: ["ensureArea", "ensureProcess", "ensureActor", "ensurePlatform", "ensureSystem", "ensureDataObject", "addNode", "connect", "link", "addQuestion", "answerQuestion", "note", "frame", "setCompany"],
    },
    name: { type: "string" },
    area: { type: "string" },
    process: { type: "string" },
    purpose: { type: "string" },
    inputs: { type: "string" },
    outputs: { type: "string" },
    kind: { type: "string" },
    notes: { type: "string" },
    vendor: { type: "string" },
    category: { type: "string" },
    platform: { type: "string" },
    accountType: { type: "string", enum: ["shared", "personal", "company", "unknown"] },
    owner: { type: "string" },
    dataIn: { type: "array", items: { type: "string" } },
    dataOut: { type: "array", items: { type: "string" } },
    integration: { type: "string", enum: ["none", "possible", "configured", "live", "unknown"] },
    format: { type: "string" },
    actor: { type: "string" },
    label: { type: "string" },
    type: { type: "string" },
    sublabel: { type: "string" },
    system: { type: "string" },
    after: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    channel: { type: "string" },
    execution: { type: "string", enum: ["human", "system", "hybrid", "unknown"] },
    triggerKind: { type: "string", enum: ["human-check", "submission", "webhook", "schedule", "approval", "file", "event", "other", "unknown"] },
    trigger: { type: "string" },
    payload: { type: "string" },
    dataObjects: { type: "array", items: { type: "string" } },
    fromArea: { type: "string" },
    toArea: { type: "string" },
    text: { type: "string" },
    answer: { type: "string" },
    node: { type: "string" },
    verification: { type: "string", enum: ["reported", "inferred"] },
    steps: { type: "array", items: { type: "string" } },
    industry: { type: "string" },
    description: { type: "string" },
  },
} as const

const TURN_TOOL: Anthropic.Tool = {
  name: "interview_turn",
  description: "Record the facts extracted from the user's latest answer as model operations, then ask the next question.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["ops", "say"],
    properties: {
      ops: { type: "array", items: OP_SCHEMA },
      say: { type: "string", description: "The next thing to say to the user: one clear question, or a brief wrap-up plus a question." },
    },
  },
}

/** Per-op schemas so a schema-constrained model only sees the fields that op uses. */
const P = OP_SCHEMA.properties
const opVariant = (op: string, required: string[], fields: string[]) => ({
  type: "object",
  additionalProperties: false,
  required: ["op", ...required],
  properties: { op: { type: "string", enum: [op] }, ...Object.fromEntries([...required, ...fields].map((f) => [f, P[f as keyof typeof P]])) },
})
const OP_VARIANTS = [
  opVariant("ensureArea", ["name"], ["purpose", "inputs", "outputs"]),
  opVariant("ensureProcess", ["area", "name"], ["purpose"]),
  opVariant("ensureActor", ["name"], ["kind", "notes", "verification"]),
  opVariant("ensurePlatform", ["name"], ["vendor", "category"]),
  opVariant("ensureSystem", ["name"], ["platform", "kind", "accountType", "owner", "purpose", "dataIn", "dataOut", "integration", "verification"]),
  opVariant("ensureDataObject", ["name"], ["kind", "format"]),
  opVariant("addNode", ["process", "actor", "label"], ["type", "sublabel", "system", "dataIn", "dataOut", "after", "notes", "verification"]),
  opVariant("connect", ["process", "from", "to"], ["type", "label", "channel", "execution", "integration", "triggerKind", "trigger", "payload", "dataObjects", "verification"]),
  opVariant("link", ["fromArea", "toArea"], ["label", "payload", "channel", "execution", "verification"]),
  opVariant("addQuestion", ["text"], ["area", "process", "node"]),
  opVariant("answerQuestion", ["text", "answer"], []),
  opVariant("note", ["process", "node", "notes"], []),
  opVariant("frame", ["process", "name", "steps"], []),
  opVariant("setCompany", [], ["name", "industry", "description"]),
]

/** Turn shape for Base44's InvokeLLM. Only `op` is declared per item: listing every
 * optional field makes schema-constrained models pad all of them with filler. The
 * fields themselves are described in OPS_GUIDE. */
const TURN_SCHEMA = {
  type: "object",
  required: ["say", "ops"],
  properties: {
    say: { type: "string", description: "The next thing to say to the user: one clear question, or a brief wrap-up plus a question." },
    ops: {
      type: "array",
      description: "Model operations for facts in the user's latest message. Each item has `op` plus only the fields you know.",
      items: { anyOf: OP_VARIANTS },
    },
  },
} as const

const OPS_GUIDE = `Op reference (all name-based, case-insensitive; missing things are created):
- ensureArea {name, purpose?, inputs?, outputs?}
- ensureProcess {area, name, purpose?}
- ensureActor {name, kind: person|role|team|customer|external|unknown}
- ensurePlatform {name, vendor?, category?}
- ensureSystem {name, platform?, kind: mailbox|app|database|spreadsheet|phone|website|other|unknown, accountType?, owner?, purpose?, dataIn?, dataOut?, integration?}
- ensureDataObject {name, kind?: document|record|message|file|other, format?}
- addNode {process, actor, label, type: step|decision|trigger|tool|system|note, system?, dataIn?, dataOut?, after?, notes?}  — the node is placed in the actor's lane; "after" positions it after another node's label
- connect {process, from, to, type?: sequence|yes|no|data|uses, channel?, execution?, integration?, triggerKind?, trigger?, payload?, dataObjects?}
- link {fromArea, toArea, label?, payload?, channel?, execution?}
- addQuestion {text, area?, process?, node?}
- answerQuestion {text (existing question), answer}
- note {process, node, notes}
- setCompany {name?, industry?, description?}  — from the first answer about the business
- frame {process, name, steps: [step labels]}  — group steps into a named phase ("Order entry", "Shipping") once a phase is clear
Channels: email, phone, sms, website, web-form, slack, teams, whatsapp, chat, spreadsheet, csv, paper, api, system, in-person, other, unknown.`

type InterviewBody = { messages: { role: "ai" | "user"; text: string }[]; modelSummary: string; userText: string | null; focus?: string; instructions?: string }


const FILLER = new Set(["unknown", "n/a", "none", "null", "undefined", "", "-", "not specified", "not provided", "not applicable"])

/** Schema-constrained models pad optional fields with placeholders; drop those so applyOps treats them as absent.
 * `unknown` is a real value only for the enum fields that define it. */
const OP_NAMES = new Set(OP_SCHEMA.properties.op.enum as readonly string[])
const OP_FIELDS = new Set(Object.keys(OP_SCHEMA.properties))
const NAME_KEYS = new Set(["name", "area", "process", "label", "text", "from", "to", "fromArea", "toArea", "node", "system", "platform", "owner", "actor", "after"])

function stripFiller(op: unknown): Record<string, unknown> | null {
  if (!op || typeof op !== "object") return null
  const src = op as Record<string, unknown>
  if (typeof src.op !== "string" || !OP_NAMES.has(src.op)) return null
  const keepUnknown = new Set(["kind", "channel", "execution", "integration", "triggerKind", "accountType"])
  const name = typeof src.name === "string" ? src.name.trim().toLowerCase() : typeof src.label === "string" ? src.label.trim().toLowerCase() : ""
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(src)) {
    if (!OP_FIELDS.has(k)) continue
    if (typeof v === "string") {
      const t = v.trim().toLowerCase()
      if (FILLER.has(t) && !(t === "unknown" && keepUnknown.has(k))) continue
      // A model that copies the entity name into unrelated fields ("purpose": "Order Intake") is padding
      if (name && t === name && !NAME_KEYS.has(k)) continue
      out[k] = v
    } else if (Array.isArray(v)) {
      const arr = v.filter((x) => typeof x !== "string" || !FILLER.has(x.trim().toLowerCase()))
      if (arr.length) out[k] = arr
    } else if (v !== null && v !== undefined) out[k] = v
  }
  return out
}

/** Keep the overview to one area per mapped process: once an area exists, redirect
 * new area names onto it instead of letting each turn invent "Sales", "Order Management"… */
function foldAreas(ops: Record<string, unknown>[], modelSummary: string, userText: string | null): Record<string, unknown>[] {
  let existing: string[] = []
  let processes: string[] = []
  try {
    const m = JSON.parse(modelSummary) as { areas?: { area?: string; processes?: { process?: string }[] }[] }
    existing = (m.areas ?? []).map((a) => String(a.area ?? "")).filter(Boolean)
    processes = (m.areas ?? []).flatMap((a) => (a.processes ?? []).map((p) => String(p.process ?? ""))).filter(Boolean)
  } catch {
    /* summary not JSON: no folding */
  }
  // A new process is only real when the user's own words asked for it; suggestions the model
  // made ("order intake or onboarding?") must not become empty processes.
  const said = (userText ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ")
  const mentioned = (name: string) => {
    const words = name.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 3)
    return words.length > 0 && words.filter((w) => said.includes(w)).length >= Math.min(2, words.length)
  }
  const knownProc = new Set(processes.map((p) => p.toLowerCase()))
  const focus = processes[processes.length - 1]
  ops = ops.filter((o) => !(o.op === "ensureProcess" && typeof o.name === "string" && !knownProc.has(o.name.toLowerCase()) && processes.length > 0 && !mentioned(o.name)))
  if (focus) {
    const allowed = new Set([...knownProc, ...ops.filter((o) => o.op === "ensureProcess" && typeof o.name === "string").map((o) => (o.name as string).toLowerCase())])
    for (const o of ops) {
      if (typeof o.process === "string" && !allowed.has(o.process.toLowerCase()) && !processes.some((p) => p.toLowerCase().includes(o.process!.toString().toLowerCase()) || o.process!.toString().toLowerCase().includes(p.toLowerCase()))) o.process = focus
    }
  }
  const known = new Set(existing.map((a) => a.toLowerCase()))
  const firstNew = ops.find((o) => o.op === "ensureArea" && typeof o.name === "string")
  const target = existing[0] ?? (typeof firstNew?.name === "string" ? firstNew.name : undefined)
  if (!target) return ops
  const out: Record<string, unknown>[] = []
  for (const o of ops) {
    if (o.op === "ensureArea" && typeof o.name === "string" && !known.has(o.name.toLowerCase()) && o.name !== target) continue
    if (o.op === "ensureProcess" && typeof o.area === "string" && !known.has(o.area.toLowerCase())) o.area = target
    if (o.op === "addQuestion" && typeof o.area === "string" && !known.has(o.area.toLowerCase())) o.area = target
    out.push(o)
  }
  return out
}

/** Base44 provider: the app's built-in InvokeLLM core integration, reached through the
 * official @base44/sdk external client (anonymous mode). Structured output via
 * response_json_schema replaces the forced tool call. Metered against the app's
 * Base44 credit quota; no provider API key involved. */
async function base44Turn(body: InterviewBody, appId: string) {
  const { createClient } = await import("@base44/sdk")
  const base44 = createClient({ appId })

  const transcript = body.messages.map((m) => `${m.role === "ai" ? "Interviewer" : "User"}: ${m.text}`)
  if (body.userText !== null) transcript.push(`User: ${body.userText}`)
  if (!transcript.length || body.messages[0]?.role === "ai") transcript.unshift("User: (Start the interview.)")

  const rules = body.instructions?.trim() || INTERVIEWER_RULES
  const prompt = `${rules}

${OPS_GUIDE}

Opening question if the model is empty and nothing has been said: "${OPENING_QUESTION}"

Current model (JSON):
${body.modelSummary}${body.focus ? `

The process currently being mapped: "${body.focus}". Put new steps there unless the user clearly moves on.` : ""}

Conversation so far:
${transcript.join("\n")}

Record every fact from the user's latest message as ops (an empty array when the conversation is just starting), and set "say" to your next single question.

Output rules for ops:
- Include ONLY the fields you actually know. Never fill a field with "unknown", "n/a", "none", "null" or an empty string; omit it instead.
- Reuse the existing area and process names from the current model. Do not invent a new area each turn; one area per business process being mapped.
- Every step needs an addNode with the actor who performs it, and steps must be chained with connect ops (from → to). A handoff between actors carries channel, execution and triggerKind.
- Multiple intake channels are trigger nodes in the customer's lane (e.g. "Email order arrives"), each connected to the first step that handles it.`

  try {
    const raw = (await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: TURN_SCHEMA })) as unknown
    const data = typeof raw === "string" ? (JSON.parse(raw) as { say?: unknown; ops?: unknown }) : (raw as { say?: unknown; ops?: unknown })
    if (!data || typeof data.say !== "string") return NextResponse.json({ error: "bad_response" }, { status: 502 })
    const cleaned = Array.isArray(data.ops) ? data.ops.map(stripFiller).filter((o): o is Record<string, unknown> => !!o) : []
    return NextResponse.json({ say: data.say, ops: foldAreas(cleaned, body.modelSummary, body.userText), provider: "Base44", providerDetail: `Base44 InvokeLLM · app ${appId.slice(-6)} · Gemini (per Base44 error format)` })
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 429) return NextResponse.json({ error: "rate_limited" }, { status: 429 })
    // Bad or unauthorized app id: same shape as "no provider configured" so the
    // client falls back to the scripted interviewer instead of hard-failing.
    if (status === 401 || status === 403 || status === 404) return NextResponse.json({ error: "bad_app_id" }, { status: 503 })
    return NextResponse.json({ error: "base44_error" }, { status: 502 })
  }
}

export async function POST(req: Request) {
  let body: InterviewBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }

  const appId = process.env.BASE44_APP_ID
  if (appId) return base44Turn(body, appId)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: "no_api_key" }, { status: 503 })

  const client = new Anthropic({ apiKey })
  const model = process.env.INTERVIEW_MODEL || "claude-opus-5"

  const history: Anthropic.MessageParam[] = body.messages.map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }))
  if (body.userText !== null) history.push({ role: "user", content: body.userText })
  if (!history.length) history.push({ role: "user", content: "(Start the interview.)" })
  if (history[0].role !== "user") history.unshift({ role: "user", content: "(Start the interview.)" })

  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: `${body.instructions?.trim() || INTERVIEWER_RULES}\n\n${OPS_GUIDE}\n\nOpening question if the model is empty and nothing has been said: "${OPENING_QUESTION}"`, cache_control: { type: "ephemeral" } },
    { type: "text", text: `Current model (JSON):\n${body.modelSummary}${body.focus ? `\n\nThe process currently being mapped: "${body.focus}". Put new steps there unless the user clearly moves on.` : ""}` },
  ]

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 8000,
      system,
      tools: [TURN_TOOL],
      tool_choice: { type: "tool", name: "interview_turn" },
      messages: history,
    })
    if (response.stop_reason === "refusal") return NextResponse.json({ error: "refusal" }, { status: 502 })
    const call = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    if (!call) return NextResponse.json({ error: "no_tool_call" }, { status: 502 })
    const input = call.input as { say: string; ops: unknown[] }
    return NextResponse.json({ say: input.say, ops: Array.isArray(input.ops) ? input.ops : [], provider: "Claude", providerDetail: `Anthropic · ${model}` })
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "bad_api_key" }, { status: 503 })
    if (err instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "rate_limited" }, { status: 429 })
    if (err instanceof Anthropic.APIError) return NextResponse.json({ error: `api_${err.status}` }, { status: 502 })
    return NextResponse.json({ error: "unknown" }, { status: 500 })
  }
}
