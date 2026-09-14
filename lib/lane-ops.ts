import { LANE_COLORS, LANE_MIN_H, uniqueId, type Doc, type Lane } from "./model"
import { clampNodeToLane, laneBoxes } from "./geometry"

/** Shift every node so it stays in the same place relative to its lane after lanes moved. */
function reflowNodes(before: Lane[], after: Lane[], doc: Doc): Doc {
  const oldTop = Object.fromEntries(laneBoxes(before).map((b) => [b.id, b.top]))
  const newTop = Object.fromEntries(laneBoxes(after).map((b) => [b.id, b.top]))
  return {
    ...doc,
    lanes: after,
    nodes: doc.nodes.map((n) => {
      const delta = (newTop[n.lane] ?? 0) - (oldTop[n.lane] ?? 0)
      return delta ? { ...n, y: n.y + delta } : n
    }),
  }
}

export function addLane(doc: Doc): { doc: Doc; id: string } {
  const id = uniqueId("lane", doc.lanes)
  const lane: Lane = {
    id,
    actor: `Actor ${doc.lanes.length + 1}`,
    height: 200,
    color: LANE_COLORS[doc.lanes.length % LANE_COLORS.length],
  }
  return { doc: { ...doc, lanes: [...doc.lanes, lane] }, id }
}

export function moveLane(doc: Doc, id: string, toIndex: number): Doc {
  const from = doc.lanes.findIndex((l) => l.id === id)
  const to = Math.max(0, Math.min(doc.lanes.length - 1, toIndex))
  if (from < 0 || from === to) return doc
  const lanes = [...doc.lanes]
  const [lane] = lanes.splice(from, 1)
  lanes.splice(to, 0, lane)
  return reflowNodes(doc.lanes, lanes, doc)
}

/** Returns the doc plus how much the lane actually grew, so a drag can track the clamp. */
export function resizeLane(doc: Doc, id: string, dy: number): { doc: Doc; applied: number } {
  const lane = doc.lanes.find((l) => l.id === id)
  if (!lane) return { doc, applied: 0 }
  const height = Math.max(LANE_MIN_H, lane.height + dy)
  const applied = height - lane.height
  if (!applied) return { doc, applied: 0 }
  const lanes = doc.lanes.map((l) => (l.id === id ? { ...l, height } : l))
  return { doc: reflowNodes(doc.lanes, lanes, doc), applied }
}

/** Nodes in the removed lane are re-homed into the neighbouring lane. */
export function removeLane(doc: Doc, id: string): Doc {
  if (doc.lanes.length <= 1) return doc
  const idx = doc.lanes.findIndex((l) => l.id === id)
  if (idx < 0) return doc
  const neighbour = doc.lanes[idx > 0 ? idx - 1 : 1]
  const lanes = doc.lanes.filter((l) => l.id !== id)
  const reflowed = reflowNodes(doc.lanes, lanes, { ...doc, nodes: doc.nodes })
  const nTop = laneBoxes(lanes).find((b) => b.id === neighbour.id)!.top
  return {
    ...reflowed,
    nodes: reflowed.nodes.map((n) =>
      n.lane === id ? clampNodeToLane(lanes, { ...n, lane: neighbour.id, y: nTop + 8 }) : n,
    ),
  }
}
