"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trash2, ArrowUp, ArrowDown, ArrowRight, X, ExternalLink, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  NODE_TYPE_META,
  EDGE_TYPE_META,
  CHANNEL_META,
  EXECUTION_META,
  INTEGRATION_META,
  TRIGGER_META,
  VERIFICATION_META,
  NODE_TYPES,
  EDGE_TYPES,
  CHANNELS,
  EXECUTIONS,
  INTEGRATIONS,
  TRIGGER_KINDS,
  VERIFICATIONS,
  LANE_COLORS,
  isHandoff,
  laneById,
  nodeById,
  newId,
  processById,
  processesInArea,
  updateProcessDoc,
  blankDoc,
  type Doc,
  type Model,
  type Node,
  type Connection,
  type Lane,
  type Verification,
  type SystemInstance,
  type ActorKind,
} from "@/lib/model"
import { moveLane, removeLane } from "@/lib/lane-ops"
import { removeArea } from "./overview-canvas"
import type { Nav, Selection } from "@/lib/selection"
import { nodeIcons } from "./toolbar"

interface InspectorProps {
  selection: Selection
  model: Model
  /** The process whose doc node/edge/lane selections refer to. */
  processId?: string
  commit: (fn: (m: Model) => Model) => void
  onNavigate: (nav: Nav, selection?: Selection) => void
  onClose: () => void
}

const textareaClass =
  "w-full min-h-[60px] rounded-md border border-input bg-transparent px-2 py-1.5 text-xs shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"

export function Inspector({ selection, model, processId, commit, onNavigate, onClose }: InspectorProps) {
  const process = processId ? processById(model, processId) : undefined
  const doc = process?.doc
  const commitDoc = (fn: (d: Doc) => Doc) => processId && commit((m) => updateProcessDoc(m, processId, fn))

  const node = selection?.kind === "node" && doc ? nodeById(doc, selection.id) : undefined
  const edge = selection?.kind === "edge" && doc ? doc.connections.find((c) => c.id === selection.id) : undefined
  const lane = selection?.kind === "lane" && doc ? laneById(doc, selection.id) : undefined
  const many = selection?.kind === "nodes" ? selection.ids : undefined
  const frame = selection?.kind === "frame" && doc ? (doc.frames ?? []).find((f) => f.id === selection.id) : undefined
  const area = selection?.kind === "area" ? model.areas.find((a) => a.id === selection.id) : undefined
  const link = selection?.kind === "areaLink" ? model.areaLinks.find((l) => l.id === selection.id) : undefined
  const proc = selection?.kind === "process" ? processById(model, selection.id) : undefined
  const system = selection?.kind === "system" ? model.systems.find((s) => s.id === selection.id) : undefined
  const actor = selection?.kind === "actor" ? model.actors.find((a) => a.id === selection.id) : undefined

  const title = node ? NODE_TYPE_META[node.type].label : many ? `${many.length} nodes` : edge ? (doc && isHandoff(doc, edge) ? "Handoff" : "Connection") : lane ? "Actor lane" : frame ? "Phase frame" : area ? "Stage" : link ? "Stage handoff" : proc ? "Workflow" : system ? "System" : actor ? "Actor" : "Inspector"

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button type="button" onClick={onClose} className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        {many && (
          <>
            <p className="text-xs text-muted-foreground">Drag any of them to move the group. Arrow keys nudge. Shift-click adds or removes one.</p>
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => {
                commitDoc((d) => ({ ...d, nodes: d.nodes.filter((n) => !many.includes(n.id)), connections: d.connections.filter((c) => !many.includes(c.from) && !many.includes(c.to)) }))
                onClose()
              }}
            >
              <Trash2 className="mr-2 h-3 w-3" /> Delete {many.length} nodes
            </Button>
          </>
        )}

        {node && doc && <NodeFields model={model} doc={doc} node={node} commit={commit} commitDoc={commitDoc} onClose={onClose} onNavigate={onNavigate} />}
        {edge && doc && <EdgeFields model={model} doc={doc} edge={edge} commitDoc={commitDoc} onClose={onClose} />}
        {frame && doc && (
          <>
            <Field label="Name">
              <Input value={frame.name} onChange={(e) => commitDoc((d) => ({ ...d, frames: (d.frames ?? []).map((f) => (f.id === frame.id ? { ...f, name: e.target.value } : f)) }))} className="h-8 text-sm" />
            </Field>
            <Field label="Color">
              <div className="flex flex-wrap gap-1.5">
                {LANE_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => commitDoc((d) => ({ ...d, frames: (d.frames ?? []).map((f) => (f.id === frame.id ? { ...f, color: c } : f)) }))} className={cn("h-6 w-6 rounded-full border-2", frame.color === c ? "border-foreground" : "border-transparent")} style={{ backgroundColor: c }} />
                ))}
              </div>
            </Field>
            <p className="text-xs text-muted-foreground">Drag the title to move the frame with every step inside it. Drag the corner to resize. Frames are layout only.</p>
            <Button variant="destructive" size="sm" className="w-full" onClick={() => { commitDoc((d) => ({ ...d, frames: (d.frames ?? []).filter((f) => f.id !== frame.id) })); onClose() }}>
              <Trash2 className="mr-2 h-3 w-3" /> Delete frame (keeps the steps)
            </Button>
          </>
        )}

        {lane && doc && <LaneFields model={model} doc={doc} lane={lane} commit={commit} commitDoc={commitDoc} onClose={onClose} />}
        {area && <AreaFields model={model} area={area} commit={commit} onNavigate={onNavigate} onClose={onClose} />}
        {link && <LinkFields model={model} link={link} commit={commit} onClose={onClose} />}
        {proc && <ProcessFields model={model} process={proc} commit={commit} onNavigate={onNavigate} onClose={onClose} />}
        {system && <SystemFields model={model} system={system} commit={commit} onClose={onClose} />}
        {actor && <ActorFields model={model} actor={actor} commit={commit} />}
      </div>
    </aside>
  )
}

/* ------------------------------------------------------------------ nodes */

function NodeFields({ model, doc, node, commit, commitDoc, onClose, onNavigate }: { model: Model; doc: Doc; node: Node; commit: (fn: (m: Model) => Model) => void; commitDoc: (fn: (d: Doc) => Doc) => void; onClose: () => void; onNavigate: (nav: Nav, s?: Selection) => void }) {
  const upd = (u: Partial<Node>) => commitDoc((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === node.id ? { ...n, ...u } : n)) }))
  const sys = node.systemId ? model.systems.find((s) => s.id === node.systemId) : undefined
  const isSystemish = node.type === "system" || node.type === "tool"

  const linkSystem = (id: string) => {
    if (id === "__new__") {
      const s: SystemInstance = { id: newId("sys"), name: node.label, kind: node.type === "tool" ? "app" : "unknown", integration: "unknown", verification: "confirmed" }
      commit((m) => ({ ...m, systems: [...m.systems, s] }))
      upd({ systemId: s.id })
    } else upd({ systemId: id === "__none__" ? undefined : id })
  }

  return (
    <>
      <Field label="Label">
        <Input value={node.label} onChange={(e) => upd({ label: e.target.value })} className="h-8 text-sm" />
      </Field>
      <Field label={node.type === "note" ? "Body" : "Sublabel"}>
        <Input value={node.sublabel || ""} placeholder="Optional" onChange={(e) => upd({ sublabel: e.target.value || undefined })} className="h-8 text-sm" />
      </Field>
      <Field label="Type">
        <div className="grid grid-cols-6 gap-1">
          {NODE_TYPES.map((t) => {
            const Icon = nodeIcons[t]
            const active = node.type === t
            const color = NODE_TYPE_META[t].color
            return (
              <button key={t} type="button" title={NODE_TYPE_META[t].label} onClick={() => upd({ type: t })} className={cn("flex h-9 items-center justify-center rounded-md border", active ? "border-current" : "border-border text-muted-foreground hover:bg-muted")} style={active ? { color, backgroundColor: `${color}1a`, borderColor: color } : undefined}>
                <Icon className="h-4 w-4" />
              </button>
            )
          })}
        </div>
      </Field>
      <Field label="Actor">
        <p className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">{laneById(doc, node.lane)?.actor || "Drag it into a lane"}</p>
      </Field>

      <Field label={isSystemish ? "This is" : "Uses system"} hint={isSystemish ? "Link this node to a catalogued system so its platform and owner can be recorded." : undefined}>
        <Select value={node.systemId ?? "__none__"} onValueChange={linkSystem}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {model.systems.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
            <SelectItem value="__new__">＋ New system “{node.label}”</SelectItem>
          </SelectContent>
        </Select>
        {sys && (
          <button type="button" onClick={() => onNavigate({ level: "company" }, { kind: "system", id: sys.id })} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> Edit {sys.name}
          </button>
        )}
      </Field>

      <DataPicker label="Data in" model={model} ids={node.dataIn ?? []} commit={commit} onChange={(ids) => upd({ dataIn: ids.length ? ids : undefined })} />
      <DataPicker label="Data out" model={model} ids={node.dataOut ?? []} commit={commit} onChange={(ids) => upd({ dataOut: ids.length ? ids : undefined })} />

      <VerificationPicker value={node.verification} onChange={(v) => upd({ verification: v })} />

      <Field label="Notes">
        <textarea value={node.notes || ""} placeholder="What matters about this step, exceptions, who to ask…" onChange={(e) => upd({ notes: e.target.value || undefined })} className={textareaClass} />
      </Field>

      <Button variant="destructive" size="sm" className="w-full" onClick={() => { commitDoc((d) => ({ ...d, nodes: d.nodes.filter((n) => n.id !== node.id), connections: d.connections.filter((c) => c.from !== node.id && c.to !== node.id) })); onClose() }}>
        <Trash2 className="mr-2 h-3 w-3" /> Delete node
      </Button>
    </>
  )
}

/* ------------------------------------------------------------------ edges */

function EdgeFields({ model, doc, edge, commitDoc, onClose }: { model: Model; doc: Doc; edge: Connection; commitDoc: (fn: (d: Doc) => Doc) => void; onClose: () => void }) {
  const upd = (u: Partial<Connection>) => commitDoc((d) => ({ ...d, connections: d.connections.map((c) => (c.id === edge.id ? { ...c, ...u } : c)) }))
  const from = nodeById(doc, edge.from)
  const to = nodeById(doc, edge.to)
  const handoff = isHandoff(doc, edge)
  const fromLane = from && laneById(doc, from.lane)
  const toLane = to && laneById(doc, to.lane)

  return (
    <>
      <div className="space-y-1 text-xs">
        <p className="flex items-center gap-1 text-muted-foreground">
          <span className="truncate">{from?.label}</span>
          <ArrowRight className="h-3 w-3 shrink-0" />
          <span className="truncate">{to?.label}</span>
        </p>
        {handoff && fromLane && toLane && (
          <p className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-medium">
            <span style={{ color: fromLane.color }}>{fromLane.actor}</span>
            <ArrowRight className="h-3 w-3" />
            <span style={{ color: toLane.color }}>{toLane.actor}</span>
          </p>
        )}
      </div>

      <Field label="Channel" hint="How it physically travels">
        <Select value={edge.channel} onValueChange={(v) => upd({ channel: v as Connection["channel"] })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CHANNELS.map((c) => (
              <SelectItem key={c} value={c}>{CHANNEL_META[c].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Execution" hint={EXECUTION_META[edge.execution].hint}>
        <Chips options={EXECUTIONS.map((e) => ({ value: e, label: EXECUTION_META[e].label, color: EXECUTION_META[e].color }))} value={edge.execution} onChange={(v) => upd({ execution: v as Connection["execution"] })} />
      </Field>

      <Field label="Integration" hint={INTEGRATION_META[edge.integration].hint}>
        <Chips options={INTEGRATIONS.map((i) => ({ value: i, label: INTEGRATION_META[i].label, color: INTEGRATION_META[i].color }))} value={edge.integration} onChange={(v) => upd({ integration: v as Connection["integration"] })} />
      </Field>

      <Field label="Trigger" hint="How the receiving side knows it is ready">
        <Select value={edge.triggerKind ?? "unknown"} onValueChange={(v) => upd({ triggerKind: v as Connection["triggerKind"] })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TRIGGER_KINDS.map((t) => (
              <SelectItem key={t} value={t}>{TRIGGER_META[t].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={edge.trigger || ""} placeholder="e.g. Veronica checks the mailbox mid-morning" onChange={(e) => upd({ trigger: e.target.value || undefined })} className="h-8 text-sm" />
      </Field>

      <Field label="What moves">
        <Input value={edge.payload || ""} placeholder="e.g. Order PDF, invoice, customer record" onChange={(e) => upd({ payload: e.target.value || undefined })} className="h-8 text-sm" />
      </Field>
      <DataPicker label="Data objects" model={model} ids={edge.dataObjectIds ?? []} commit={() => {}} onChange={(ids) => upd({ dataObjectIds: ids.length ? ids : undefined })} readonlyCatalog />

      <Field label="Label">
        <Input value={edge.label || ""} placeholder="Optional" onChange={(e) => upd({ label: e.target.value || undefined })} className="h-8 text-sm" />
      </Field>

      <Field label="Type">
        <div className="grid grid-cols-5 gap-1">
          {EDGE_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => upd({ type: t })} className={cn("flex h-8 flex-col items-center justify-center gap-1 rounded-md border text-[10px]", edge.type === t ? "border-current text-foreground" : "border-border text-muted-foreground hover:bg-muted")} style={edge.type === t ? { borderColor: EDGE_TYPE_META[t].color } : undefined}>
              <span className="h-0.5 w-4 rounded" style={{ backgroundColor: EDGE_TYPE_META[t].color }} />
              {EDGE_TYPE_META[t].label}
            </button>
          ))}
        </div>
      </Field>

      <VerificationPicker value={edge.verification} onChange={(v) => upd({ verification: v })} />

      <Field label="Notes">
        <textarea value={edge.notes || ""} placeholder="Who does it, how often, what breaks…" onChange={(e) => upd({ notes: e.target.value || undefined })} className={textareaClass} />
      </Field>

      <Button variant="destructive" size="sm" className="w-full" onClick={() => { commitDoc((d) => ({ ...d, connections: d.connections.filter((c) => c.id !== edge.id) })); onClose() }}>
        <Trash2 className="mr-2 h-3 w-3" /> Delete connection
      </Button>
    </>
  )
}

/* ------------------------------------------------------------------ lanes */

function LaneFields({ model, doc, lane, commit, commitDoc, onClose }: { model: Model; doc: Doc; lane: Lane; commit: (fn: (m: Model) => Model) => void; commitDoc: (fn: (d: Doc) => Doc) => void; onClose: () => void }) {
  const upd = (u: Partial<Lane>) => commitDoc((d) => ({ ...d, lanes: d.lanes.map((l) => (l.id === lane.id ? { ...l, ...u } : l)) }))
  const actor = lane.actorId ? model.actors.find((a) => a.id === lane.actorId) : undefined
  const idx = doc.lanes.findIndex((l) => l.id === lane.id)

  const rename = (name: string) => {
    upd({ actor: name })
    if (actor) commit((m) => ({ ...m, actors: m.actors.map((a) => (a.id === actor.id ? { ...a, name } : a)) }))
  }
  const setKind = (kind: ActorKind) => {
    if (actor) commit((m) => ({ ...m, actors: m.actors.map((a) => (a.id === actor.id ? { ...a, kind } : a)) }))
    else {
      const id = newId("act")
      commit((m) => ({ ...m, actors: [...m.actors, { id, name: lane.actor, kind, verification: "confirmed" }] }))
      upd({ actorId: id })
    }
  }

  return (
    <>
      <Field label="Actor">
        <Input value={lane.actor} onChange={(e) => rename(e.target.value)} className="h-8 text-sm" />
      </Field>
      <Field label="Kind">
        <Chips options={(["person", "role", "team", "customer", "external", "unknown"] as ActorKind[]).map((k) => ({ value: k, label: k }))} value={actor?.kind ?? "unknown"} onChange={(v) => setKind(v as ActorKind)} />
      </Field>
      <Field label="Color">
        <div className="flex flex-wrap gap-1.5">
          {LANE_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => upd({ color: c })} className={cn("h-6 w-6 rounded-full border-2", lane.color === c ? "border-foreground" : "border-transparent")} style={{ backgroundColor: c }} />
          ))}
        </div>
      </Field>
      <Field label="Order">
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => commitDoc((d) => moveLane(d, lane.id, idx - 1))} disabled={idx === 0}><ArrowUp className="mr-1 h-3 w-3" /> Up</Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => commitDoc((d) => moveLane(d, lane.id, idx + 1))} disabled={idx === doc.lanes.length - 1}><ArrowDown className="mr-1 h-3 w-3" /> Down</Button>
        </div>
      </Field>
      {actor && (
        <Field label="Notes">
          <textarea value={actor.notes || ""} onChange={(e) => commit((m) => ({ ...m, actors: m.actors.map((a) => (a.id === actor.id ? { ...a, notes: e.target.value || undefined } : a)) }))} className={textareaClass} />
        </Field>
      )}
      <p className="text-xs text-muted-foreground">{doc.nodes.filter((n) => n.lane === lane.id).length} node(s) in this lane. Deleting the lane moves them to the neighbouring lane.</p>
      <Button variant="destructive" size="sm" className="w-full" disabled={doc.lanes.length <= 1} onClick={() => { commitDoc((d) => removeLane(d, lane.id)); onClose() }}>
        <Trash2 className="mr-2 h-3 w-3" /> Delete lane
      </Button>
    </>
  )
}

/* ------------------------------------------------------------------ areas */

function AreaFields({ model, area, commit, onNavigate, onClose }: { model: Model; area: Model["areas"][number]; commit: (fn: (m: Model) => Model) => void; onNavigate: (nav: Nav, s?: Selection) => void; onClose: () => void }) {
  const upd = (u: Partial<typeof area>) => commit((m) => ({ ...m, areas: m.areas.map((a) => (a.id === area.id ? { ...a, ...u } : a)) }))
  const procs = processesInArea(model, area.id)
  return (
    <>
      <Field label="Name"><Input value={area.name} onChange={(e) => upd({ name: e.target.value })} className="h-8 text-sm" /></Field>
      <Field label="Purpose"><textarea value={area.purpose || ""} placeholder="What this part of the business is for" onChange={(e) => upd({ purpose: e.target.value || undefined })} className={textareaClass} /></Field>
      <Field label="Color">
        <div className="flex flex-wrap gap-1.5">
          {LANE_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => upd({ color: c })} className={cn("h-6 w-6 rounded-full border-2", area.color === c ? "border-foreground" : "border-transparent")} style={{ backgroundColor: c }} />
          ))}
        </div>
      </Field>
      <Field label="Flows to" hint="Where work goes after this stage. The next stage in order is connected already; add others here, such as a loop back to the start.">
        <div className="space-y-1">
          {model.areaLinks.filter((l) => l.from === area.id).map((l) => (
            <div key={l.id} className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs">
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="truncate">{model.areas.find((a) => a.id === l.to)?.name ?? "?"}</span>
              {(l.payload || l.label) && <span className="truncate text-muted-foreground">· {l.payload || l.label}</span>}
              <button type="button" className="ml-auto text-muted-foreground hover:text-red-600" title="Remove this connection" onClick={() => commit((m) => ({ ...m, areaLinks: m.areaLinks.filter((x) => x.id !== l.id) }))}><X className="h-3 w-3" /></button>
            </div>
          ))}
          <select
            value=""
            onChange={(e) => {
              const to = e.target.value
              if (!to) return
              commit((m) => ({ ...m, areaLinks: [...m.areaLinks, { id: newId("al"), from: area.id, to, verification: "reported" }] }))
            }}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">+ Connect to another stage…</option>
            {[...model.areas].sort((a, b) => a.order - b.order).filter((a) => a.id !== area.id && !model.areaLinks.some((l) => l.from === area.id && l.to === a.id)).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </Field>
      <Field label="Notes"><textarea value={area.notes || ""} onChange={(e) => upd({ notes: e.target.value || undefined })} className={textareaClass} /></Field>
      <Button variant="outline" size="sm" className="w-full" onClick={() => onNavigate({ level: "area", areaId: area.id })}>Open stage</Button>
      <Button variant="destructive" size="sm" className="w-full" onClick={() => { if (procs.some((p) => p.doc.nodes.length) && !confirm(`Delete "${area.name}" and its ${procs.length} process(es)?`)) return; commit((m) => removeArea(m, area.id)); onClose() }}>
        <Trash2 className="mr-2 h-3 w-3" /> Delete stage
      </Button>
    </>
  )
}

function LinkFields({ model, link, commit, onClose }: { model: Model; link: Model["areaLinks"][number]; commit: (fn: (m: Model) => Model) => void; onClose: () => void }) {
  const upd = (u: Partial<typeof link>) => commit((m) => ({ ...m, areaLinks: m.areaLinks.map((l) => (l.id === link.id ? { ...l, ...u } : l)) }))
  const a = model.areas.find((x) => x.id === link.from)
  const b = model.areas.find((x) => x.id === link.to)
  return (
    <>
      <p className="flex items-center gap-1 text-xs text-muted-foreground"><span>{a?.name}</span><ArrowRight className="h-3 w-3" /><span>{b?.name}</span></p>
      <Field label="Label"><Input value={link.label || ""} onChange={(e) => upd({ label: e.target.value || undefined })} className="h-8 text-sm" /></Field>
      <Field label="What moves"><Input value={link.payload || ""} onChange={(e) => upd({ payload: e.target.value || undefined })} className="h-8 text-sm" /></Field>
      <Field label="Channel">
        <Select value={link.channel ?? "unknown"} onValueChange={(v) => upd({ channel: v as Connection["channel"] })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{CHANNELS.map((c) => <SelectItem key={c} value={c}>{CHANNEL_META[c].label}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Execution">
        <Chips options={EXECUTIONS.map((e) => ({ value: e, label: EXECUTION_META[e].label, color: EXECUTION_META[e].color }))} value={link.execution ?? "unknown"} onChange={(v) => upd({ execution: v as Connection["execution"] })} />
      </Field>
      <VerificationPicker value={link.verification} onChange={(v) => upd({ verification: v })} />
      <Button variant="destructive" size="sm" className="w-full" onClick={() => { commit((m) => ({ ...m, areaLinks: m.areaLinks.filter((l) => l.id !== link.id) })); onClose() }}>
        <Trash2 className="mr-2 h-3 w-3" /> Delete link
      </Button>
    </>
  )
}

function ProcessFields({ model, process, commit, onNavigate, onClose }: { model: Model; process: Model["processes"][number]; commit: (fn: (m: Model) => Model) => void; onNavigate: (nav: Nav) => void; onClose: () => void }) {
  const upd = (u: Partial<typeof process>) => commit((m) => ({ ...m, processes: m.processes.map((p) => (p.id === process.id ? { ...p, ...u } : p)) }))
  return (
    <>
      <Field label="Name"><Input value={process.name} onChange={(e) => upd({ name: e.target.value })} className="h-8 text-sm" /></Field>
      <Field label="Purpose"><textarea value={process.purpose || ""} onChange={(e) => upd({ purpose: e.target.value || undefined })} className={textareaClass} /></Field>
      <Field label="Area">
        <Select value={process.areaId} onValueChange={(v) => upd({ areaId: v })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{model.areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <p className="text-xs text-muted-foreground">{process.doc.lanes.length} actors · {process.doc.nodes.length} nodes · {process.doc.connections.length} connections</p>
      <Button variant="outline" size="sm" className="w-full" onClick={() => onNavigate({ level: "process", processId: process.id })}>Open process</Button>
      <Button variant="destructive" size="sm" className="w-full" onClick={() => { if (process.doc.nodes.length && !confirm(`Delete "${process.name}"?`)) return; commit((m) => ({ ...m, processes: m.processes.filter((p) => p.id !== process.id) })); onClose() }}>
        <Trash2 className="mr-2 h-3 w-3" /> Delete process
      </Button>
    </>
  )
}

/* ---------------------------------------------------------------- systems */

function SystemFields({ model, system, commit, onClose }: { model: Model; system: SystemInstance; commit: (fn: (m: Model) => Model) => void; onClose: () => void }) {
  const upd = (u: Partial<SystemInstance>) => commit((m) => ({ ...m, systems: m.systems.map((s) => (s.id === system.id ? { ...s, ...u } : s)) }))
  const platform = system.platformId ? model.platforms.find((p) => p.id === system.platformId) : undefined
  const setPlatform = (v: string) => {
    if (v === "__none__") return upd({ platformId: undefined })
    if (v === "__new__") {
      const name = prompt("Platform name (e.g. Microsoft 365, QuickBooks Online)")?.trim()
      if (!name) return
      const id = newId("plat")
      commit((m) => ({ ...m, platforms: [...m.platforms, { id, name }] }))
      upd({ platformId: id })
      return
    }
    upd({ platformId: v })
  }
  return (
    <>
      <Field label="Name"><Input value={system.name} onChange={(e) => upd({ name: e.target.value })} className="h-8 text-sm" /></Field>
      <Field label="Platform" hint="The product. Capabilities are recorded only when verified; nothing is assumed.">
        <Select value={system.platformId ?? "__none__"} onValueChange={setPlatform}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Unknown</SelectItem>
            {model.platforms.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            <SelectItem value="__new__">＋ New platform…</SelectItem>
          </SelectContent>
        </Select>
        {platform && (
          <p className="text-[11px] text-muted-foreground">
            {platform.vendor ? `${platform.vendor} · ` : ""}{platform.category ?? "category unknown"} · capabilities {platform.capabilities ? "recorded" : "not verified"}
          </p>
        )}
      </Field>
      <Field label="Kind">
        <Chips options={(["mailbox", "app", "database", "spreadsheet", "phone", "website", "other", "unknown"] as SystemInstance["kind"][]).map((k) => ({ value: k, label: k }))} value={system.kind} onChange={(v) => upd({ kind: v as SystemInstance["kind"] })} />
      </Field>
      <Field label="Account">
        <Chips options={(["shared", "personal", "company", "unknown"] as NonNullable<SystemInstance["accountType"]>[]).map((k) => ({ value: k, label: k }))} value={system.accountType ?? "unknown"} onChange={(v) => upd({ accountType: v as SystemInstance["accountType"] })} />
      </Field>
      <Field label="Owner">
        <Select value={system.ownerActorId ?? "__none__"} onValueChange={(v) => upd({ ownerActorId: v === "__none__" ? undefined : v })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Unknown</SelectItem>
            {model.actors.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Purpose"><Input value={system.purpose || ""} onChange={(e) => upd({ purpose: e.target.value || undefined })} className="h-8 text-sm" /></Field>
      <Field label="Data in"><Input value={system.dataIn || ""} onChange={(e) => upd({ dataIn: e.target.value || undefined })} className="h-8 text-sm" /></Field>
      <Field label="Data out"><Input value={system.dataOut || ""} onChange={(e) => upd({ dataOut: e.target.value || undefined })} className="h-8 text-sm" /></Field>
      <Field label="Integration" hint={INTEGRATION_META[system.integration].hint}>
        <Chips options={INTEGRATIONS.map((i) => ({ value: i, label: INTEGRATION_META[i].label, color: INTEGRATION_META[i].color }))} value={system.integration} onChange={(v) => upd({ integration: v as SystemInstance["integration"] })} />
      </Field>
      <VerificationPicker value={system.verification} onChange={(v) => upd({ verification: v })} />
      <p className="text-xs text-muted-foreground">
        Used by {model.processes.reduce((n, p) => n + p.doc.nodes.filter((x) => x.systemId === system.id).length, 0)} node(s).
      </p>
      <Button variant="destructive" size="sm" className="w-full" onClick={() => { commit((m) => ({ ...m, systems: m.systems.filter((s) => s.id !== system.id), processes: m.processes.map((p) => ({ ...p, doc: { ...p.doc, nodes: p.doc.nodes.map((n) => (n.systemId === system.id ? { ...n, systemId: undefined } : n)) } })) })); onClose() }}>
        <Trash2 className="mr-2 h-3 w-3" /> Delete system
      </Button>
    </>
  )
}

function ActorFields({ model, actor, commit }: { model: Model; actor: Model["actors"][number]; commit: (fn: (m: Model) => Model) => void }) {
  const upd = (u: Partial<typeof actor>) => commit((m) => ({ ...m, actors: m.actors.map((a) => (a.id === actor.id ? { ...a, ...u } : a)), processes: u.name ? m.processes.map((p) => ({ ...p, doc: { ...p.doc, lanes: p.doc.lanes.map((l) => (l.actorId === actor.id ? { ...l, actor: u.name! } : l)) } })) : m.processes }))
  return (
    <>
      <Field label="Name"><Input value={actor.name} onChange={(e) => upd({ name: e.target.value })} className="h-8 text-sm" /></Field>
      <Field label="Kind">
        <Chips options={(["person", "role", "team", "customer", "external", "unknown"] as ActorKind[]).map((k) => ({ value: k, label: k }))} value={actor.kind} onChange={(v) => upd({ kind: v as ActorKind })} />
      </Field>
      <Field label="Notes"><textarea value={actor.notes || ""} onChange={(e) => upd({ notes: e.target.value || undefined })} className={textareaClass} /></Field>
      <p className="text-xs text-muted-foreground">Appears in {model.processes.filter((p) => p.doc.lanes.some((l) => l.actorId === actor.id)).length} process(es).</p>
    </>
  )
}

/* ---------------------------------------------------------------- shared */

function DataPicker({ label, model, ids, commit, onChange, readonlyCatalog }: { label: string; model: Model; ids: string[]; commit: (fn: (m: Model) => Model) => void; onChange: (ids: string[]) => void; readonlyCatalog?: boolean }) {
  const add = (v: string) => {
    if (v === "__new__") {
      if (readonlyCatalog) return
      const name = prompt("Data object name (e.g. Order PDF)")?.trim()
      if (!name) return
      const id = newId("do")
      commit((m) => ({ ...m, dataObjects: [...m.dataObjects, { id, name }] }))
      onChange([...ids, id])
      return
    }
    if (!ids.includes(v)) onChange([...ids, v])
  }
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-1">
        {ids.map((id) => {
          const d = model.dataObjects.find((x) => x.id === id)
          return (
            <span key={id} className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px]">
              {d?.name ?? id}
              <button type="button" onClick={() => onChange(ids.filter((x) => x !== id))} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
            </span>
          )
        })}
      </div>
      <Select value="" onValueChange={add}>
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Add…" /></SelectTrigger>
        <SelectContent>
          {model.dataObjects.filter((d) => !ids.includes(d.id)).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          {!readonlyCatalog && <SelectItem value="__new__">＋ New data object…</SelectItem>}
        </SelectContent>
      </Select>
    </Field>
  )
}

function VerificationPicker({ value, onChange }: { value?: Verification; onChange: (v: Verification) => void }) {
  return (
    <Field label="Status" hint={VERIFICATION_META[value ?? "unknown"].hint}>
      <Chips options={VERIFICATIONS.map((v) => ({ value: v, label: VERIFICATION_META[v].label, color: VERIFICATION_META[v].color }))} value={value ?? "unknown"} onChange={(v) => onChange(v as Verification)} />
    </Field>
  )
}

function Chips({ options, value, onChange }: { options: { value: string; label: string; color?: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cn("rounded-md border px-2 py-1 text-[11px] capitalize", active ? "border-current font-medium" : "border-border text-muted-foreground hover:bg-muted")} style={active && o.color ? { color: o.color, backgroundColor: `${o.color}14`, borderColor: o.color } : undefined}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
