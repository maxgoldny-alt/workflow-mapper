"use client"

import { Plus, HelpCircle, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { blankDoc, handoffs, isManualEdge, newId, openQuestions, processesInArea, type Model, type ProcessArea } from "@/lib/model"
import type { Selection } from "@/lib/selection"

interface AreaViewProps {
  model: Model
  area: ProcessArea
  selection: Selection
  setSelection: (s: Selection) => void
  commit: (fn: (m: Model) => Model) => void
  onOpenProcess: (processId: string) => void
}

/** One Process Area: its processes as cards. Double-click a card to open the swimlane view. */
export function AreaView({ model, area, selection, setSelection, commit, onOpenProcess }: AreaViewProps) {
  const procs = processesInArea(model, area.id)
  const color = area.color ?? "#64748b"

  const addProcess = () => {
    const id = newId("proc")
    commit((m) => ({ ...m, processes: [...m.processes, { id, areaId: area.id, name: `Process ${procs.length + 1}`, doc: blankDoc() }] }))
    onOpenProcess(id)
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-canvas p-6" onPointerDown={() => setSelection({ kind: "area", id: area.id })}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-start gap-3">
          <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <div>
            <h2 className="text-lg font-semibold">{area.name}</h2>
            <p className="text-sm text-muted-foreground">{area.purpose || "No purpose recorded. Select the area to describe it."}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              In: {area.inputs || "?"} <ArrowRight className="inline h-3 w-3" /> Out: {area.outputs || "?"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {procs.map((p) => {
            const steps = p.doc.nodes.filter((n) => n.type === "step" || n.type === "decision" || n.type === "trigger").length
            const hs = handoffs(p.doc)
            const manual = hs.filter((h) => isManualEdge(h.edge)).length
            const q = openQuestions(model).filter((x) => x.ref.processId === p.id).length
            const sel = selection?.kind === "process" && selection.id === p.id
            return (
              <button
                key={p.id}
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setSelection({ kind: "process", id: p.id })
                }}
                onDoubleClick={() => onOpenProcess(p.id)}
                className={cn("flex flex-col rounded-xl border-2 bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md", sel ? "border-primary" : "border-border")}
              >
                <span className="text-sm font-semibold">{p.name}</span>
                <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.purpose || "No purpose recorded"}</span>
                <span className="mt-2 text-xs text-muted-foreground">{p.doc.lanes.map((l) => l.actor).join(" · ") || "No actors"}</span>
                {(p.doc.frames?.length ?? 0) > 0 && (
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {[...(p.doc.frames ?? [])].sort((a, b) => a.x - b.x).map((f) => (
                      <span key={f.id} className="rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: `${f.color ?? "#64748b"}99`, color: f.color ?? "#64748b" }}>{f.name}</span>
                    ))}
                  </span>
                )}
                <span className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{steps} steps</span>
                  <span>{hs.length} handoffs</span>
                  {manual > 0 && <span className="text-red-600">{manual} manual</span>}
                  {q > 0 && (
                    <span className="flex items-center gap-0.5 text-amber-600">
                      <HelpCircle className="h-3 w-3" /> {q}
                    </span>
                  )}
                </span>
                <span className="mt-3 text-[11px] text-primary">Open →</span>
              </button>
            )
          })}

          <button
            type="button"
            onClick={addProcess}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-foreground"
          >
            <Plus className="mb-1 h-5 w-5" />
            Add workflow
          </button>
        </div>

        {procs.length === 0 && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            No workflows yet. Add one, or ask the AI interviewer about what happens in {area.name}.
          </p>
        )}
      </div>
      <div className="hidden">
        <Button />
      </div>
    </div>
  )
}
