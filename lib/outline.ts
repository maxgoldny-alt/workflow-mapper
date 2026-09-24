import { LANE_COLORS, LANE_HEADER_W, NODE_H, NODE_W, defaultConnection, newId, type Doc, type Lane, type Node } from "./model"
import { clampNodeToLane, laneBoxes } from "./geometry"

/**
 * The Stage Outline is a linear reading of a swimlane doc: the same nodes,
 * ordered along the main flow. Editing the outline edits the doc, so the
 * outline and the canvas never drift apart.
 */

const WORK = new Set(["trigger", "step", "decision"])

/** Nodes in flow order: follow sequence/yes/no edges from the triggers, then anything unreached by x. */
export function outlineOrder(doc: Doc): Node[] {
  const work = doc.nodes.filter((n) => WORK.has(n.type))
  const byX = [...work].sort((a, b) => a.x - b.x || a.y - b.y)
  const incoming = new Set(doc.connections.filter((c) => c.type !== "uses" && c.type !== "data").map((c) => c.to))
  const roots = byX.filter((n) => n.type === "trigger" || !incoming.has(n.id))
  const out: Node[] = []
  const seen = new Set<string>()
  const visited = new Set<string>()
  // Every way the stage starts comes first, then the flow from each
  for (const t of byX.filter((n) => n.type === "trigger")) {
    seen.add(t.id)
    out.push(t)
  }
  const visit = (n: Node) => {
    if (visited.has(n.id)) return
    visited.add(n.id)
    if (!seen.has(n.id)) {
      seen.add(n.id)
      out.push(n)
    }
    const next = doc.connections
      .filter((c) => c.from === n.id && c.type !== "uses" && c.type !== "data")
      .map((c) => work.find((x) => x.id === c.to))
      .filter((x): x is Node => !!x)
      .sort((a, b) => a.x - b.x || a.y - b.y)
    next.forEach(visit)
  }
  roots.forEach(visit)
  byX.forEach(visit)
  return out
}

/** The step that flows into this one (first sequence-type predecessor), if any. */
export function predecessor(doc: Doc, nodeId: string): Node | undefined {
  const c = doc.connections.find((c) => c.to === nodeId && c.type !== "uses" && c.type !== "data")
  return c ? doc.nodes.find((n) => n.id === c.from) : undefined
}

function findOrAddLane(doc: Doc, actor: string): { doc: Doc; lane: Lane } {
  const name = actor.trim() || "Unknown"
  const existing = doc.lanes.find((l) => l.actor.trim().toLowerCase() === name.toLowerCase())
  if (existing) return { doc, lane: existing }
  const placeholder = doc.lanes.find((l) => !l.actorId && /^actor \d+$/i.test(l.actor) && !doc.nodes.some((n) => n.lane === l.id))
  if (placeholder) {
    const lane = { ...placeholder, actor: name }
    return { doc: { ...doc, lanes: doc.lanes.map((l) => (l.id === lane.id ? lane : l)) }, lane }
  }
  const lane: Lane = { id: newId("lane"), actor: name, height: 180, color: LANE_COLORS[doc.lanes.length % LANE_COLORS.length] }
  return { doc: { ...doc, lanes: [...doc.lanes, lane] }, lane }
}

export interface AddStepOptions {
  label: string
  actor: string
  type?: "step" | "decision" | "trigger"
  /** Insert after this node; default appends after the last node in outline order. */
  afterId?: string | null
}

/** Add a step to the doc as a real node: in the actor's lane, right of its predecessor, connected in sequence. */
export function addOutlineStep(input: Doc, opts: AddStepOptions): { doc: Doc; id: string } {
  const { doc: withLane, lane } = findOrAddLane(input, opts.actor)
  const order = outlineOrder(withLane)
  const after = opts.afterId === null ? undefined : opts.afterId ? withLane.nodes.find((n) => n.id === opts.afterId) : order[order.length - 1]
  const before = after ? withLane.connections.find((c) => c.from === after.id && c.type === "sequence") : undefined
  const box = laneBoxes(withLane.lanes).find((b) => b.id === lane.id)!
  const x = after ? after.x + NODE_W + 48 : LANE_HEADER_W + 24
  const id = newId(opts.type === "decision" ? "dec" : "step")
  let node: Node = { id, label: opts.label.trim(), type: opts.type ?? (order.length === 0 ? "trigger" : "step"), x, y: box.top + (box.height - NODE_H) / 2, lane: lane.id, verification: "reported" }
  node = clampNodeToLane(withLane.lanes, node)
  // Shift everything at or right of the insertion point so the new node has room
  const nodes = withLane.nodes.map((n) => (after && n.x >= x && n.id !== after.id ? { ...n, x: n.x + NODE_W + 48 } : n))
  nodes.push(node)
  let connections = withLane.connections
  if (after) connections = [...connections, defaultConnection({ id: newId("e"), from: after.id, to: id })]
  if (before) connections = connections.map((c) => (c.id === before.id ? { ...c, from: id } : c))
  return { doc: { ...withLane, nodes, connections }, id }
}

/** Move a node to another actor's lane, keeping its x. */
export function reassignStep(input: Doc, nodeId: string, actor: string): Doc {
  const { doc, lane } = findOrAddLane(input, actor)
  const box = laneBoxes(doc.lanes).find((b) => b.id === lane.id)!
  return { ...doc, nodes: doc.nodes.map((n) => (n.id === nodeId ? clampNodeToLane(doc.lanes, { ...n, lane: lane.id, y: box.top + (box.height - NODE_H) / 2 }) : n)) }
}

/** Remove a node and splice its predecessor to its successor so the flow stays connected. */
export function removeStep(doc: Doc, nodeId: string): Doc {
  const inc = doc.connections.find((c) => c.to === nodeId && c.type === "sequence")
  const out = doc.connections.find((c) => c.from === nodeId && c.type === "sequence")
  let connections = doc.connections.filter((c) => c.from !== nodeId && c.to !== nodeId)
  if (inc && out) connections = [...connections, { ...inc, id: newId("e"), to: out.to }]
  return { ...doc, nodes: doc.nodes.filter((n) => n.id !== nodeId), connections }
}
