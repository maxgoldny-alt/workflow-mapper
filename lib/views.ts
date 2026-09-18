import type { Connection, Doc, Node } from "./model"
import { isHandoff } from "./model"
import type { Finding } from "./findings"

/**
 * Views are overlays on the same model: they dim, badge, or annotate; they
 * never copy the workflow.
 */
export type View = "operational" | "actors" | "systems" | "data" | "gaps" | "opportunity"

export const VIEW_META: Record<View, { label: string; hint: string }> = {
  operational: { label: "Operational", hint: "What happens, in order" },
  actors: { label: "Actors", hint: "Who owns each step and where responsibility changes" },
  systems: { label: "Systems", hint: "Which systems and tools are involved" },
  data: { label: "Data", hint: "What information moves between steps and systems" },
  gaps: { label: "Gaps", hint: "Unknowns, manual work, fragile handoffs" },
  opportunity: { label: "Opportunity", hint: "Potential improvements, from confirmed facts only" },
}
export const VIEWS = Object.keys(VIEW_META) as View[]

export interface NodeStyle {
  dimmed: boolean
  badge?: { text: string; color: string; title: string }
}
export interface EdgeStyle {
  dimmed: boolean
  emphasised: boolean
  showPayload: boolean
  badge?: { text: string; color: string; title: string }
}

const FINDING_COLOR = { observation: "#d97706", potential: "#0891b2", verified: "#059669" }

export function nodeStyle(view: View, node: Node, findings: Finding[]): NodeStyle {
  const mine = findings.filter((f) => f.ref.nodeId === node.id)
  const isSystem = node.type === "system" || node.type === "tool"
  switch (view) {
    case "systems":
      return { dimmed: !isSystem && !node.systemId }
    case "data":
      return { dimmed: !(node.dataIn?.length || node.dataOut?.length || isSystem) }
    case "gaps": {
      const obs = mine.filter((f) => f.level === "observation")
      return {
        dimmed: mine.length === 0,
        badge: obs.length ? { text: String(obs.length), color: FINDING_COLOR.observation, title: obs.map((f) => f.title).join("\n") } : undefined,
      }
    }
    case "opportunity": {
      const opp = mine.filter((f) => f.level !== "observation")
      return {
        dimmed: opp.length === 0,
        badge: opp.length ? { text: String(opp.length), color: FINDING_COLOR[opp[0].level], title: opp.map((f) => f.title).join("\n") } : undefined,
      }
    }
    default:
      return { dimmed: false }
  }
}

export function edgeStyle(view: View, doc: Doc, edge: Connection, findings: Finding[]): EdgeStyle {
  const handoff = isHandoff(doc, edge)
  const mine = findings.filter((f) => f.ref.connectionId === edge.id)
  const base: EdgeStyle = { dimmed: false, emphasised: handoff, showPayload: false }
  switch (view) {
    case "actors":
      return { ...base, dimmed: !handoff, emphasised: handoff }
    case "systems":
      return { ...base, dimmed: !(edge.type === "uses" || edge.type === "data" || edge.channel === "api" || edge.channel === "system") }
    case "data":
      return { ...base, dimmed: !(edge.payload || edge.dataObjectIds?.length), showPayload: true }
    case "gaps": {
      const obs = mine.filter((f) => f.level === "observation")
      return {
        ...base,
        dimmed: obs.length === 0,
        badge: obs.length ? { text: String(obs.length), color: FINDING_COLOR.observation, title: obs.map((f) => f.title).join("\n") } : undefined,
      }
    }
    case "opportunity": {
      const opp = mine.filter((f) => f.level !== "observation")
      return {
        ...base,
        dimmed: opp.length === 0,
        badge: opp.length ? { text: String(opp.length), color: FINDING_COLOR[opp[0].level], title: opp.map((f) => f.title).join("\n") } : undefined,
      }
    }
    default:
      return base
  }
}
