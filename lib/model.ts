/**
 * Core document model. Actors are swimlanes; a handoff is any edge whose two
 * ends sit in different lanes. Every edge records how that connection actually
 * happens today (its mechanism) and what moves across it (its payload).
 */

export type NodeType = "step" | "decision" | "tool" | "system" | "note"
export type EdgeType = "sequence" | "yes" | "no" | "data" | "uses"
export type Mechanism =
  | "unknown"
  | "manual"
  | "email"
  | "chat"
  | "spreadsheet"
  | "api-available"
  | "api-wired"
  | "automated"

export interface Lane {
  id: string
  actor: string
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
}

export interface Connection {
  id: string
  from: string
  to: string
  label?: string
  type: EdgeType
  mechanism: Mechanism
  payload?: string
  notes?: string
}

export interface Doc {
  nodes: Node[]
  connections: Connection[]
  lanes: Lane[]
}

export interface WorkflowFile {
  id: string
  name: string
  doc: Doc
}

// Fixed geometry — shared by rendering, hit-testing, edge anchoring, and export
export const NODE_W = 132
export const NODE_H = 88
export const LANE_HEADER_W = 140
export const LANE_MIN_H = 120
export const LANE_MIN_W = 1600

export const NODE_TYPE_META: Record<NodeType, { label: string; color: string; shortcut: string }> = {
  step: { label: "Step", color: "#4f46e5", shortcut: "1" },
  decision: { label: "Decision", color: "#d97706", shortcut: "2" },
  tool: { label: "Tool", color: "#059669", shortcut: "3" },
  system: { label: "System", color: "#7c3aed", shortcut: "4" },
  note: { label: "Note", color: "#ca8a04", shortcut: "5" },
}

export const EDGE_TYPE_META: Record<EdgeType, { label: string; color: string }> = {
  sequence: { label: "Sequence", color: "#2563eb" },
  yes: { label: "Yes", color: "#059669" },
  no: { label: "No", color: "#dc2626" },
  data: { label: "Data", color: "#0891b2" },
  uses: { label: "Uses", color: "#7c3aed" },
}

/**
 * How a connection happens today. `dash` is the stroke pattern; solid means
 * the connection runs without a person in the loop. `rank` orders the handoff
 * table so the most manual work floats to the top.
 */
export const MECHANISM_META: Record<
  Mechanism,
  { label: string; short: string; color: string; dash?: string; rank: number; hint: string }
> = {
  unknown: { label: "Unknown", short: "?", color: "#6b7280", dash: "3 5", rank: 0, hint: "Not mapped yet" },
  manual: { label: "Manual", short: "manual", color: "#dc2626", dash: "6 4", rank: 1, hint: "Someone walks it over, re-keys it, or does it by hand" },
  email: { label: "Email", short: "email", color: "#ea580c", dash: "6 4", rank: 2, hint: "Sent as an email or attachment" },
  chat: { label: "Chat", short: "chat", color: "#d97706", dash: "6 4", rank: 3, hint: "Slack, Teams, WhatsApp, text" },
  spreadsheet: { label: "Spreadsheet", short: "sheet", color: "#ca8a04", dash: "6 4", rank: 4, hint: "Shared sheet or CSV" },
  "api-available": { label: "API available", short: "api?", color: "#0891b2", dash: "10 4", rank: 5, hint: "Both sides have an API but nothing is wired" },
  "api-wired": { label: "API wired", short: "api", color: "#059669", rank: 6, hint: "Integrated and running" },
  automated: { label: "Automated", short: "auto", color: "#16a34a", rank: 7, hint: "Happens on its own inside one system" },
}

export const NODE_TYPES = Object.keys(NODE_TYPE_META) as NodeType[]
export const EDGE_TYPES = Object.keys(EDGE_TYPE_META) as EdgeType[]
export const MECHANISMS = Object.keys(MECHANISM_META) as Mechanism[]

/** Mechanisms that still involve a person moving the data. */
export const isManualMechanism = (m: Mechanism) => MECHANISM_META[m].rank >= 1 && MECHANISM_META[m].rank <= 4

export const LANE_COLORS = ["#0891b2", "#4f46e5", "#059669", "#d97706", "#7c3aed", "#db2777", "#ca8a04", "#64748b"]

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

export interface Handoff {
  edge: Connection
  from: Node
  to: Node
  fromLane: Lane
  toLane: Lane
}

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
  return out.sort((a, b) => MECHANISM_META[a.edge.mechanism].rank - MECHANISM_META[b.edge.mechanism].rank)
}

export const blankDoc = (): Doc => ({
  nodes: [],
  connections: [],
  lanes: [{ id: "lane_1", actor: "Actor 1", height: 220, color: LANE_COLORS[0] }],
})
