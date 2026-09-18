import type { Ref } from "./model"

/** What the inspector is looking at. */
export type Selection =
  | { kind: "node"; id: string }
  | { kind: "nodes"; ids: string[] }
  | { kind: "edge"; id: string }
  | { kind: "lane"; id: string }
  | { kind: "area"; id: string }
  | { kind: "areaLink"; id: string }
  | { kind: "process"; id: string }
  | { kind: "system"; id: string }
  | { kind: "actor"; id: string }
  | { kind: "question"; id: string }
  | null

/** Where the user is in the Company → Area → Process hierarchy. */
export type Nav = { level: "company" } | { level: "area"; areaId: string } | { level: "process"; processId: string }

/** Turn a model reference into a navigation target plus selection. */
export function navForRef(ref: Ref): { nav: Nav; selection: Selection } {
  if (ref.processId) {
    const selection: Selection = ref.nodeId
      ? { kind: "node", id: ref.nodeId }
      : ref.connectionId
        ? { kind: "edge", id: ref.connectionId }
        : { kind: "process", id: ref.processId }
    return { nav: { level: "process", processId: ref.processId }, selection }
  }
  if (ref.areaId) return { nav: { level: "area", areaId: ref.areaId }, selection: { kind: "area", id: ref.areaId } }
  if (ref.systemId) return { nav: { level: "company" }, selection: { kind: "system", id: ref.systemId } }
  if (ref.actorId) return { nav: { level: "company" }, selection: { kind: "actor", id: ref.actorId } }
  return { nav: { level: "company" }, selection: null }
}
