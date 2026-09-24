"use client"

import { useState } from "react"
import { ArrowLeft, ArrowRight, Diamond, HelpCircle, Plus, Sparkles, Trash2, Zap, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  blankDoc,
  edgeHow,
  isManualEdge,
  newId,
  openQuestions,
  processesInArea,
  updateProcessDoc,
  type Doc,
  type Model,
  type Node,
  type Process,
  type ProcessArea,
} from "@/lib/model"
import { addOutlineStep, outlineOrder, predecessor, reassignStep, removeStep } from "@/lib/outline"
import type { Finding } from "@/lib/findings"
import type { Selection } from "@/lib/selection"

interface StageOutlineProps {
  model: Model
  area: ProcessArea
  findings: Finding[]
  selection: Selection
  setSelection: (s: Selection) => void
  commit: (fn: (m: Model) => Model) => void
  onOpenWorkflow: (processId: string) => void
  onAskAbout: (areaId: string) => void
  onBack: () => void
}

/**
 * Level 2: one stage as an ordered outline of its steps. Fast capture: add,
 * rename, reassign, and delete steps here without the canvas. Every edit
 * writes to the same swimlane doc the workflow view renders.
 */
export function StageOutline({ model, area, findings, selection, setSelection, commit, onOpenWorkflow, onAskAbout, onBack }: StageOutlineProps) {
  const procs = processesInArea(model, area.id)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const process: Process | undefined = procs.find((p) => p.id === pickedId) ?? procs[0]
  const color = area.color ?? "#64748b"
  const doc = process?.doc
  const steps = doc ? outlineOrder(doc) : []
  const mapped = steps.length > 0
  const actors = doc ? doc.lanes.map((l) => l.actor).filter((a) => !/^actor \d+$/i.test(a)) : []
  const pids = new Set(procs.map((p) => p.id))
  const questions = openQuestions(model).filter((q) => q.ref.areaId === area.id || (q.ref.processId && pids.has(q.ref.processId)))
  const issues = findings.filter((f) => f.rule !== "unresolved-question" && f.rule !== "cross-actor-handoff" && (f.ref.areaId === area.id || (f.ref.processId && pids.has(f.ref.processId))))

  /** Ensure the stage has a workflow to write into, then apply a doc edit. */
  const editDoc = (fn: (d: Doc) => Doc) => {
    if (process) return commit((m) => updateProcessDoc(m, process.id, fn))
    const id = newId("proc")
    commit((m) => ({ ...m, processes: [...m.processes, { id, areaId: area.id, name: area.name, doc: fn(blankDoc()) }] }))
    setPickedId(id)
  }

  const addStep = (label: string, actor: string, type: "step" | "decision") => editDoc((d) => addOutlineStep(d, { label, actor, type }).doc)
  const rename = (id: string, label: string) => editDoc((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, label } : n)) }))
  const setType = (id: string, type: Node["type"]) => editDoc((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, type } : n)) }))

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-canvas" onPointerDown={() => setSelection({ kind: "area", id: area.id })}>
      <div className="mx-auto max-w-3xl px-6 py-5">
        <button type="button" onClick={onBack} className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Operating Map
        </button>

        <div className="mb-4 flex flex-wrap items-start gap-3">
          <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{area.name}</h2>
            <p className="text-xs text-muted-foreground">
              {mapped ? `${steps.length} steps · ${actors.length} ${actors.length === 1 ? "person" : "people"}` : "Not mapped yet"}
              {issues.length > 0 && <span className="text-red-600"> · {issues.length} {issues.length === 1 ? "issue" : "issues"}</span>}
              {questions.length > 0 && <span className="text-amber-600"> · {questions.length} open</span>}
            </p>
          </div>
          <div className="flex gap-2" onPointerDown={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" onClick={() => onAskAbout(area.id)}><Sparkles className="mr-1 h-3.5 w-3.5" /> Ask AI</Button>
            {process && (
              <Button variant="outline" size="sm" onClick={() => onOpenWorkflow(process.id)} title="Decisions, branches, systems, and data on the swimlane canvas">
                <Layers className="mr-1 h-3.5 w-3.5" /> Open full workflow <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {procs.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-1" onPointerDown={(e) => e.stopPropagation()}>
            {procs.map((p) => (
              <button key={p.id} type="button" onClick={() => setPickedId(p.id)} className={cn("rounded-full border px-2.5 py-0.5 text-xs", p.id === process?.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                {p.name}
              </button>
            ))}
          </div>
        )}

        {!mapped && (area.sketch?.length ?? 0) > 0 && (
          <div className="mb-3 rounded-lg border border-dashed border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
            Typical for this kind of business: {area.sketch!.map((s) => s.label).join(" → ")}. Add the real steps below.
          </div>
        )}

        <ol className="flex flex-col gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
          {steps.map((n, i) => (
            <StepRow
              key={n.id}
              n={n}
              index={i}
              doc={doc!}
              actors={actors}
              findings={findings.filter((f) => f.ref.nodeId === n.id)}
              selected={selection?.kind === "node" && selection.id === n.id}
              onSelect={() => setSelection({ kind: "node", id: n.id })}
              onRename={(v) => rename(n.id, v)}
              onActor={(a) => editDoc((d) => reassignStep(d, n.id, a))}
              onToggleDecision={() => setType(n.id, n.type === "decision" ? "step" : "decision")}
              onDelete={() => editDoc((d) => removeStep(d, n.id))}
              onOpen={() => process && onOpenWorkflow(process.id)}
            />
          ))}
        </ol>

        <AddStep actors={actors} onAdd={addStep} first={!mapped} />

        {mapped && (
          <p className="mt-4 text-[11px] text-muted-foreground">
            Steps added here appear on the swimlane canvas in the right lane. Open the full workflow for branches, systems, and what data moves.
          </p>
        )}
      </div>
    </div>
  )
}

function StepRow({ n, index, doc, actors, findings, selected, onSelect, onRename, onActor, onToggleDecision, onDelete, onOpen }: {
  n: Node
  index: number
  doc: Doc
  actors: string[]
  findings: Finding[]
  selected: boolean
  onSelect: () => void
  onRename: (v: string) => void
  onActor: (a: string) => void
  onToggleDecision: () => void
  onDelete: () => void
  onOpen: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(n.label)
  const lane = doc.lanes.find((l) => l.id === n.lane)
  const prev = predecessor(doc, n.id)
  const prevLane = prev ? doc.lanes.find((l) => l.id === prev.lane) : undefined
  const handoff = prev && prevLane && prevLane.id !== lane?.id
  const edge = handoff ? doc.connections.find((c) => c.from === prev.id && c.to === n.id) : undefined
  const manual = edge ? isManualEdge(edge) : false
  const gaps = findings.filter((f) => f.level === "observation")

  const commitRename = () => {
    setEditing(false)
    const v = draft.trim()
    if (v && v !== n.label) onRename(v)
    else setDraft(n.label)
  }

  return (
    <li
      className={cn("rounded-lg border bg-card px-3 py-2 text-sm", selected ? "border-primary" : "border-border", (handoff || gaps.length > 0) && "border-l-[3px]", handoff && (manual ? "border-l-red-500" : "border-l-amber-500"), !handoff && gaps.length > 0 && "border-l-amber-500")}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <span className="w-5 shrink-0 font-mono text-[11px] text-muted-foreground">{index + 1}</span>
        {n.type === "decision" && <Diamond className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
        {n.type === "trigger" && <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />}
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setDraft(n.label); setEditing(false) } }}
            className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-sm"
          />
        ) : (
          <button type="button" onDoubleClick={() => setEditing(true)} className="min-w-0 flex-1 truncate text-left" title="Double-click to rename">
            {n.label}{n.type === "decision" && !n.label.endsWith("?") ? "?" : ""}
          </button>
        )}
        <select value={lane?.actor ?? ""} onChange={(e) => e.target.value === "__new__" ? onActor(prompt("Who does this step?") ?? lane?.actor ?? "") : onActor(e.target.value)} className="h-6 max-w-[150px] rounded-full border border-border bg-primary/5 px-2 text-[11px] text-primary" title="Who does this">
          {lane && !actors.includes(lane.actor) && <option value={lane.actor}>{lane.actor}</option>}
          {actors.map((a) => <option key={a} value={a}>{a}</option>)}
          <option value="__new__">Someone else…</option>
        </select>
        <button type="button" onClick={onToggleDecision} className={cn("rounded p-1 text-muted-foreground hover:text-foreground", n.type === "decision" && "text-amber-600")} title={n.type === "decision" ? "Make this a step" : "Make this a decision"}><Diamond className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={onDelete} className="rounded p-1 text-muted-foreground hover:text-red-600" title="Delete step"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      {(handoff || gaps.length > 0) && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-7 text-[11px]">
          {handoff && edge && (
            <span className={manual ? "text-red-600" : "text-amber-600"}>↳ handoff from {prevLane.actor} · {edgeHow(edge)}</span>
          )}
          {gaps.map((g) => (
            <button key={g.id} type="button" onClick={onOpen} className="flex items-center gap-1 text-amber-600 hover:underline" title={g.detail}>
              <HelpCircle className="h-3 w-3" /> {g.title}
            </button>
          ))}
        </div>
      )}
    </li>
  )
}

function AddStep({ actors, onAdd, first }: { actors: string[]; onAdd: (label: string, actor: string, type: "step" | "decision") => void; first: boolean }) {
  const [label, setLabel] = useState("")
  const [actor, setActor] = useState(actors[0] ?? "")
  const [type, setType] = useState<"step" | "decision">("step")
  const who = actor || actors[0] || ""

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const l = label.trim()
    if (!l) return
    const a = who.trim() || (prompt("Who does this step?") ?? "").trim()
    if (!a) return
    onAdd(l, a, type)
    setLabel("")
    setActor(a)
  }

  return (
    <form onSubmit={submit} onPointerDown={(e) => e.stopPropagation()} className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-card/60 px-3 py-2">
      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={first ? "First step, e.g. Customer calls or fills in the website form" : "Next step, e.g. Dana confirms the visit time"} className="min-w-[200px] flex-1 rounded border border-border bg-background px-2 py-1 text-sm" />
      {actors.length > 0 ? (
        <select value={who} onChange={(e) => setActor(e.target.value === "__new__" ? (prompt("Who does this step?") ?? who) : e.target.value)} className="h-7 rounded border border-border bg-background px-2 text-xs">
          {!actors.includes(who) && who && <option value={who}>{who}</option>}
          {actors.map((a) => <option key={a} value={a}>{a}</option>)}
          <option value="__new__">Someone else…</option>
        </select>
      ) : (
        <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Who does it" className="w-32 rounded border border-border bg-background px-2 py-1 text-xs" />
      )}
      <select value={type} onChange={(e) => setType(e.target.value as "step" | "decision")} className="h-7 rounded border border-border bg-background px-2 text-xs">
        <option value="step">Step</option>
        <option value="decision">Decision</option>
      </select>
      <Button type="submit" size="sm" className="h-7">Add step</Button>
    </form>
  )
}
