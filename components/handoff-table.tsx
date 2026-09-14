"use client"

import { ChevronDown, ChevronUp, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { MECHANISM_META, handoffs, isManualMechanism, type Doc } from "@/lib/model"
import { mechanismIcons } from "./toolbar"

interface HandoffTableProps {
  doc: Doc
  open: boolean
  selectedEdgeId: string | null
  onToggle: () => void
  onSelectEdge: (id: string) => void
}

/**
 * Every lane-crossing edge, most manual first. This is the "what should we
 * automate" list, derived live from the board.
 */
export function HandoffTable({ doc, open, selectedEdgeId, onToggle, onSelectEdge }: HandoffTableProps) {
  const rows = handoffs(doc)
  const manual = rows.filter((r) => isManualMechanism(r.edge.mechanism)).length
  const unknown = rows.filter((r) => r.edge.mechanism === "unknown").length

  return (
    <div className="shrink-0 border-t border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-1.5 text-xs text-muted-foreground hover:bg-muted/50"
      >
        <span className="font-medium text-foreground">Handoffs</span>
        <span>{rows.length} total</span>
        {manual > 0 && <span className="text-red-600">{manual} manual</span>}
        {unknown > 0 && <span>{unknown} unmapped</span>}
        <span className="ml-auto">{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}</span>
      </button>

      {open && (
        <div className="max-h-56 overflow-auto border-t border-border">
          {rows.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              No handoffs yet. Connect a step in one lane to a step in another lane.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-left text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-4 py-1.5 font-medium">From</th>
                  <th className="py-1.5 font-medium">To</th>
                  <th className="py-1.5 font-medium">How</th>
                  <th className="py-1.5 font-medium">What moves</th>
                  <th className="py-1.5 pr-4 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ edge, from, to, fromLane, toLane }) => {
                  const meta = MECHANISM_META[edge.mechanism]
                  const Icon = mechanismIcons[edge.mechanism]
                  return (
                    <tr
                      key={edge.id}
                      onClick={() => onSelectEdge(edge.id)}
                      className={cn(
                        "cursor-pointer border-t border-border/60 hover:bg-muted/50",
                        selectedEdgeId === edge.id && "bg-primary/10",
                      )}
                    >
                      <td className="px-4 py-1.5">
                        <span className="font-medium" style={{ color: fromLane.color }}>{fromLane.actor}</span>
                        <span className="text-muted-foreground"> · {from.label}</span>
                      </td>
                      <td className="py-1.5">
                        <span className="inline-flex items-center gap-1">
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium" style={{ color: toLane.color }}>{toLane.actor}</span>
                          <span className="text-muted-foreground"> · {to.label}</span>
                        </span>
                      </td>
                      <td className="py-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5" style={{ color: meta.color, borderColor: `${meta.color}66` }}>
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-1.5 text-muted-foreground">{edge.payload || "—"}</td>
                      <td className="max-w-[240px] truncate py-1.5 pr-4 text-muted-foreground">{edge.notes || ""}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
