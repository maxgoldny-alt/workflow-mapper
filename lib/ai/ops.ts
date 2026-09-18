import {
  LANE_COLORS,
  LANE_HEADER_W,
  NODE_H,
  NODE_W,
  AREA_COLORS,
  blankDoc,
  defaultConnection,
  newId,
  type ActorKind,
  type Channel,
  type EdgeType,
  type Execution,
  type IntegrationState,
  type Model,
  type Node,
  type NodeType,
  type Process,
  type SystemKind,
  type AccountType,
  type TriggerKind,
  type Verification,
} from "@/lib/model"
import { clampNodeToLane, laneBoxes } from "@/lib/geometry"

/**
 * The only way the AI changes the model. Ops are name-based so a language
 * model can emit them without knowing ids; `applyOps` resolves names
 * case-insensitively, creates what is missing, and records what it did.
 *
 * Verification: AI ops may say "reported" (the user stated it) or "inferred"
 * (the AI guessed). "confirmed" is reserved for the user editing by hand and is
 * downgraded to "reported" if an op tries to use it.
 */
export type OpVerification = "reported" | "inferred"

export type Op =
  | { op: "ensureArea"; name: string; purpose?: string; inputs?: string; outputs?: string }
  | { op: "ensureProcess"; area: string; name: string; purpose?: string }
  | { op: "ensureActor"; name: string; kind?: ActorKind; notes?: string; verification?: OpVerification }
  | { op: "ensurePlatform"; name: string; vendor?: string; category?: string }
  | {
      op: "ensureSystem"
      name: string
      platform?: string
      kind?: SystemKind
      accountType?: AccountType
      owner?: string
      purpose?: string
      dataIn?: string
      dataOut?: string
      integration?: IntegrationState
      verification?: OpVerification
    }
  | { op: "ensureDataObject"; name: string; kind?: "document" | "record" | "message" | "file" | "other"; format?: string }
  | {
      op: "addNode"
      process: string
      actor: string
      label: string
      type?: NodeType
      sublabel?: string
      system?: string
      dataIn?: string[]
      dataOut?: string[]
      after?: string
      notes?: string
      verification?: OpVerification
    }
  | {
      op: "connect"
      process: string
      from: string
      to: string
      type?: EdgeType
      label?: string
      channel?: Channel
      execution?: Execution
      integration?: IntegrationState
      triggerKind?: TriggerKind
      trigger?: string
      payload?: string
      dataObjects?: string[]
      verification?: OpVerification
    }
  | { op: "link"; fromArea: string; toArea: string; label?: string; payload?: string; channel?: Channel; execution?: Execution; verification?: OpVerification }
  | { op: "addQuestion"; text: string; area?: string; process?: string; node?: string }
  | { op: "answerQuestion"; text: string; answer: string }
  | { op: "note"; process: string; node: string; notes: string }

export interface ApplyResult {
  model: Model
  derived: string[]
}

const norm = (s: string) => s.trim().toLowerCase()
const same = (a: string, b: string) => norm(a) === norm(b)
const loose = (a: string, b: string) => same(a, b) || norm(a).includes(norm(b)) || norm(b).includes(norm(a))

function ver(v?: OpVerification | Verification): Verification {
  return v === "inferred" ? "inferred" : "reported"
}

/** Apply a batch of ops. Never throws on a bad op; it records what it skipped. */
export function applyOps(model: Model, ops: Op[], messageId?: string): ApplyResult {
  let m: Model = structuredClone(model)
  const derived: string[] = []

  const findArea = (name: string) => m.areas.find((a) => same(a.name, name)) ?? m.areas.find((a) => loose(a.name, name))
  const findProcess = (name: string) => m.processes.find((p) => same(p.name, name)) ?? m.processes.find((p) => loose(p.name, name))
  const findActor = (name: string) => m.actors.find((a) => same(a.name, name))
  const findPlatform = (name: string) => m.platforms.find((p) => same(p.name, name)) ?? m.platforms.find((p) => loose(p.name, name))
  const findSystem = (name: string) => m.systems.find((s) => same(s.name, name)) ?? m.systems.find((s) => loose(s.name, name))
  const findData = (name: string) => m.dataObjects.find((d) => same(d.name, name)) ?? m.dataObjects.find((d) => loose(d.name, name))
  const findNode = (p: Process, label: string) => p.doc.nodes.find((n) => same(n.label, label)) ?? p.doc.nodes.find((n) => loose(n.label, label))

  const ensureArea = (name: string, patch: Partial<{ purpose: string; inputs: string; outputs: string }> = {}) => {
    let a = findArea(name)
    if (!a) {
      a = { id: newId("area"), name: name.trim(), order: m.areas.length, color: AREA_COLORS[m.areas.length % AREA_COLORS.length], ...patch }
      m.areas.push(a)
      derived.push(`+ Area "${a.name}"`)
    } else {
      Object.assign(a, Object.fromEntries(Object.entries(patch).filter(([, v]) => v)))
    }
    return a
  }

  const ensureProcess = (areaName: string, name: string, purpose?: string) => {
    let p = findProcess(name)
    if (!p) {
      const area = ensureArea(areaName)
      p = { id: newId("proc"), areaId: area.id, name: name.trim(), purpose, doc: { lanes: [], nodes: [], connections: [] } }
      m.processes.push(p)
      derived.push(`+ Process "${p.name}"`)
    } else if (purpose && !p.purpose) p.purpose = purpose
    return p
  }

  const ensureActor = (name: string, kind: ActorKind = "unknown", verification?: OpVerification, notes?: string) => {
    let a = findActor(name)
    if (!a) {
      a = { id: newId("act"), name: name.trim(), kind, notes, verification: ver(verification) }
      m.actors.push(a)
      derived.push(`+ Actor "${a.name}"`)
    } else if (kind !== "unknown" && a.kind === "unknown") a.kind = kind
    return a
  }

  const ensureLane = (p: Process, actorName: string) => {
    const actor = ensureActor(actorName)
    let lane = p.doc.lanes.find((l) => l.actorId === actor.id) ?? p.doc.lanes.find((l) => same(l.actor, actorName))
    // Reuse the untouched placeholder lane a blank process starts with
    const placeholder = p.doc.lanes.find((l) => !l.actorId && /^actor \d+$/i.test(l.actor) && !p.doc.nodes.some((n) => n.lane === l.id))
    if (!lane && placeholder) {
      placeholder.actor = actor.name
      placeholder.actorId = actor.id
      lane = placeholder
      derived.push(`+ Lane "${actor.name}" in ${p.name}`)
    }
    if (!lane) {
      lane = { id: newId("lane"), actor: actor.name, actorId: actor.id, height: 180, color: LANE_COLORS[p.doc.lanes.length % LANE_COLORS.length] }
      p.doc.lanes.push(lane)
      derived.push(`+ Lane "${actor.name}" in ${p.name}`)
    } else if (!lane.actorId) lane.actorId = actor.id
    return lane
  }

  const ensurePlatform = (name: string, vendor?: string, category?: string) => {
    let pl = findPlatform(name)
    if (!pl) {
      pl = { id: newId("plat"), name: name.trim(), vendor, category }
      m.platforms.push(pl)
      derived.push(`+ Platform "${pl.name}"`)
    }
    return pl
  }

  const ensureData = (name: string, kind?: "document" | "record" | "message" | "file" | "other", format?: string) => {
    let d = findData(name)
    if (!d) {
      d = { id: newId("do"), name: name.trim(), kind, format }
      m.dataObjects.push(d)
      derived.push(`+ Data "${d.name}"`)
    }
    return d
  }

  for (const op of ops) {
    try {
      switch (op.op) {
        case "ensureArea":
          ensureArea(op.name, { purpose: op.purpose, inputs: op.inputs, outputs: op.outputs })
          break
        case "ensureProcess":
          ensureProcess(op.area, op.name, op.purpose)
          break
        case "ensureActor":
          ensureActor(op.name, op.kind, op.verification, op.notes)
          break
        case "ensurePlatform":
          ensurePlatform(op.name, op.vendor, op.category)
          break
        case "ensureSystem": {
          let s = findSystem(op.name)
          const platformId = op.platform ? ensurePlatform(op.platform).id : undefined
          const ownerActorId = op.owner ? ensureActor(op.owner, "person", op.verification).id : undefined
          if (!s) {
            s = {
              id: newId("sys"),
              name: op.name.trim(),
              platformId,
              kind: op.kind ?? "unknown",
              accountType: op.accountType,
              ownerActorId,
              purpose: op.purpose,
              dataIn: op.dataIn,
              dataOut: op.dataOut,
              integration: op.integration ?? "unknown",
              verification: ver(op.verification),
            }
            m.systems.push(s)
            derived.push(`+ System "${s.name}"${op.platform ? ` (${op.platform})` : ""}`)
          } else {
            if (platformId && !s.platformId) s.platformId = platformId
            if (op.kind && s.kind === "unknown") s.kind = op.kind
            if (op.accountType && (!s.accountType || s.accountType === "unknown")) s.accountType = op.accountType
            if (ownerActorId && !s.ownerActorId) s.ownerActorId = ownerActorId
            if (op.purpose && !s.purpose) s.purpose = op.purpose
            if (op.dataIn && !s.dataIn) s.dataIn = op.dataIn
            if (op.dataOut && !s.dataOut) s.dataOut = op.dataOut
            if (op.integration && s.integration === "unknown") s.integration = op.integration
            derived.push(`~ System "${s.name}" updated`)
          }
          break
        }
        case "ensureDataObject":
          ensureData(op.name, op.kind, op.format)
          break
        case "addNode": {
          const p = findProcess(op.process) ?? ensureProcess(m.areas[0]?.name ?? op.process, op.process)
          const lane = ensureLane(p, op.actor)
          const existing = findNode(p, op.label)
          const systemId = op.system ? (findSystem(op.system) ?? (() => {
            const s = { id: newId("sys"), name: op.system!.trim(), kind: "unknown" as SystemKind, integration: "unknown" as IntegrationState, verification: ver(op.verification) }
            m.systems.push(s)
            derived.push(`+ System "${s.name}"`)
            return s
          })()).id : undefined
          const dataIn = op.dataIn?.map((d) => ensureData(d).id)
          const dataOut = op.dataOut?.map((d) => ensureData(d).id)
          if (existing) {
            if (systemId && !existing.systemId) existing.systemId = systemId
            if (dataIn?.length) existing.dataIn = Array.from(new Set([...(existing.dataIn ?? []), ...dataIn]))
            if (dataOut?.length) existing.dataOut = Array.from(new Set([...(existing.dataOut ?? []), ...dataOut]))
            if (op.notes) existing.notes = existing.notes ? `${existing.notes}\n${op.notes}` : op.notes
            if (op.sublabel && !existing.sublabel) existing.sublabel = op.sublabel
            derived.push(`~ Step "${existing.label}" updated`)
            break
          }
          const boxes = laneBoxes(p.doc.lanes)
          const box = boxes.find((b) => b.id === lane.id)!
          const after = op.after ? findNode(p, op.after) : undefined
          const rightmost = Math.max(LANE_HEADER_W + 40 - 180, ...p.doc.nodes.map((n) => n.x))
          const x = after ? after.x + NODE_W + 48 : rightmost + 180
          const node: Node = {
            id: newId(op.type ?? "step"),
            label: op.label.trim(),
            sublabel: op.sublabel,
            type: op.type ?? "step",
            x,
            y: box.top + (box.height - NODE_H) / 2,
            lane: lane.id,
            systemId,
            dataIn,
            dataOut,
            notes: op.notes,
            verification: ver(op.verification),
            messageId,
          }
          // Avoid stacking exactly on another node in the same lane
          while (p.doc.nodes.some((n) => n.lane === node.lane && Math.abs(n.x - node.x) < NODE_W && Math.abs(n.y - node.y) < NODE_H)) node.x += NODE_W + 48
          p.doc.nodes.push(clampNodeToLane(p.doc.lanes, node))
          derived.push(`+ ${op.type === "decision" ? "Decision" : op.type === "trigger" ? "Trigger" : "Step"} "${node.label}" (${lane.actor})`)
          break
        }
        case "connect": {
          const p = findProcess(op.process)
          if (!p) {
            derived.push(`! skipped connect: no process "${op.process}"`)
            break
          }
          const from = findNode(p, op.from)
          const to = findNode(p, op.to)
          if (!from || !to) {
            derived.push(`! skipped connect: "${op.from}" → "${op.to}" not found`)
            break
          }
          const dataObjectIds = op.dataObjects?.map((d) => ensureData(d).id)
          let c = p.doc.connections.find((x) => x.from === from.id && x.to === to.id)
          if (!c) {
            c = defaultConnection({ id: newId("e"), from: from.id, to: to.id, verification: ver(op.verification), messageId })
            p.doc.connections.push(c)
            derived.push(`+ Connection "${from.label}" → "${to.label}"`)
          } else derived.push(`~ Connection "${from.label}" → "${to.label}" updated`)
          if (op.type) c.type = op.type
          if (op.label) c.label = op.label
          if (op.channel) c.channel = op.channel
          if (op.execution) c.execution = op.execution
          if (op.integration) c.integration = op.integration
          if (op.triggerKind) c.triggerKind = op.triggerKind
          if (op.trigger) c.trigger = op.trigger
          if (op.payload) c.payload = op.payload
          if (dataObjectIds?.length) c.dataObjectIds = Array.from(new Set([...(c.dataObjectIds ?? []), ...dataObjectIds]))
          break
        }
        case "link": {
          const a = ensureArea(op.fromArea)
          const b = ensureArea(op.toArea)
          let l = m.areaLinks.find((x) => x.from === a.id && x.to === b.id)
          if (!l) {
            l = { id: newId("al"), from: a.id, to: b.id, verification: ver(op.verification) }
            m.areaLinks.push(l)
            derived.push(`+ Link ${a.name} → ${b.name}`)
          }
          if (op.label) l.label = op.label
          if (op.payload) l.payload = op.payload
          if (op.channel) l.channel = op.channel
          if (op.execution) l.execution = op.execution
          break
        }
        case "addQuestion": {
          if (m.questions.some((q) => q.status === "open" && same(q.text, op.text))) break
          const process = op.process ? findProcess(op.process) : undefined
          const area = op.area ? findArea(op.area) : process ? m.areas.find((a) => a.id === process.areaId) : undefined
          const node = process && op.node ? findNode(process, op.node) : undefined
          m.questions.push({
            id: newId("q"),
            text: op.text.trim(),
            ref: { areaId: area?.id, processId: process?.id, nodeId: node?.id },
            status: "open",
            source: "ai",
            createdAt: Date.now(),
          })
          derived.push(`? ${op.text.trim()}`)
          break
        }
        case "answerQuestion": {
          const q = m.questions.find((x) => x.status === "open" && loose(x.text, op.text))
          if (q) {
            q.status = "answered"
            q.answer = op.answer
            derived.push(`✓ Answered: ${q.text}`)
          }
          break
        }
        case "note": {
          const p = findProcess(op.process)
          const n = p && findNode(p, op.node)
          if (n) {
            n.notes = n.notes ? `${n.notes}\n${op.notes}` : op.notes
            derived.push(`~ Note on "${n.label}"`)
          }
          break
        }
      }
    } catch (err) {
      derived.push(`! op failed: ${(op as Op).op} (${(err as Error).message})`)
    }
  }

  // Processes must have at least one lane so the canvas can render them
  for (const p of m.processes) if (!p.doc.lanes.length) p.doc = blankDoc()
  m = { ...m }
  return { model: m, derived }
}

/** Compact JSON summary of the model for the AI: names, not ids or positions. */
export function summarizeModel(m: Model): string {
  const areas = [...m.areas].sort((a, b) => a.order - b.order).map((a) => ({
    area: a.name,
    purpose: a.purpose,
    processes: m.processes
      .filter((p) => p.areaId === a.id)
      .map((p) => ({
        process: p.name,
        actors: p.doc.lanes.map((l) => l.actor),
        steps: p.doc.nodes
          .filter((n) => n.type !== "note")
          .map((n) => ({
            label: n.label,
            type: n.type,
            actor: p.doc.lanes.find((l) => l.id === n.lane)?.actor,
            system: n.systemId ? m.systems.find((s) => s.id === n.systemId)?.name : undefined,
            verification: n.verification,
          })),
        connections: p.doc.connections.map((c) => ({
          from: p.doc.nodes.find((n) => n.id === c.from)?.label,
          to: p.doc.nodes.find((n) => n.id === c.to)?.label,
          type: c.type,
          channel: c.channel,
          execution: c.execution,
          integration: c.integration,
          trigger: c.trigger ?? c.triggerKind,
          payload: c.payload,
        })),
      })),
  }))
  return JSON.stringify(
    {
      company: m.company.name,
      areas,
      links: m.areaLinks.map((l) => ({ from: m.areas.find((a) => a.id === l.from)?.name, to: m.areas.find((a) => a.id === l.to)?.name, label: l.label, payload: l.payload })),
      actors: m.actors.map((a) => ({ name: a.name, kind: a.kind })),
      systems: m.systems.map((s) => ({
        name: s.name,
        platform: s.platformId ? m.platforms.find((p) => p.id === s.platformId)?.name : undefined,
        kind: s.kind,
        accountType: s.accountType,
        owner: s.ownerActorId ? m.actors.find((a) => a.id === s.ownerActorId)?.name : undefined,
        integration: s.integration,
      })),
      dataObjects: m.dataObjects.map((d) => d.name),
      openQuestions: m.questions.filter((q) => q.status === "open").map((q) => q.text),
    },
    null,
    0,
  )
}
