import { NODE_W, NODE_H, type Node, type Screen } from "./diagram-templates"

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

/**
 * Edges run center-to-center, so the line visually tucks under the node body.
 */
export function edgePath(start: Point, end: Point): string {
  const [c1, c2] = controls(start, end)
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`
}

/** Label anchor — the true midpoint of the curve, not of the chord. */
export function edgeMidpoint(start: Point, end: Point): Point {
  return cubicAt(start, end, 0.5)
}

/**
 * Anchor for an edge's label: the midpoint of the span that is actually visible
 * between the two nodes. Because edges run center-to-center, the geometric
 * midpoint of a short edge can fall inside a node — this keeps labels in the gap.
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

/**
 * Where the curve crosses the target node's border, plus the direction of travel
 * there — so an arrowhead can sit on the edge of the node even though the line
 * itself continues to the center underneath it.
 */
export function arrowAt(start: Point, end: Point, target: Node, pad = 3): { x: number; y: number; angle: number } {
  const STEPS = 64
  let t = 0.5
  // Walk back from the node center until we step outside the node's box
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
  // Reverse order so the visually topmost node wins
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]
    if (p.x >= n.x && p.x <= n.x + NODE_W && p.y >= n.y && p.y <= n.y + NODE_H) return n
  }
  return undefined
}

/** The screen that visually contains a node, by its center point. */
export function screenContaining(screens: Screen[], p: Point): Screen | undefined {
  for (let i = screens.length - 1; i >= 0; i--) {
    const s = screens[i]
    if (p.x >= s.x && p.x <= s.x + s.width && p.y >= s.y && p.y <= s.y + s.height) return s
  }
  return undefined
}

/** Normalize a drag rectangle so width/height are always positive. */
export function normalizeRect(a: Point, b: Point) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}
