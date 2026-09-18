import {
  handoffs,
  isManualEdge,
  laneById,
  nodeById,
  systemById,
  type Doc,
  type Model,
  type Process,
  type Ref,
} from "./model"

/**
 * Deterministic findings from graph structure and recorded facts.
 *
 * Levels:
 *  observation — something worth knowing; not a problem by itself
 *  potential   — a structural pattern that is often improvable; confirmed facts only
 *  verified    — an opportunity backed by verified platform capabilities (nothing
 *                in this iteration produces these: capabilities are never fabricated)
 */
export type FindingLevel = "observation" | "potential" | "verified"

export type FindingRule =
  | "manual-reentry"
  | "duplicate-entry"
  | "human-polling"
  | "cross-actor-handoff"
  | "spreadsheet-transport"
  | "email-transport"
  | "chat-transport"
  | "paper-transport"
  | "undefined-owner"
  | "single-branch-decision"
  | "disconnected-step"
  | "unknown-trigger"
  | "unknown-channel"
  | "unknown-execution"
  | "unknown-system"
  | "unresolved-question"
  | "single-person-dependency"
  | "no-output"
  | "unconsumed-output"
  | "inferred-fact"

export interface Finding {
  id: string
  rule: FindingRule
  level: FindingLevel
  title: string
  detail: string
  ref: Ref
}

export const RULE_META: Record<FindingRule, { label: string }> = {
  "manual-reentry": { label: "Manual re-entry between systems" },
  "duplicate-entry": { label: "Same data entered into more than one system" },
  "human-polling": { label: "A person checks a system for new work" },
  "cross-actor-handoff": { label: "Handoff between people" },
  "spreadsheet-transport": { label: "Spreadsheet used as transport" },
  "email-transport": { label: "Email used as transport" },
  "chat-transport": { label: "Chat used as transport" },
  "paper-transport": { label: "Paper used as transport" },
  "undefined-owner": { label: "No clear owner" },
  "single-branch-decision": { label: "Decision with only one branch" },
  "disconnected-step": { label: "Step not connected to anything" },
  "unknown-trigger": { label: "Trigger not established" },
  "unknown-channel": { label: "Channel not established" },
  "unknown-execution": { label: "Unknown whether a person or a system does this" },
  "unknown-system": { label: "System not identified" },
  "unresolved-question": { label: "Open question" },
  "single-person-dependency": { label: "Process depends on one named person" },
  "no-output": { label: "Step with no output" },
  "unconsumed-output": { label: "Output nobody consumes" },
  "inferred-fact": { label: "Inferred, not confirmed" },
}

let seq = 0
const mk = (rule: FindingRule, level: FindingLevel, title: string, detail: string, ref: Ref): Finding => ({
  id: `f_${rule}_${ref.processId ?? ref.areaId ?? "m"}_${ref.nodeId ?? ref.connectionId ?? ref.systemId ?? seq++}`,
  rule,
  level,
  title,
  detail,
  ref,
})

function processFindings(m: Model, p: Process): Finding[] {
  const out: Finding[] = []
  const doc: Doc = p.doc
  const pid = p.id
  const ref = (extra: Ref): Ref => ({ processId: pid, areaId: p.areaId, ...extra })

  const outgoing = (id: string) => doc.connections.filter((c) => c.from === id)
  const incoming = (id: string) => doc.connections.filter((c) => c.to === id)
  const isWork = (t: string) => t === "step" || t === "decision" || t === "trigger"

  for (const n of doc.nodes) {
    if (!isWork(n.type)) continue
    const outs = outgoing(n.id)
    const ins = incoming(n.id)
    const laneName = laneById(doc, n.lane)?.actor ?? "?"

    if (outs.length === 0 && ins.length === 0)
      out.push(mk("disconnected-step", "observation", `"${n.label}" is not connected`, `In ${laneName}'s lane, nothing leads in or out.`, ref({ nodeId: n.id })))
    else if (outs.filter((c) => c.type !== "uses").length === 0 && n.type !== "decision")
      out.push(mk("no-output", "observation", `"${n.label}" has no next step`, `Where does the work go after ${laneName} finishes this?`, ref({ nodeId: n.id })))

    if (n.type === "decision" && outs.filter((c) => c.type !== "uses").length === 1)
      out.push(mk("single-branch-decision", "observation", `"${n.label}" has only one outcome`, `A decision usually has at least a yes and a no path. What happens on the other outcome?`, ref({ nodeId: n.id })))

    if (n.verification === "inferred")
      out.push(mk("inferred-fact", "observation", `"${n.label}" was inferred`, `This step was guessed from context and has not been confirmed.`, ref({ nodeId: n.id })))

    // Unknown system on a step that clearly uses one
    if (n.systemId && !systemById(m, n.systemId))
      out.push(mk("unknown-system", "observation", `"${n.label}" references a system that no longer exists`, `Re-link or clear the system on this step.`, ref({ nodeId: n.id })))
  }

  for (const n of doc.nodes) {
    if ((n.type === "system" || n.type === "tool") && !n.systemId)
      out.push(mk("unknown-system", "observation", `"${n.label}" is not a catalogued system`, `Link it to a system so its platform, owner and integration state can be recorded.`, ref({ nodeId: n.id })))
  }

  for (const c of doc.connections) {
    const from = nodeById(doc, c.from)
    const to = nodeById(doc, c.to)
    if (!from || !to) continue
    const fromLane = laneById(doc, from.lane)?.actor ?? "?"
    const toLane = laneById(doc, to.lane)?.actor ?? "?"
    const handoff = from.lane !== to.lane
    const r = ref({ connectionId: c.id })
    const label = `${from.label} → ${to.label}`

    if (handoff) out.push(mk("cross-actor-handoff", "observation", `Handoff: ${fromLane} → ${toLane}`, `${label}. Responsibility changes hands here.`, r))
    if (c.triggerKind === "human-check")
      out.push(mk("human-polling", "observation", `${toLane} checks for new work by hand`, `${label}: ${c.trigger || "a person has to look"}.`, r))
    if (c.channel === "spreadsheet" || c.channel === "csv") out.push(mk("spreadsheet-transport", "observation", `Spreadsheet carries "${c.payload || "data"}"`, label, r))
    if (c.channel === "email") out.push(mk("email-transport", "observation", `Email carries "${c.payload || "data"}"`, label, r))
    if (c.channel === "slack" || c.channel === "teams" || c.channel === "whatsapp" || c.channel === "chat")
      out.push(mk("chat-transport", "observation", `Chat carries "${c.payload || "data"}"`, label, r))
    if (c.channel === "paper") out.push(mk("paper-transport", "observation", `Paper carries "${c.payload || "data"}"`, label, r))
    if (handoff && c.channel === "unknown") out.push(mk("unknown-channel", "observation", `How does ${toLane} receive this?`, label, r))
    if (handoff && c.execution === "unknown") out.push(mk("unknown-execution", "observation", `Person or system? ${label}`, `Nobody has said whether a person carries this or a system does.`, r))
    if (handoff && !c.triggerKind && c.execution !== "system")
      out.push(mk("unknown-trigger", "observation", `How does ${toLane} know it is ready?`, `${label} has no trigger recorded.`, r))
    if (c.verification === "inferred") out.push(mk("inferred-fact", "observation", `Connection "${label}" was inferred`, `Guessed from context; confirm it.`, r))

    // Manual movement of data between two catalogued systems, by a person
    const fromSys = from.systemId ?? (from.type === "system" || from.type === "tool" ? from.id : undefined)
    const toSys = to.systemId ?? (to.type === "system" || to.type === "tool" ? to.id : undefined)
    if (c.execution === "human" && (c.dataObjectIds?.length || c.payload) && from.dataIn?.length && to.systemId && from.systemId !== to.systemId) {
      out.push(mk("manual-reentry", c.verification === "confirmed" ? "potential" : "observation", `"${c.payload || "Data"}" is re-keyed into ${systemById(m, to.systemId)?.name ?? to.label}`, `${fromLane} moves it by hand: ${label}.`, r))
    } else if (c.execution === "human" && fromSys && toSys && fromSys !== toSys) {
      out.push(mk("manual-reentry", "observation", `Data moves by hand between systems`, `${label}`, r))
    }
  }

  // Same DataObject written (dataOut) by more than one step in different systems
  const writers = new Map<string, { nodeId: string; systemId?: string }[]>()
  for (const n of doc.nodes) for (const d of n.dataOut ?? []) writers.set(d, [...(writers.get(d) ?? []), { nodeId: n.id, systemId: n.systemId }])
  for (const [d, ws] of writers) {
    const systems = new Set(ws.map((w) => w.systemId).filter(Boolean))
    if (systems.size > 1) {
      const name = m.dataObjects.find((o) => o.id === d)?.name ?? d
      const confirmed = ws.every((w) => nodeById(doc, w.nodeId)?.verification === "confirmed")
      out.push(mk("duplicate-entry", confirmed ? "potential" : "observation", `"${name}" is entered into ${systems.size} systems`, `${ws.map((w) => nodeById(doc, w.nodeId)?.label).join(", ")}`, ref({ nodeId: ws[0].nodeId })))
    }
  }

  // Single-person dependency: a lane that is a named person owning 3+ steps and every handoff into the process
  for (const lane of doc.lanes) {
    const actor = lane.actorId ? m.actors.find((a) => a.id === lane.actorId) : undefined
    if (actor?.kind !== "person") continue
    const steps = doc.nodes.filter((n) => n.lane === lane.id && isWork(n.type)).length
    if (steps >= 3) out.push(mk("single-person-dependency", "observation", `${lane.actor} personally does ${steps} steps`, `If ${lane.actor} is away, who does this?`, ref({ actorId: actor.id })))
  }

  // Lane with no actor identity and generic name
  for (const lane of doc.lanes) {
    if (!lane.actorId && /^actor \d+$/i.test(lane.actor)) out.push(mk("undefined-owner", "observation", `Lane "${lane.actor}" has no named owner`, `Who is responsible for the steps in this lane?`, ref({})))
  }

  // Unconsumed outputs: dataOut nobody reads
  const readers = new Set(doc.nodes.flatMap((n) => n.dataIn ?? []).concat(doc.connections.flatMap((c) => c.dataObjectIds ?? [])))
  for (const n of doc.nodes) for (const d of n.dataOut ?? []) {
    if (!readers.has(d) && outgoing(n.id).length === 0) {
      const name = m.dataObjects.find((o) => o.id === d)?.name ?? d
      out.push(mk("unconsumed-output", "observation", `"${name}" is produced but nothing consumes it`, `From "${n.label}".`, ref({ nodeId: n.id })))
    }
  }

  void handoffs
  return out
}

export function computeFindings(m: Model): Finding[] {
  seq = 0
  const out: Finding[] = []
  for (const p of m.processes) out.push(...processFindings(m, p))
  for (const q of m.questions) if (q.status === "open") out.push(mk("unresolved-question", "observation", q.text, "Open question from the interview.", q.ref))
  for (const s of m.systems) if (s.verification === "inferred") out.push(mk("inferred-fact", "observation", `System "${s.name}" was inferred`, "Confirm it exists and what it is.", { systemId: s.id }))
  return out
}

export const findingsFor = (all: Finding[], ref: Partial<Ref>) =>
  all.filter((f) => Object.entries(ref).every(([k, v]) => f.ref[k as keyof Ref] === v))

export const manualWork = (all: Finding[]) =>
  all.filter((f) => ["manual-reentry", "human-polling", "spreadsheet-transport", "email-transport", "chat-transport", "paper-transport"].includes(f.rule))
