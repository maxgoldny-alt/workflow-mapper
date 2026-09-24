import {
  CHANNEL_META,
  EXECUTION_META,
  INTEGRATION_META,
  TRIGGER_META,
  VERIFICATION_META,
  actorById,
  edgeHow,
  handoffs,
  isManualEdge,
  laneById,
  nodeById,
  platformById,
  processesInArea,
  systemById,
  type Doc,
  type Model,
  type Node,
  type Process,
} from "./model"
import { RULE_META, manualWork, type Finding } from "./findings"

/**
 * Documentation generated from the model. Anything not established is written
 * as UNKNOWN rather than invented.
 */

const UNKNOWN = "**UNKNOWN**"
const v = (x?: string) => (x?.trim() ? x : UNKNOWN)

/** Steps in reading order: follow sequence edges from triggers/sources, then anything left, by x. */
function orderedSteps(doc: Doc): Node[] {
  const work = doc.nodes.filter((n) => n.type !== "note" && n.type !== "system" && n.type !== "tool")
  const inc = new Map(work.map((n) => [n.id, doc.connections.filter((c) => c.to === n.id && c.type !== "uses" && c.type !== "data").length]))
  const seen = new Set<string>()
  const out: Node[] = []
  const queue = work.filter((n) => (inc.get(n.id) ?? 0) === 0).sort((a, b) => a.x - b.x || a.y - b.y)
  const visit = (n: Node) => {
    if (seen.has(n.id)) return
    seen.add(n.id)
    out.push(n)
    doc.connections
      .filter((c) => c.from === n.id && c.type !== "uses" && c.type !== "data")
      .map((c) => nodeById(doc, c.to))
      .filter((x): x is Node => !!x && x.type !== "system" && x.type !== "tool")
      .sort((a, b) => a.x - b.x)
      .forEach(visit)
  }
  queue.forEach(visit)
  work.sort((a, b) => a.x - b.x || a.y - b.y).forEach(visit)
  return out
}

export function sopForProcess(m: Model, p: Process): string[] {
  const lines: string[] = [`### ${p.name}`, ""]
  if (p.purpose) lines.push(`*Purpose:* ${p.purpose}`, "")
  const doc = p.doc
  const steps = orderedSteps(doc)
  if (!steps.length) {
    lines.push(`_No steps recorded yet._`, "")
    return lines
  }
  steps.forEach((n, i) => {
    const owner = laneById(doc, n.lane)?.actor ?? UNKNOWN
    const sys = n.systemId ? systemById(m, n.systemId)?.name : undefined
    const ins = doc.connections.filter((c) => c.to === n.id && c.type !== "uses")
    const outs = doc.connections.filter((c) => c.from === n.id && c.type !== "uses")
    const verb = n.type === "decision" ? "decides" : n.type === "trigger" ? "starts when" : "does"
    let line = `${i + 1}. **${owner}** ${verb}: ${n.label}`
    if (sys) line += ` (in ${sys})`
    if (n.verification === "inferred") line += ` _(inferred, unconfirmed)_`
    lines.push(line)
    for (const c of ins) {
      const from = nodeById(doc, c.from)
      const fromOwner = from ? laneById(doc, from.lane)?.actor : undefined
      if (from && from.lane !== n.lane) {
        const moves = c.payload || c.dataObjectIds?.map((id) => m.dataObjects.find((d) => d.id === id)?.name).filter(Boolean).join(", ")
        lines.push(`   - Receives ${v(moves)} from **${fromOwner ?? UNKNOWN}** via ${c.channel === "unknown" ? UNKNOWN : CHANNEL_META[c.channel].label}. Knows it is ready because: ${c.trigger || (c.triggerKind && c.triggerKind !== "unknown" ? TRIGGER_META[c.triggerKind].label : UNKNOWN)}.`)
      }
    }
    if (n.type === "decision") {
      const yes = outs.find((c) => c.type === "yes")
      const no = outs.find((c) => c.type === "no")
      lines.push(`   - If yes: ${yes ? nodeById(doc, yes.to)?.label : UNKNOWN}`)
      lines.push(`   - If no: ${no ? nodeById(doc, no.to)?.label : UNKNOWN}`)
    } else if (outs.length === 0 && n.type !== "trigger") {
      lines.push(`   - Next step: ${UNKNOWN}`)
    }
    if (n.notes) lines.push(`   - Note: ${n.notes}`)
  })
  lines.push("")
  return lines
}

export interface ReportSection {
  id: string
  title: string
  markdown: string
}

export function generateReport(m: Model, findings: Finding[]): ReportSection[] {
  const sections: ReportSection[] = []
  const open = m.questions.filter((q) => q.status === "open")

  // 1. Current-state summary
  {
    const lines = [`# ${m.company.name}: current-state operations`, ""]
    lines.push(`${m.areas.length} process areas, ${m.processes.length} processes, ${m.actors.length} actors, ${m.systems.length} systems, ${open.length} open questions.`, "")
    const ordered = [...m.areas].sort((a, b) => a.order - b.order)
    if (ordered.length) lines.push(`**Flow:** ${ordered.map((a) => a.name).join(" → ")}`, "")
    for (const a of ordered) {
      lines.push(`## ${a.name}`)
      if (a.purpose) lines.push(a.purpose)
      lines.push(`- Inputs: ${v(a.inputs)}`)
      lines.push(`- Outputs: ${v(a.outputs)}`)
      const procs = processesInArea(m, a.id)
      lines.push(`- Processes: ${procs.length ? procs.map((p) => p.name).join(", ") : "none recorded"}`)
      lines.push("")
    }
    sections.push({ id: "summary", title: "Current-state summary", markdown: lines.join("\n") })
  }

  // 2. SOP
  {
    const lines = [`# Standard operating procedure (current state)`, "", `Generated from the map. ${UNKNOWN} marks information nobody has provided yet.`, ""]
    for (const a of [...m.areas].sort((x, y) => x.order - y.order)) {
      lines.push(`## ${a.name}`, "")
      for (const p of processesInArea(m, a.id)) lines.push(...sopForProcess(m, p))
    }
    sections.push({ id: "sop", title: "SOP", markdown: lines.join("\n") })
  }

  // 3. Roles
  {
    const lines = [`# Role responsibilities`, ""]
    const byActor = new Map<string, string[]>()
    for (const p of m.processes) for (const n of p.doc.nodes) {
      if (n.type === "note" || n.type === "system" || n.type === "tool") continue
      const owner = laneById(p.doc, n.lane)?.actor ?? "Unassigned"
      byActor.set(owner, [...(byActor.get(owner) ?? []), `${n.label} (${p.name})`])
    }
    for (const [actor, items] of byActor) {
      const a = m.actors.find((x) => x.name === actor)
      lines.push(`## ${actor}${a ? ` — ${a.kind}` : ""}`)
      items.forEach((i) => lines.push(`- ${i}`))
      lines.push("")
    }
    if (!byActor.size) lines.push("_No steps recorded._")
    sections.push({ id: "roles", title: "Roles", markdown: lines.join("\n") })
  }

  // 4. Systems inventory
  {
    const lines = [`# Systems inventory`, ""]
    if (!m.systems.length) lines.push("_No systems catalogued._")
    for (const s of m.systems) {
      const plat = s.platformId ? platformById(m, s.platformId) : undefined
      lines.push(`## ${s.name}`)
      lines.push(`- Platform: ${plat?.name ?? UNKNOWN}`)
      lines.push(`- Kind: ${s.kind === "unknown" ? UNKNOWN : s.kind}`)
      lines.push(`- Account: ${s.accountType && s.accountType !== "unknown" ? s.accountType : UNKNOWN}`)
      lines.push(`- Owner: ${s.ownerActorId ? actorById(m, s.ownerActorId)?.name ?? UNKNOWN : UNKNOWN}`)
      lines.push(`- Purpose: ${v(s.purpose)}`)
      lines.push(`- Data in: ${v(s.dataIn)}`)
      lines.push(`- Data out: ${v(s.dataOut)}`)
      lines.push(`- Integration: ${INTEGRATION_META[s.integration].label}`)
      lines.push(`- Status: ${VERIFICATION_META[s.verification ?? "unknown"].label}`)
      if (plat?.capabilities) lines.push(`- Platform capabilities: ${Object.entries(plat.capabilities).map(([k, val]) => `${k}=${String(val)}`).join(", ")}`)
      else lines.push(`- Platform capabilities: not verified (no recommendations made)`)
      lines.push("")
    }
    sections.push({ id: "systems", title: "Systems", markdown: lines.join("\n") })
  }

  // 5. Handoff report
  {
    const lines = [`# Handoffs`, "", `| Process | From | To | What moves | Channel | Execution | Integration | Trigger | Status |`, `|---|---|---|---|---|---|---|---|---|`]
    let n = 0
    for (const p of m.processes) for (const h of handoffs(p.doc)) {
      n++
      const c = h.edge
      lines.push(`| ${p.name} | ${h.fromLane.actor}: ${h.from.label} | ${h.toLane.actor}: ${h.to.label} | ${v(c.payload)} | ${c.channel === "unknown" ? UNKNOWN : CHANNEL_META[c.channel].label} | ${c.execution === "unknown" ? UNKNOWN : EXECUTION_META[c.execution].label} | ${INTEGRATION_META[c.integration].label} | ${c.trigger || (c.triggerKind ? TRIGGER_META[c.triggerKind].label : UNKNOWN)} | ${VERIFICATION_META[c.verification ?? "unknown"].label} |`)
    }
    if (!n) lines.push(`| _none_ | | | | | | | | |`)
    sections.push({ id: "handoffs", title: "Handoffs", markdown: lines.join("\n") })
  }

  // 6. Data flow
  {
    const lines = [`# Data flow`, ""]
    for (const d of m.dataObjects) {
      lines.push(`## ${d.name}${d.format ? ` (${d.format})` : ""}`)
      const produced: string[] = []
      const consumed: string[] = []
      const carried: string[] = []
      for (const p of m.processes) {
        for (const nd of p.doc.nodes) {
          if (nd.dataOut?.includes(d.id)) produced.push(`${nd.label} (${laneById(p.doc, nd.lane)?.actor})`)
          if (nd.dataIn?.includes(d.id)) consumed.push(`${nd.label} (${laneById(p.doc, nd.lane)?.actor})`)
        }
        for (const c of p.doc.connections) if (c.dataObjectIds?.includes(d.id)) carried.push(`${nodeById(p.doc, c.from)?.label} → ${nodeById(p.doc, c.to)?.label} by ${edgeHow(c)}`)
      }
      lines.push(`- Produced by: ${produced.join("; ") || UNKNOWN}`)
      lines.push(`- Consumed by: ${consumed.join("; ") || UNKNOWN}`)
      lines.push(`- Carried: ${carried.join("; ") || UNKNOWN}`)
      lines.push("")
    }
    const loose = m.processes.flatMap((p) => p.doc.connections.filter((c) => c.payload && !c.dataObjectIds?.length).map((c) => `${p.name}: ${nodeById(p.doc, c.from)?.label} → ${nodeById(p.doc, c.to)?.label}: ${c.payload}`))
    if (loose.length) lines.push(`## Other payloads (not yet catalogued as data objects)`, ...loose.map((l) => `- ${l}`), "")
    if (!m.dataObjects.length && !loose.length) lines.push("_No data recorded._")
    sections.push({ id: "data", title: "Data flow", markdown: lines.join("\n") })
  }

  // 7. Open questions
  {
    const lines = [`# Unresolved questions`, ""]
    if (!open.length) lines.push("_None open._")
    for (const q of open) lines.push(`- [ ] ${q.text}`)
    sections.push({ id: "questions", title: "Questions", markdown: lines.join("\n") })
  }

  // 8. Findings + manual work + opportunities
  {
    const lines = [`# Findings`, ""]
    const obs = findings.filter((f) => f.level === "observation" && f.rule !== "unresolved-question")
    const pot = findings.filter((f) => f.level === "potential")
    const ver = findings.filter((f) => f.level === "verified")
    lines.push(`## Manual work`, "")
    const mw = manualWork(findings)
    if (!mw.length) lines.push("_None recorded._")
    for (const f of mw) lines.push(`- ${f.title} — ${f.detail}`)
    lines.push("", `## Duplicate work`, "")
    const dup = findings.filter((f) => f.rule === "duplicate-entry" || f.rule === "manual-reentry")
    if (!dup.length) lines.push("_None recorded._")
    for (const f of dup) lines.push(`- ${f.title} — ${f.detail}`)
    lines.push("", `## Observations`, "")
    for (const f of obs) lines.push(`- **${RULE_META[f.rule].label}:** ${f.title}`)
    lines.push("", `## Potential opportunities`, "", `Structural patterns on confirmed facts. Not recommendations: no platform capability has been verified.`, "")
    if (!pot.length) lines.push("_None yet. Confirm facts on the map to surface these._")
    for (const f of pot) lines.push(`- ${f.title} — ${f.detail}`)
    lines.push("", `## Verified opportunities`, "")
    if (!ver.length) lines.push("_None. Technology capabilities have not been verified, so no automation is recommended._")
    for (const f of ver) lines.push(`- ${f.title} — ${f.detail}`)
    sections.push({ id: "findings", title: "Findings", markdown: lines.join("\n") })
  }

  void isManualEdge
  return sections
}

export const reportMarkdown = (sections: ReportSection[]) => sections.map((s) => s.markdown).join("\n\n---\n\n")
