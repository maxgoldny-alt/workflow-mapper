import { LANE_HEADER_W, NODE_H, NODE_W, type Doc, type Frame, type Node } from "./model"
import { laneBoxes } from "./geometry"

const COL_W = NODE_W + 56
const ROW_H = NODE_H + 24
const LEFT = LANE_HEADER_W + 40
const PAD = 8

/** Nodes whose centre lies inside a frame. */
export function nodesInFrame(doc: Doc, f: Frame): Node[] {
  return doc.nodes.filter((n) => {
    const cx = n.x + NODE_W / 2
    const cy = n.y + NODE_H / 2
    return cx >= f.x && cx <= f.x + f.width && cy >= f.y && cy <= f.y + f.height
  })
}

/** Smallest box around a set of nodes, with padding for the title bar. */
export function boundsOf(nodes: Node[], title = true): { x: number; y: number; width: number; height: number } | null {
  if (!nodes.length) return null
  const minX = Math.min(...nodes.map((n) => n.x)) - 16
  const minY = Math.min(...nodes.map((n) => n.y)) - (title ? 36 : 16)
  const maxX = Math.max(...nodes.map((n) => n.x + NODE_W)) + 16
  const maxY = Math.max(...nodes.map((n) => n.y + NODE_H)) + 16
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Lay the process out left to right in flow order: each step's column is one
 * past the longest chain leading into it, rows stay in the owner's lane, and
 * lanes grow when several steps share a column. Frames are refitted around the
 * nodes they contained before the move. Positions only; nothing semantic changes.
 */
export function autoArrange(doc: Doc): Doc {
  const flow = doc.connections.filter((c) => c.type !== "uses" && c.type !== "data")
  const ids = doc.nodes.map((n) => n.id)
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]))
  const outgoing = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const c of flow) {
    if (!incoming.has(c.to) || !outgoing.has(c.from)) continue
    incoming.get(c.to)!.push(c.from)
    outgoing.get(c.from)!.push(c.to)
  }

  // Longest-path layering with cycle protection
  const col = new Map<string, number>()
  const visiting = new Set<string>()
  const depth = (id: string): number => {
    if (col.has(id)) return col.get(id)!
    if (visiting.has(id)) return 0
    visiting.add(id)
    const preds = incoming.get(id) ?? []
    const d = preds.length ? Math.max(...preds.map((p) => depth(p) + 1)) : 0
    visiting.delete(id)
    col.set(id, d)
    return d
  }
  // Stable order: current x, then y, so hand-placed order survives ties
  const ordered = [...doc.nodes].sort((a, b) => a.x - b.x || a.y - b.y)
  for (const n of ordered) depth(n.id)

  // Tools/systems with only "uses"/"data" edges sit under the first step that uses them
  for (const n of ordered) {
    if ((n.type === "tool" || n.type === "system") && !(incoming.get(n.id)?.length || outgoing.get(n.id)?.length)) {
      const users = doc.connections.filter((c) => c.to === n.id || c.from === n.id).map((c) => (c.to === n.id ? c.from : c.to))
      const cols = users.map((u) => col.get(u)).filter((x): x is number => x !== undefined)
      col.set(n.id, cols.length ? Math.min(...cols) : 0)
    }
  }

  // Remember frame membership before nodes move
  const frames = doc.frames ?? []
  const membership = frames.map((f) => nodesInFrame(doc, f).map((n) => n.id))

  // Stack nodes that share lane + column
  const rowsUsed = new Map<string, number>()
  const laneRows = new Map<string, number>()
  const placed = new Map<string, { x: number; row: number }>()
  for (const n of ordered) {
    const c = col.get(n.id) ?? 0
    const key = `${n.lane}:${c}`
    const row = rowsUsed.get(key) ?? 0
    rowsUsed.set(key, row + 1)
    laneRows.set(n.lane, Math.max(laneRows.get(n.lane) ?? 1, row + 1))
    placed.set(n.id, { x: LEFT + c * COL_W, row })
  }

  // Grow lanes to fit their rows, then compute tops
  const lanes = doc.lanes.map((l) => ({ ...l, height: Math.max(l.height, (laneRows.get(l.id) ?? 1) * ROW_H + PAD * 2 + 8) }))
  const boxes = laneBoxes(lanes)
  const nodes = doc.nodes.map((n) => {
    const p = placed.get(n.id)
    const box = boxes.find((b) => b.id === n.lane) ?? boxes[0]
    if (!p || !box) return n
    const rows = laneRows.get(n.lane) ?? 1
    const blockTop = box.top + (box.height - rows * ROW_H) / 2
    return { ...n, x: p.x, y: blockTop + p.row * ROW_H + (ROW_H - NODE_H) / 2 }
  })

  const next: Doc = { ...doc, lanes, nodes }
  next.frames = frames.map((f, i) => {
    const members = nodes.filter((n) => membership[i].includes(n.id))
    const b = boundsOf(members)
    return b ? { ...f, ...b } : f
  })
  return next
}
