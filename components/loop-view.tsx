"use client"

import { ArrowRight, HelpCircle, AlertTriangle, Server, Layers, Plus, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  AREA_COLORS,
  areaManualHandoffs,
  areaOpenQuestions,
  areaSystems,
  newId,
  openQuestions,
  processesInArea,
  type Model,
  type ProcessArea,
} from "@/lib/model"
import type { Finding } from "@/lib/findings"
import type { Selection } from "@/lib/selection"

interface LoopViewProps {
  model: Model
  findings: Finding[]
  selection: Selection
  setSelection: (s: Selection) => void
  commit: (fn: (m: Model) => Model) => void
  onOpenArea: (areaId: string) => void
  onMapArea: (areaId: string) => void
  onAskAbout: (areaId: string) => void
  onStartInterview: () => void
}

/**
 * The Business Loop: the full operating cycle as a row of stage cards.
 * Shallow on purpose. Each card summarises what sits under it; drilling in
 * opens the existing area/process depth.
 */
export function LoopView({ model, findings, selection, setSelection, commit, onOpenArea, onMapArea, onAskAbout, onStartInterview }: LoopViewProps) {
  const areas = [...model.areas].sort((a, b) => a.order - b.order)
  const issues = findings.filter((f) => f.rule !== "unresolved-question" && f.rule !== "cross-actor-handoff")
  const questions = openQuestions(model)
  const unmapped = areas.filter((a) => processesInArea(model, a.id).every((p) => p.doc.nodes.length === 0))
  const missingSystems = model.processes.flatMap((p) => p.doc.nodes.filter((n) => (n.type === "system" || n.type === "tool") && !n.systemId).map((n) => n.label))
  const areaName = (id?: string) => areas.find((a) => a.id === id)?.name
  const procName = (id?: string) => model.processes.find((p) => p.id === id)?.name

  const addStage = () => {
    const id = newId("area")
    commit((m) => ({ ...m, areas: [...m.areas, { id, name: `Stage ${m.areas.length + 1}`, order: m.areas.length, color: AREA_COLORS[m.areas.length % AREA_COLORS.length] }] }))
    setSelection({ kind: "area", id })
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-canvas" onPointerDown={() => setSelection(null)}>
      <div className="mx-auto max-w-[1400px] px-6 py-5">
        <div className="mb-4 flex items-end gap-3">
          <div>
            <h2 className="text-base font-semibold">Business Loop</h2>
            <p className="text-xs text-muted-foreground">
              {model.company.industry ? `${model.company.industry} · ` : ""}
              {areas.length} stages · {model.processes.length} workflows mapped · click a stage for details, double-click to drill in
            </p>
          </div>
          <div className="mr-44 ml-auto flex gap-2" onPointerDown={(e) => e.stopPropagation()}>
            <Button variant="outline" size="sm" onClick={addStage}><Plus className="mr-1 h-3.5 w-3.5" /> Stage</Button>
          </div>
        </div>

        {areas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/80 p-8 text-center">
            <h3 className="text-base font-semibold">No loop yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Add stages by hand, or let the interviewer lay out the loop from what you tell it.</p>
            <div className="mt-4 flex justify-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
              <Button onClick={onStartInterview}><Sparkles className="mr-1.5 h-4 w-4" /> Start with AI</Button>
              <Button variant="outline" onClick={addStage}><Plus className="mr-1 h-4 w-4" /> Add stage</Button>
            </div>
          </div>
        ) : (
          <div className="flex items-stretch gap-2 overflow-x-auto pb-3">
            {areas.map((a, i) => (
              <div key={a.id} className="flex items-stretch">
                <StageCard
                  area={a}
                  model={model}
                  findings={issues}
                  selected={selection?.kind === "area" && selection.id === a.id}
                  onSelect={() => setSelection({ kind: "area", id: a.id })}
                  onOpen={() => onOpenArea(a.id)}
                  onMap={() => onMapArea(a.id)}
                  onAsk={() => onAskAbout(a.id)}
                />
                {i < areas.length - 1 && (
                  <div className="flex w-7 shrink-0 items-center justify-center text-muted-foreground/60">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {areas.length > 0 && (
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4" onPointerDown={(e) => e.stopPropagation()}>
            <Summary icon={HelpCircle} color="#d97706" title="Open questions" count={questions.length} empty="Nothing open">
              {questions.slice(0, 3).map((q) => (
                <li key={q.id} className="truncate" title={q.text}>{q.text}</li>
              ))}
            </Summary>
            <Summary icon={AlertTriangle} color="#dc2626" title="Issues" count={issues.length} empty="None found">
              {issues.slice(0, 3).map((f) => (
                <li key={f.id} className="truncate" title={f.title}>
                  {f.title}
                  <span className="text-muted-foreground/70"> · {procName(f.ref.processId) ?? areaName(f.ref.areaId) ?? ""}</span>
                </li>
              ))}
            </Summary>
            <Summary icon={Server} color="#7c3aed" title="Systems not identified" count={missingSystems.length} empty="All systems catalogued">
              {[...new Set(missingSystems)].slice(0, 3).map((s) => (
                <li key={s} className="truncate">{s}</li>
              ))}
            </Summary>
            <Summary icon={Layers} color="#0891b2" title="Stages not mapped" count={unmapped.length} empty="Every stage has a workflow">
              {unmapped.slice(0, 3).map((a) => (
                <li key={a.id} className="truncate">{a.name}</li>
              ))}
            </Summary>
          </div>
        )}
      </div>
    </div>
  )
}

function StageCard({ area, model, findings, selected, onSelect, onOpen, onMap, onAsk }: { area: ProcessArea; model: Model; findings: Finding[]; selected: boolean; onSelect: () => void; onOpen: () => void; onMap: () => void; onAsk: () => void }) {
  const color = area.color ?? "#64748b"
  const procs = processesInArea(model, area.id)
  const mapped = procs.some((p) => p.doc.nodes.length > 0)
  const systems = areaSystems(model, area.id)
  const pids = new Set(procs.map((p) => p.id))
  const issueCount = findings.filter((f) => f.ref.areaId === area.id || (f.ref.processId && pids.has(f.ref.processId))).length
  const questions = areaOpenQuestions(model, area.id)
  const manual = areaManualHandoffs(model, area.id)

  return (
    <div
      className={cn("flex w-[210px] shrink-0 cursor-pointer flex-col rounded-xl border-2 bg-card shadow-sm transition-shadow hover:shadow-md", selected && "shadow-lg")}
      style={{ borderColor: selected ? color : `${color}55` }}
      onPointerDown={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (mapped) onOpen()
      }}
    >
      <div className="rounded-t-[10px] px-3 py-2" style={{ backgroundColor: `${color}14`, boxShadow: `inset 4px 0 0 ${color}` }}>
        <div className="truncate text-sm font-semibold" title={area.name}>{area.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">{area.purpose || (mapped ? `${procs.length} ${procs.length === 1 ? "workflow" : "workflows"}` : "Not mapped yet")}</div>
      </div>

      {mapped ? (
        <div className="flex flex-1 flex-col gap-1.5 px-3 py-2">
          <div className="flex flex-wrap gap-1">
            <Badge n={procs.length} label={procs.length === 1 ? "workflow" : "workflows"} />
            <Badge n={systems.length} label={systems.length === 1 ? "system" : "systems"} />
            {questions > 0 && <Badge n={questions} label="open" color="#d97706" />}
            {issueCount > 0 && <Badge n={issueCount} label={issueCount === 1 ? "issue" : "issues"} color="#dc2626" />}
            {manual > 0 && <Badge n={manual} label="manual" color="#dc2626" />}
          </div>
          <button type="button" onClick={onOpen} className="mt-auto self-start text-[11px] text-primary hover:underline">Open →</button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-1.5 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">No detailed workflow mapped yet.</p>
          <div className="mt-auto flex flex-col gap-1">
            <Button size="sm" variant="outline" className="h-7 justify-start text-[11px]" onClick={onMap}><Plus className="mr-1 h-3 w-3" /> Map this stage</Button>
            <Button size="sm" variant="ghost" className="h-7 justify-start text-[11px]" onClick={onAsk}><Sparkles className="mr-1 h-3 w-3" /> Ask AI about it</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Badge({ n, label, color }: { n: number; label: string; color?: string }) {
  return (
    <span className="rounded-full border px-1.5 py-0.5 text-[10px] leading-none" style={color ? { color, borderColor: `${color}66`, backgroundColor: `${color}0d` } : undefined}>
      <span className="font-semibold">{n}</span> {label}
    </span>
  )
}

function Summary({ icon: Icon, color, title, count, empty, children }: { icon: typeof HelpCircle; color: string; title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
        <Icon className="h-3.5 w-3.5" style={{ color }} />
        {title}
        <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] font-normal text-muted-foreground">{count}</span>
      </div>
      {count === 0 ? <p className="text-[11px] text-muted-foreground">{empty}</p> : <ul className="space-y-0.5 text-[11px]">{children}</ul>}
      {count > 3 && <p className="mt-1 text-[10px] text-muted-foreground">+{count - 3} more in the tray below</p>}
    </div>
  )
}
