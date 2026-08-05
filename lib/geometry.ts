import { NODE_W, NODE_H, type Node, type Screen } from "./diagram-templates"

export interface Point {
  x: number
  y: number
}

export const nodeCenter = (n: Node): Point => ({ x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 })

/**
 * Point on the border of a node's rectangle, on the ray from its center toward `toward`.
 * Used so edges start and stop at the node edge instead of burying their arrowheads
 * under the node body.
 */
export function borderPoint(node: Node, toward: Point, pad = 4): Point {
  const c = nodeCenter(node)
  const dx = toward.x - c.x
  const dy = toward.y - c.y

  if (dx === 0 && dy === 0) return c

  const halfW = NODE_W / 2 + pad
  const halfH = NODE_H / 2 + pad

  // Scale the direction vector until it hits whichever edge it reaches first
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : halfW / Math.abs(dx)
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : halfH / Math.abs(dy)
  const scale = Math.min(scaleX, scaleY)

  return { x: c.x + dx * scale, y: c.y + dy * scale }
}

/** Anchor points for an edge drawn between two nodes. */
export function edgeAnchors(from: Node, to: Node): { start: Point; end: Point } {
  return {
    start: borderPoint(from, nodeCenter(to)),
    end: borderPoint(to, nodeCenter(from)),
  }
}

/** Horizontally-biased bezier, which reads as flow direction on a left-to-right map. */
export function edgePath(start: Point, end: Point): string {
  const dx = end.x - start.x
  const dy = end.y - start.y
  // Straight-ish for near-vertical pairs, curved for horizontal runs
  const bend = Math.max(Math.abs(dx) * 0.4, Math.abs(dy) > Math.abs(dx) ? 0 : 24)
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`
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
