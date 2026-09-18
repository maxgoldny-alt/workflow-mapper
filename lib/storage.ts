import {
  AREA_COLORS,
  LANE_COLORS,
  LANE_HEADER_W,
  LANE_MIN_H,
  NODE_H,
  blankModel,
  newId,
  type Channel,
  type Connection,
  type Doc,
  type Execution,
  type IntegrationState,
  type Lane,
  type Model,
  type Node,
  type Workspace,
} from "./model"
import { clampNodeToLane } from "./geometry"
import { workspaceFromTemplate } from "./templates"

export const STORAGE_KEY = "workflow-mapper-v5"
const V4_KEY = "workflow-mapper-v4"
const V3_KEY = "workflow-mapper-v3"
const V2_KEY = "workflow-mapper-state-v2"

export interface SavedState {
  activeId: string
  workspaces: Workspace[]
  /** True when nothing was saved in this browser before (show the welcome card). */
  fresh?: boolean
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

/* ----------------------------------------------------------- v4 shapes */

type V4Mechanism = "unknown" | "manual" | "email" | "chat" | "spreadsheet" | "api-available" | "api-wired" | "automated"
interface V4Connection {
  id?: string
  from: string
  to: string
  label?: string
  type: string
  mechanism?: V4Mechanism
  payload?: string
  notes?: string
}
export interface V4Doc {
  lanes: Lane[]
  nodes: Node[]
  connections: V4Connection[]
}

const looksLikeV3 = (d: unknown): d is V3Doc =>
  !!d && typeof d === "object" && Array.isArray((d as V3Doc).nodes) && Array.isArray((d as V3Doc).connections) && !Array.isArray((d as V4Doc).lanes)

const looksLikeV4Doc = (d: unknown): d is V4Doc =>
  !!d && typeof d === "object" && Array.isArray((d as V4Doc).lanes) && Array.isArray((d as V4Doc).nodes)

const looksLikeV5Model = (d: unknown): d is Model =>
  !!d && typeof d === "object" && (d as Model).version === 5 && Array.isArray((d as Model).processes)

/* ------------------------------------------------------------ v3 → v4 */

/**
 * Screens become lanes (one per screen, stacked in reading order). Nodes keep
 * their position relative to their old screen. Actor nodes become notes so no
 * information is lost; handoff edges become plain sequence edges since handoff
 * is now derived from lane crossing.
 */
export function migrateV3(v3: V3Doc): V4Doc {
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
  const nodeTypes = ["step", "decision", "tool", "system", "note", "trigger"]

  const nodes: Node[] = v3.nodes.map((n) => {
    const screen = screens.find((s) => s.id === n.screen)
    const laneId = screen ? screen.id : "unassigned"
    const base: Node = {
      id: n.id,
      label: n.label,
      sublabel: n.type === "actor" ? n.sublabel || "actor" : n.sublabel,
      type: n.type === "actor" ? "note" : nodeTypes.includes(n.type) ? (n.type as Node["type"]) : "step",
      x: screen ? n.x - screen.x + LANE_HEADER_W + 24 : n.x + LANE_HEADER_W + 24,
      y: screen ? laneTop[laneId] + (n.y - screen.y) : laneTop[laneId] + (n.y - orphanMinY) + 16,
      lane: laneId,
    }
    return clampNodeToLane(lanes, base)
  })

  const connections: V4Connection[] = v3.connections.map((c) => ({
    id: newId("e"),
    from: c.from,
    to: c.to,
    label: c.label,
    type: ["sequence", "yes", "no", "data", "uses"].includes(c.type) ? c.type : "sequence",
    mechanism: "unknown",
  }))

  return { lanes, nodes, connections }
}

/* ------------------------------------------------------------ v4 → v5 */

const MECHANISM_MAP: Record<V4Mechanism, { channel: Channel; execution: Execution; integration: IntegrationState }> = {
  manual: { channel: "other", execution: "human", integration: "none" },
  email: { channel: "email", execution: "human", integration: "none" },
  chat: { channel: "chat", execution: "human", integration: "none" },
  spreadsheet: { channel: "spreadsheet", execution: "human", integration: "none" },
  "api-available": { channel: "api", execution: "unknown", integration: "possible" },
  "api-wired": { channel: "api", execution: "system", integration: "live" },
  automated: { channel: "system", execution: "system", integration: "live" },
  unknown: { channel: "unknown", execution: "unknown", integration: "unknown" },
}

/** One v4 swimlane doc → v5 doc. The single `mechanism` splits into three dimensions. */
export function migrateDocV4(d: V4Doc): Doc {
  const edgeTypes = ["sequence", "yes", "no", "data", "uses"]
  const connections: Connection[] = d.connections.map((c) => {
    const m = MECHANISM_MAP[c.mechanism ?? "unknown"] ?? MECHANISM_MAP.unknown
    return {
      id: c.id ?? newId("e"),
      from: c.from,
      to: c.to,
      label: c.label,
      type: edgeTypes.includes(c.type) ? (c.type as Connection["type"]) : "sequence",
      channel: m.channel,
      execution: m.execution,
      integration: m.integration,
      payload: c.payload,
      notes: c.notes,
      verification: "reported",
    }
  })
  return { lanes: d.lanes, nodes: d.nodes, connections }
}

/** A list of v4 workflows becomes one workspace: each workflow is an area holding one process. */
export function migrateV4Workflows(workflows: { id: string; name: string; doc: V4Doc }[], companyName = "My company"): Workspace {
  const model = blankModel(companyName)
  workflows.forEach((w, i) => {
    const areaId = `area_${w.id}`
    model.areas.push({ id: areaId, name: w.name, order: i, color: AREA_COLORS[i % AREA_COLORS.length] })
    model.processes.push({ id: w.id, areaId, name: w.name, doc: migrateDocV4(w.doc) })
  })
  return { id: newId("ws"), name: companyName, model }
}

/* ------------------------------------------------------------- imports */

export type Imported = { kind: "workspace"; workspace: Workspace } | { kind: "process"; name?: string; doc: Doc } | null

/** Accepts v3, v4 or v5 JSON. Older formats land as a single process. */
export function coerceImport(data: unknown): Imported {
  if (!data || typeof data !== "object") return null
  const obj = data as Record<string, unknown>
  if (looksLikeV5Model(obj)) return { kind: "workspace", workspace: { id: newId("ws"), name: obj.company.name, model: obj } }
  if (looksLikeV5Model(obj.model)) {
    const m = obj.model as Model
    return { kind: "workspace", workspace: { id: newId("ws"), name: (obj.name as string) || m.company.name, model: m } }
  }
  const name = typeof obj.name === "string" ? obj.name : undefined
  if (looksLikeV4Doc(obj)) return { kind: "process", name, doc: migrateDocV4(obj) }
  if (looksLikeV3(obj)) return { kind: "process", name, doc: migrateDocV4(migrateV3(obj)) }
  return null
}

/* ----------------------------------------------------------- load/save */

export function loadState(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as SavedState
      if (Array.isArray(saved.workspaces) && saved.workspaces.length) {
        return { activeId: saved.activeId ?? saved.workspaces[0].id, workspaces: saved.workspaces }
      }
    }
    const v4 = localStorage.getItem(V4_KEY)
    if (v4) {
      const saved = JSON.parse(v4) as { workflows?: { id: string; name: string; doc: V4Doc }[] }
      if (Array.isArray(saved.workflows) && saved.workflows.length) {
        const ws = migrateV4Workflows(saved.workflows)
        return { activeId: ws.id, workspaces: [ws] }
      }
    }
    const v3 = localStorage.getItem(V3_KEY)
    if (v3) {
      const saved = JSON.parse(v3) as { workflows?: { id: string; name: string; doc: V3Doc }[] }
      if (Array.isArray(saved.workflows) && saved.workflows.length) {
        const ws = migrateV4Workflows(saved.workflows.map((w) => ({ id: w.id, name: w.name, doc: migrateV3(w.doc) })))
        return { activeId: ws.id, workspaces: [ws] }
      }
    }
    const v2 = localStorage.getItem(V2_KEY)
    if (v2) {
      const d = JSON.parse(v2)
      if (looksLikeV3(d)) {
        const ws = migrateV4Workflows([{ id: newId("wf"), name: "My workflow", doc: migrateV3(d) }])
        return { activeId: ws.id, workspaces: [ws] }
      }
    }
  } catch {
    /* corrupt or unavailable storage — fall through to the default */
  }
  const ws = workspaceFromTemplate()
  return { activeId: ws.id, workspaces: [ws], fresh: true }
}

export function saveState(state: SavedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeId: state.activeId, workspaces: state.workspaces }))
  } catch {
    /* storage unavailable — skip this save */
  }
}
