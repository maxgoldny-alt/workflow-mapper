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
      enum: ["ensureArea", "ensureProcess", "ensureActor", "ensurePlatform", "ensureSystem", "ensureDataObject", "addNode", "connect", "link", "addQuestion", "answerQuestion", "note"],
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

/** Same turn shape as TURN_TOOL, as a plain JSON schema for Base44's InvokeLLM. */
const TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["say", "ops"],
  properties: {
    say: { type: "string", description: "The next thing to say to the user: one clear question, or a brief wrap-up plus a question." },
    ops: { type: "array", items: OP_SCHEMA },
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
Channels: email, phone, sms, website, web-form, slack, teams, whatsapp, chat, spreadsheet, csv, paper, api, system, in-person, other, unknown.`

type InterviewBody = { messages: { role: "ai" | "user"; text: string }[]; modelSummary: string; userText: string | null; focus?: string }

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

  const prompt = `${INTERVIEWER_RULES}

${OPS_GUIDE}

Opening question if the model is empty and nothing has been said: "${OPENING_QUESTION}"

Current model (JSON):
${body.modelSummary}${body.focus ? `

The process currently being mapped: "${body.focus}". Put new steps there unless the user clearly moves on.` : ""}

Conversation so far:
${transcript.join("\n")}

Record every fact from the user's latest message as ops (an empty array when the conversation is just starting), and set "say" to your next single question.`

  try {
    const raw = (await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: TURN_SCHEMA })) as unknown
    const data = typeof raw === "string" ? (JSON.parse(raw) as { say?: unknown; ops?: unknown }) : (raw as { say?: unknown; ops?: unknown })
    if (!data || typeof data.say !== "string") return NextResponse.json({ error: "bad_response" }, { status: 502 })
    return NextResponse.json({ say: data.say, ops: Array.isArray(data.ops) ? data.ops : [], provider: "Base44" })
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
    { type: "text", text: `${INTERVIEWER_RULES}\n\n${OPS_GUIDE}\n\nOpening question if the model is empty and nothing has been said: "${OPENING_QUESTION}"`, cache_control: { type: "ephemeral" } },
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
    return NextResponse.json({ say: input.say, ops: Array.isArray(input.ops) ? input.ops : [], provider: "Claude" })
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "bad_api_key" }, { status: 503 })
    if (err instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "rate_limited" }, { status: 429 })
    if (err instanceof Anthropic.APIError) return NextResponse.json({ error: `api_${err.status}` }, { status: 502 })
    return NextResponse.json({ error: "unknown" }, { status: 500 })
  }
}
