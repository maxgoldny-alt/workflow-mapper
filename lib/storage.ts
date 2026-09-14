import {
  LANE_COLORS,
  LANE_HEADER_W,
  LANE_MIN_H,
  NODE_H,
  newId,
  type Connection,
  type Doc,
  type Lane,
  type Node,
  type WorkflowFile,
} from "./model"
import { clampNodeToLane } from "./geometry"
import { docFromTemplate } from "./templates"

export const STORAGE_KEY = "workflow-mapper-v4"
const V3_KEY = "workflow-mapper-v3"
const V2_KEY = "workflow-mapper-state-v2"

export interface SavedState {
  activeId: string
  workflows: WorkflowFile[]
}

/* ----------------------------------------------------------- v3 shapes */

interface V3Screen {
  id: string
  title: string
  x: number
  y: number
  width: number
  height: number
}
interface V3Node {
  id: string
  label: string
  sublabel?: string
  type: string
  x: number
  y: number
  screen?: string
}
interface V3Connection {
  from: string
  to: string
  label?: string
  type: string
}
export interface V3Doc {
  nodes: V3Node[]
  connections: V3Connection[]
  screens?: V3Screen[]
}

export const looksLikeV4 = (d: unknown): d is Doc =>
  !!d && typeof d === "object" && Array.isArray((d as Doc).lanes) && Array.isArray((d as Doc).nodes)

export const looksLikeV3 = (d: unknown): d is V3Doc =>
  !!d && typeof d === "object" && Array.isArray((d as V3Doc).nodes) && Array.isArray((d as V3Doc).connections)

/**
 * Screens become lanes (one per screen, stacked in reading order). Nodes keep
 * their position relative to their old screen. Actor nodes become notes so no
 * information is lost; handoff edges become plain sequence edges since handoff
 * is now derived from lane crossing.
 */
export function migrateV3(v3: V3Doc): Doc {
  const screens = [...(v3.screens ?? [])].sort((a, b) => a.y - b.y || a.x - b.x)
  const lanes: Lane[] = screens.map((s, i) => ({
    id: s.id,
    actor: s.title,
    height: Math.max(LANE_MIN_H, s.height),
    color: LANE_COLORS[i % LANE_COLORS.length],
  }))

  const orphaned = v3.nodes.filter((n) => !n.screen || !screens.some((s) => s.id === n.screen))
  if (orphaned.length || !lanes.length) {
    const maxY = Math.max(0, ...orphaned.map((n) => n.y + NODE_H))
    const minY = Math.min(0, ...orphaned.map((n) => n.y))
    lanes.push({
      id: "unassigned",
      actor: lanes.length ? "Unassigned" : "Actor 1",
      height: Math.max(220, maxY - minY + 40),
      color: LANE_COLORS[lanes.length % LANE_COLORS.length],
    })
  }

  let top = 0
  const laneTop: Record<string, number> = {}
  for (const l of lanes) {
    laneTop[l.id] = top
    top += l.height
  }
  const orphanMinY = Math.min(0, ...orphaned.map((n) => n.y))

  const nodes: Node[] = v3.nodes.map((n) => {
    const screen = screens.find((s) => s.id === n.screen)
    const laneId = screen ? screen.id : "unassigned"
    const base: Node = {
      id: n.id,
      label: n.label,
      sublabel: n.type === "actor" ? n.sublabel || "actor" : n.sublabel,
      type: n.type === "actor" ? "note" : (["step", "decision", "tool", "system", "note"].includes(n.type) ? (n.type as Node["type"]) : "step"),
      x: screen ? n.x - screen.x + LANE_HEADER_W + 24 : n.x + LANE_HEADER_W + 24,
      y: screen ? laneTop[laneId] + (n.y - screen.y) : laneTop[laneId] + (n.y - orphanMinY) + 16,
      lane: laneId,
    }
    return clampNodeToLane(lanes, base)
  })

  const connections: Connection[] = v3.connections.map((c) => ({
    id: newId("e"),
    from: c.from,
    to: c.to,
    label: c.label,
    type: ["sequence", "yes", "no", "data", "uses"].includes(c.type) ? (c.type as Connection["type"]) : "sequence",
    mechanism: "unknown",
  }))

  return { lanes, nodes, connections }
}

/** Accepts either shape; returns a v4 doc or null when it is not a workflow at all. */
export function coerceDoc(data: unknown): Doc | null {
  if (looksLikeV4(data)) {
    const d = data as Doc
    return {
      lanes: d.lanes,
      nodes: d.nodes,
      connections: (d.connections ?? []).map((c) => ({ ...c, id: c.id ?? newId("e"), mechanism: c.mechanism ?? "unknown" })),
    }
  }
  if (looksLikeV3(data)) return migrateV3(data)
  return null
}

/* ----------------------------------------------------------- load/save */

export function loadState(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as SavedState
      if (Array.isArray(saved.workflows) && saved.workflows.length) {
        return { activeId: saved.activeId ?? saved.workflows[0].id, workflows: saved.workflows }
      }
    }
    const v3 = localStorage.getItem(V3_KEY)
    if (v3) {
      const saved = JSON.parse(v3) as { activeId?: string; workflows?: { id: string; name: string; doc: V3Doc }[] }
      if (Array.isArray(saved.workflows) && saved.workflows.length) {
        const workflows = saved.workflows.map((w) => ({ id: w.id, name: w.name, doc: migrateV3(w.doc) }))
        return { activeId: saved.activeId ?? workflows[0].id, workflows }
      }
    }
    const v2 = localStorage.getItem(V2_KEY)
    if (v2) {
      const d = JSON.parse(v2)
      if (looksLikeV3(d)) {
        const id = newId("wf")
        return { activeId: id, workflows: [{ id, name: "My workflow", doc: migrateV3(d) }] }
      }
    }
  } catch {
    /* corrupt or unavailable storage — fall through to the default */
  }
  return { activeId: "wf_default", workflows: [{ id: "wf_default", name: "Operational Core", doc: docFromTemplate() }] }
}

export function saveState(state: SavedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage unavailable — skip this save */
  }
}
