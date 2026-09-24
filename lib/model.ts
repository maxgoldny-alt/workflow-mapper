/**
 * Semantic operational model (version 5).
 *
 * The canvas is a view of this model. A Workspace is one company. It holds
 * Process Areas (the overview), each with Processes (swimlane docs), plus the
 * shared vocabulary those processes reference: actors, systems, platforms,
 * data objects, and the open questions still to be answered.
 */

/* --------------------------------------------------------------- vocab */

export type Verification = "confirmed" | "reported" | "inferred" | "unknown"

export const VERIFICATION_META: Record<Verification, { label: string; short: string; color: string; hint: string }> = {
  confirmed: { label: "Confirmed", short: "✓", color: "#059669", hint: "Confirmed by the person who owns it" },
  reported: { label: "Reported", short: "○", color: "#2563eb", hint: "Stated in an interview, not yet verified" },
  inferred: { label: "Inferred", short: "~", color: "#d97706", hint: "Guessed from context; check it" },
  unknown: { label: "Unknown", short: "?", color: "#6b7280", hint: "Not established" },
}
export const VERIFICATIONS = Object.keys(VERIFICATION_META) as Verification[]

export type Channel =
  | "email"
  | "phone"
  | "sms"
  | "website"
  | "web-form"
  | "slack"
  | "teams"
  | "whatsapp"
  | "chat"
  | "spreadsheet"
  | "csv"
  | "paper"
  | "api"
  | "system"
  | "in-person"
  | "other"
  | "unknown"

export const CHANNEL_META: Record<Channel, { label: string; group: "message" | "file" | "system" | "other" }> = {
  email: { label: "Email", group: "message" },
  phone: { label: "Phone", group: "message" },
  sms: { label: "SMS / text", group: "message" },
  website: { label: "Website", group: "system" },
  "web-form": { label: "Web form", group: "system" },
  slack: { label: "Slack", group: "message" },
  teams: { label: "Teams", group: "message" },
  whatsapp: { label: "WhatsApp", group: "message" },
  chat: { label: "Chat (other)", group: "message" },
  spreadsheet: { label: "Spreadsheet", group: "file" },
  csv: { label: "CSV / file", group: "file" },
  paper: { label: "Paper", group: "file" },
  api: { label: "API", group: "system" },
  system: { label: "Direct system action", group: "system" },
  "in-person": { label: "In person", group: "other" },
  other: { label: "Other", group: "other" },
  unknown: { label: "Unknown", group: "other" },
}
export const CHANNELS = Object.keys(CHANNEL_META) as Channel[]

export type Execution = "human" | "system" | "hybrid" | "unknown"
export const EXECUTION_META: Record<Execution, { label: string; color: string; dash?: string; hint: string }> = {
  human: { label: "Human", color: "#dc2626", dash: "6 4", hint: "A person moves it" },
  hybrid: { label: "Hybrid", color: "#d97706", dash: "10 4", hint: "Partly automated, a person still in the loop" },
  system: { label: "System", color: "#059669", hint: "Runs on its own" },
  unknown: { label: "Unknown", color: "#6b7280", dash: "3 5", hint: "Not established" },
}
export const EXECUTIONS = Object.keys(EXECUTION_META) as Execution[]

export type IntegrationState = "none" | "possible" | "configured" | "live" | "unknown"
export const INTEGRATION_META: Record<IntegrationState, { label: string; color: string; hint: string }> = {
  none: { label: "None", color: "#6b7280", hint: "No integration exists" },
  possible: { label: "Possible", color: "#0891b2", hint: "Both sides could integrate; nothing is wired" },
  configured: { label: "Configured", color: "#4f46e5", hint: "Set up but not relied on yet" },
  live: { label: "Live", color: "#059669", hint: "Integrated and running" },
  unknown: { label: "Unknown", color: "#9ca3af", hint: "Not established" },
}
export const INTEGRATIONS = Object.keys(INTEGRATION_META) as IntegrationState[]

export type TriggerKind =
  | "human-check"
  | "submission"
  | "webhook"
  | "schedule"
  | "approval"
  | "file"
  | "event"
  | "other"
  | "unknown"
export const TRIGGER_META: Record<TriggerKind, { label: string }> = {
  "human-check": { label: "A person checks" },
  submission: { label: "Customer / requester submits" },
  webhook: { label: "Webhook" },
  schedule: { label: "Scheduled poll" },
  approval: { label: "Approval" },
  file: { label: "File received" },
  event: { label: "System event" },
  other: { label: "Other" },
  unknown: { label: "Unknown" },
}
export const TRIGGER_KINDS = Object.keys(TRIGGER_META) as TriggerKind[]

/* ------------------------------------------------------------ entities */

export type ActorKind = "person" | "role" | "team" | "customer" | "external" | "unknown"
export interface Actor {
  id: string
  name: string
  kind: ActorKind
  notes?: string
  verification?: Verification
}

/** A technology product. Capability fields stay undefined until verified. */
export interface Platform {
  id: string
  name: string
  vendor?: string
  category?: string
  capabilities?: PlatformCapabilities
  sources?: string[]
  lastVerified?: string
}
export interface PlatformCapabilities {
  api?: Verification
  webhooks?: Verification
  mcp?: Verification
  importExport?: Verification
  connectors?: string[]
  auth?: string
  limitations?: string
}

export type SystemKind = "mailbox" | "app" | "database" | "spreadsheet" | "phone" | "website" | "other" | "unknown"
export type AccountType = "shared" | "personal" | "company" | "unknown"

/** The company's own instance of a platform: "Orders shared mailbox" on Microsoft 365. */
export interface SystemInstance {
  id: string
  name: string
  platformId?: string
  kind: SystemKind
  accountType?: AccountType
  ownerActorId?: string
  userActorIds?: string[]
  purpose?: string
  dataIn?: string
  dataOut?: string
  integration: IntegrationState
  facts?: Fact[]
  verification?: Verification
}

export interface DataObject {
  id: string
  name: string
  kind?: "document" | "record" | "message" | "file" | "other"
  format?: string
  notes?: string
}

export interface Fact {
  id: string
  text: string
  verification: Verification
  messageId?: string
}

/* ---------------------------------------------------------- process doc */

export type NodeType = "step" | "decision" | "trigger" | "tool" | "system" | "note"
export type EdgeType = "sequence" | "yes" | "no" | "data" | "uses"

export interface Lane {
  id: string
  actor: string
  actorId?: string
  height: number
  color?: string
}

export interface Node {
  id: string
  label: string
  sublabel?: string
  notes?: string
  type: NodeType
  x: number
  y: number
  lane: string
  systemId?: string
  dataIn?: string[]
  dataOut?: string[]
  verification?: Verification
  messageId?: string
}

export interface Connection {
  id: string
  from: string
  to: string
  label?: string
  type: EdgeType
  channel: Channel
  execution: Execution
  integration: IntegrationState
  triggerKind?: TriggerKind
  trigger?: string
  payload?: string
  dataObjectIds?: string[]
  verification?: Verification
  notes?: string
  messageId?: string
}

/** A named box around a group of steps (a phase). Layout only. */
export interface Frame {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  color?: string
}

/** One swimlane board. Kept as `Doc` so the canvas code reads the same as before. */
export interface Doc {
  lanes: Lane[]
  nodes: Node[]
  connections: Connection[]
  frames?: Frame[]
}

export interface Process {
  id: string
  areaId: string
  name: string
  purpose?: string
  doc: Doc
  verification?: Verification
}

/** A placeholder node on the loop map, shown until the stage has a mapped workflow. */
export interface SketchNode {
  label: string
  kind: "source" | "step" | "decision" | "exception"
}

export interface ProcessArea {
  id: string
  name: string
  purpose?: string
  order: number
  /** Off the main flow: drawn as a side branch (exceptions, returns, support). */
  side?: boolean
  /** Key nodes to draw before a workflow exists under this stage. */
  sketch?: SketchNode[]
  x?: number
  y?: number
  color?: string
  inputs?: string
  outputs?: string
  notes?: string
}

export interface AreaLink {
  id: string
  from: string
  to: string
  label?: string
  payload?: string
  channel?: Channel
  execution?: Execution
  verification?: Verification
}

export interface Ref {
  areaId?: string
  processId?: string
  nodeId?: string
  connectionId?: string
  systemId?: string
  actorId?: string
}

export interface Question {
  id: string
  text: string
  ref: Ref
  status: "open" | "answered" | "dismissed"
  answer?: string
  source: "ai" | "user" | "finding"
  createdAt: number
}

export interface InterviewMessage {
  id: string
  role: "ai" | "user"
  text: string
  at: number
  /** Human-readable summary of what this turn created or changed. */
  derived?: string[]
  /** Which provider produced this turn and how long it took: the "other side". */
  trace?: { provider: string; detail?: string; ms: number; ops: number }
}

/** How deep the interviewer digs: sketch the flow, or pin down every handoff for an SOP. */
export type InterviewDepth = "map" | "detail"

export interface Model {
  version: 5
  company: { name: string; industry?: string; description?: string }
  areas: ProcessArea[]
  areaLinks: AreaLink[]
  processes: Process[]
  actors: Actor[]
  platforms: Platform[]
  systems: SystemInstance[]
  dataObjects: DataObject[]
  questions: Question[]
  interview: { messages: InterviewMessage[]; focusProcessId?: string; instructions?: string; depth?: InterviewDepth }
}

export interface Workspace {
  id: string
  name: string
  model: Model
}

/* ------------------------------------------------------------- geometry */

export const NODE_W = 132
export const NODE_H = 88
export const LANE_HEADER_W = 140
export const LANE_MIN_H = 120
export const LANE_MIN_W = 1600

export const NODE_TYPE_META: Record<NodeType, { label: string; color: string; shortcut: string }> = {
  step: { label: "Step", color: "#4f46e5", shortcut: "1" },
  decision: { label: "Decision", color: "#d97706", shortcut: "2" },
  trigger: { label: "Trigger", color: "#0891b2", shortcut: "3" },
  tool: { label: "Tool", color: "#059669", shortcut: "4" },
  system: { label: "System", color: "#7c3aed", shortcut: "5" },
  note: { label: "Note", color: "#ca8a04", shortcut: "6" },
}

export const EDGE_TYPE_META: Record<EdgeType, { label: string; color: string }> = {
  sequence: { label: "Sequence", color: "#2563eb" },
  yes: { label: "Yes", color: "#059669" },
  no: { label: "No", color: "#dc2626" },
  data: { label: "Data", color: "#0891b2" },
  uses: { label: "Uses", color: "#7c3aed" },
}

export const NODE_TYPES = Object.keys(NODE_TYPE_META) as NodeType[]
export const EDGE_TYPES = Object.keys(EDGE_TYPE_META) as EdgeType[]

export const LANE_COLORS = ["#0891b2", "#4f46e5", "#059669", "#d97706", "#7c3aed", "#db2777", "#ca8a04", "#64748b"]
export const AREA_COLORS = LANE_COLORS

/* -------------------------------------------------------------- helpers */

export const newId = (prefix = "id") => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

export function uniqueId(base: string, existing: { id: string }[]) {
  let id = `${base}_${existing.length + 1}`
  let i = existing.length + 2
  while (existing.some((e) => e.id === id)) id = `${base}_${i++}`
  return id
}

export const nodeById = (doc: Doc, id: string) => doc.nodes.find((n) => n.id === id)
export const laneById = (doc: Doc, id: string) => doc.lanes.find((l) => l.id === id)

/** A handoff is any edge that crosses from one actor's lane into another's. */
export function isHandoff(doc: Doc, c: Connection): boolean {
  const from = nodeById(doc, c.from)
  const to = nodeById(doc, c.to)
  return !!from && !!to && from.lane !== to.lane
}

/** Human-carried channels: someone is physically moving the data. */
export const isManualEdge = (c: Connection) => c.execution === "human" || c.execution === "hybrid"

export interface Handoff {
  edge: Connection
  from: Node
  to: Node
  fromLane: Lane
  toLane: Lane
}

const EXEC_RANK: Record<Execution, number> = { unknown: 0, human: 1, hybrid: 2, system: 3 }

/** Every lane-crossing edge, most manual first. */
export function handoffs(doc: Doc): Handoff[] {
  const out: Handoff[] = []
  for (const edge of doc.connections) {
    const from = nodeById(doc, edge.from)
    const to = nodeById(doc, edge.to)
    if (!from || !to || from.lane === to.lane) continue
    const fromLane = laneById(doc, from.lane)
    const toLane = laneById(doc, to.lane)
    if (!fromLane || !toLane) continue
    out.push({ edge, from, to, fromLane, toLane })
  }
  return out.sort((a, b) => EXEC_RANK[a.edge.execution] - EXEC_RANK[b.edge.execution])
}

/** Short "how" text for an edge: "Email · human" */
export function edgeHow(c: Connection): string {
  const parts: string[] = []
  if (c.channel !== "unknown") parts.push(CHANNEL_META[c.channel].label)
  if (c.execution !== "unknown") parts.push(EXECUTION_META[c.execution].label.toLowerCase())
  if (c.integration === "live" || c.integration === "possible") parts.push(`API ${INTEGRATION_META[c.integration].label.toLowerCase()}`)
  return parts.join(" · ") || "unknown"
}

export const defaultConnection = (partial: Partial<Connection> & Pick<Connection, "id" | "from" | "to">): Connection => ({
  type: "sequence",
  channel: "unknown",
  execution: "unknown",
  integration: "unknown",
  ...partial,
})

export const blankDoc = (): Doc => ({
  nodes: [],
  connections: [],
  lanes: [{ id: "lane_1", actor: "Actor 1", height: 220, color: LANE_COLORS[0] }],
})

export function blankModel(companyName = "My company"): Model {
  return {
    version: 5,
    company: { name: companyName },
    areas: [],
    areaLinks: [],
    processes: [],
    actors: [],
    platforms: [],
    systems: [],
    dataObjects: [],
    questions: [],
    interview: { messages: [] },
  }
}

/* ------------------------------------------------------ model queries */

export const areaById = (m: Model, id: string) => m.areas.find((a) => a.id === id)
export const processById = (m: Model, id: string) => m.processes.find((p) => p.id === id)
export const processesInArea = (m: Model, areaId: string) => m.processes.filter((p) => p.areaId === areaId)
export const systemById = (m: Model, id: string) => m.systems.find((s) => s.id === id)
export const actorById = (m: Model, id: string) => m.actors.find((a) => a.id === id)
export const platformById = (m: Model, id: string) => m.platforms.find((p) => p.id === id)
export const dataObjectById = (m: Model, id: string) => m.dataObjects.find((d) => d.id === id)
export const openQuestions = (m: Model) => m.questions.filter((q) => q.status === "open")

/** Actor names used by an area, in lane order of appearance. */
export function areaActors(m: Model, areaId: string): string[] {
  const names = new Set<string>()
  for (const p of processesInArea(m, areaId)) for (const l of p.doc.lanes) names.add(l.actor)
  return [...names]
}

/** System names referenced by an area's nodes (by systemId or tool/system node label). */
export function areaSystems(m: Model, areaId: string): string[] {
  const names = new Set<string>()
  for (const p of processesInArea(m, areaId)) {
    for (const n of p.doc.nodes) {
      if (n.systemId) names.add(systemById(m, n.systemId)?.name ?? n.label)
      else if (n.type === "system" || n.type === "tool") names.add(n.label)
    }
  }
  return [...names]
}

export function areaManualHandoffs(m: Model, areaId: string): number {
  return processesInArea(m, areaId).reduce((sum, p) => sum + handoffs(p.doc).filter((h) => isManualEdge(h.edge)).length, 0)
}

export function areaOpenQuestions(m: Model, areaId: string): number {
  const pids = new Set(processesInArea(m, areaId).map((p) => p.id))
  return openQuestions(m).filter((q) => q.ref.areaId === areaId || (q.ref.processId && pids.has(q.ref.processId))).length
}

/** Update one process's doc immutably. */
export function updateProcessDoc(m: Model, processId: string, fn: (d: Doc) => Doc): Model {
  return { ...m, processes: m.processes.map((p) => (p.id === processId ? { ...p, doc: fn(p.doc) } : p)) }
}
