import { NODE_W, NODE_H, LANE_HEADER_W, LANE_MIN_W, type Doc, type Lane, type Node } from "./model"

export interface Point {
  x: number
  y: number
}

export const nodeCenter = (n: Node): Point => ({ x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 })

/** Control points for the horizontally-biased bezier used by every edge. */
function controls(start: Point, end: Point): [Point, Point] {
  const dx = end.x - start.x
  const dy = end.y - start.y
  // Straight-ish for near-vertical pairs, curved for horizontal runs
  const bend = Math.max(Math.abs(dx) * 0.4, Math.abs(dy) > Math.abs(dx) ? 0 : 24)
  return [
    { x: start.x + bend, y: start.y },
    { x: end.x - bend, y: end.y },
  ]
}

function cubicAt(start: Point, end: Point, t: number): Point {
  const [c1, c2] = controls(start, end)
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * start.x + b * c1.x + c * c2.x + d * end.x,
    y: a * start.y + b * c1.y + c * c2.y + d * end.y,
  }
}

const insideRect = (p: Point, n: Node, pad: number) =>
  p.x >= n.x - pad && p.x <= n.x + NODE_W + pad && p.y >= n.y - pad && p.y <= n.y + NODE_H + pad

/** Edges run center-to-center, so the line visually tucks under the node body. */
export function edgePath(start: Point, end: Point): string {
  const [c1, c2] = controls(start, end)
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`
}

/**
 * Anchor for an edge's label: the midpoint of the span that is actually visible
 * between the two nodes, so short edges don't hide their label under a node.
 */
export function edgeLabelPoint(start: Point, end: Point, from: Node, to: Node): Point {
  const STEPS = 48
  let tExit = 0
  let tEnter = 1
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    if (insideRect(cubicAt(start, end, t), from, 0)) tExit = t
    else break
  }
  for (let i = STEPS; i >= 0; i--) {
    const t = i / STEPS
    if (insideRect(cubicAt(start, end, t), to, 0)) tEnter = t
    else break
  }
  if (tEnter <= tExit) return cubicAt(start, end, 0.5)
  return cubicAt(start, end, (tExit + tEnter) / 2)
}

/** Where the curve crosses the target node's border, plus the direction of travel there. */
export function arrowAt(start: Point, end: Point, target: Node, pad = 3): { x: number; y: number; angle: number } {
  const STEPS = 64
  let t = 0.5
  for (let i = STEPS; i >= 0; i--) {
    const tt = i / STEPS
    if (!insideRect(cubicAt(start, end, tt), target, pad)) {
      t = tt
      break
    }
  }
  const p = cubicAt(start, end, t)
  const ahead = cubicAt(start, end, Math.min(1, t + 0.02))
  return { x: p.x, y: p.y, angle: (Math.atan2(ahead.y - p.y, ahead.x - p.x) * 180) / Math.PI }
}

export function nodeAtPoint(nodes: Node[], p: Point): Node | undefined {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]
    if (p.x >= n.x && p.x <= n.x + NODE_W && p.y >= n.y && p.y <= n.y + NODE_H) return n
  }
  return undefined
}

/* ------------------------------------------------------------------ lanes */

export interface LaneBox extends Lane {
  top: number
  bottom: number
}

/** Lanes stack from y=0 with no gaps; their vertical position is derived from order. */
export function laneBoxes(lanes: Lane[]): LaneBox[] {
  let y = 0
  return lanes.map((l) => {
    const box = { ...l, top: y, bottom: y + l.height }
    y += l.height
    return box
  })
}

export const lanesHeight = (lanes: Lane[]) => lanes.reduce((s, l) => s + l.height, 0)

/** Board width grows with content so there is always room to the right. */
export const lanesWidth = (doc: Doc) =>
  Math.max(LANE_MIN_W, ...doc.nodes.map((n) => n.x + NODE_W + 240))

/** The lane whose band contains a y coordinate; clamps to the first/last lane. */
export function laneAtY(lanes: Lane[], y: number): LaneBox | undefined {
  const boxes = laneBoxes(lanes)
  if (!boxes.length) return undefined
  return boxes.find((b) => y >= b.top && y < b.bottom) ?? (y < 0 ? boxes[0] : boxes[boxes.length - 1])
}

/** Snap a node into the lane under its center and keep it fully inside that band. */
export function clampNodeToLane(lanes: Lane[], n: Node): Node {
  const lane = laneAtY(lanes, n.y + NODE_H / 2)
  if (!lane) return n
  const pad = 8
  const y = Math.min(Math.max(n.y, lane.top + pad), Math.max(lane.top + pad, lane.bottom - NODE_H - pad))
  const x = Math.max(n.x, LANE_HEADER_W + pad)
  return { ...n, x, y, lane: lane.id }
}

/* ------------------------------------------------------------- selection */

export const GRID = 8

export const snapNode = (n: Node): Node => ({
  ...n,
  x: Math.round(n.x / GRID) * GRID,
  y: Math.round(n.y / GRID) * GRID,
})

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Normalize a drag rectangle so width/height are always positive. */
export function normalizeRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
}

/** Nodes whose box overlaps the rectangle at all. */
export const nodesInRect = (nodes: Node[], r: Rect) =>
  nodes.filter((n) => n.x < r.x + r.width && n.x + NODE_W > r.x && n.y < r.y + r.height && n.y + NODE_H > r.y)
