"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { EDGE_TYPE_META, type Connection, type Node } from "@/lib/diagram-templates"
import { edgeLabelPoint, nodeCenter } from "@/lib/geometry"

interface EdgeLabelProps {
  connection: Connection
  index: number
  from: Node
  to: Node
  isSelected: boolean
  isDimmed: boolean
  isEditing: boolean
  onSelect: () => void
  onStartEditing: () => void
  onCommit: (label: string) => void
  onCancel: () => void
}

/**
 * Edge labels are HTML, positioned in the open gap between the two nodes rather
 * than at the geometric midpoint — which, now that edges run center-to-center,
 * would often land underneath a node. They paint below the nodes so they can
 * never swallow a drag aimed at a node or its connection handles.
 */
export function EdgeLabel({
  connection,
  from,
  to,
  isSelected,
  isDimmed,
  isEditing,
  onSelect,
  onStartEditing,
  onCommit,
  onCancel,
}: EdgeLabelProps) {
  const meta = EDGE_TYPE_META[connection.type] || EDGE_TYPE_META.sequence
  const mid = edgeLabelPoint(nodeCenter(from), nodeCenter(to), from, to)
  const [draft, setDraft] = useState(connection.label ?? "")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) {
      setDraft(connection.label ?? "")
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [isEditing, connection.label])

  const commit = () => onCommit(draft.trim())

  if (!connection.label && !isEditing) {
    // Unlabelled edge: show a small add-affordance only when the edge is selected
    if (!isSelected) return null
    return (
      <button
        type="button"
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
        style={{ left: mid.x, top: mid.y, borderColor: meta.color, backgroundColor: "var(--card)" }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onStartEditing()
        }}
      >
        + label
      </button>
    )
  }

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: mid.x, top: mid.y, opacity: isDimmed ? 0.3 : 1 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === "Enter") commit()
            if (e.key === "Escape") onCancel()
          }}
          className="w-24 rounded-full border bg-card px-2 py-0.5 text-center text-[11px] outline-none"
          style={{ borderColor: meta.color }}
        />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSelect()
          }}
          onDoubleClick={(e) => {
            e.stopPropagation()
            onStartEditing()
          }}
          className={cn(
            "max-w-[140px] truncate rounded-full border bg-card px-2 py-0.5 text-[11px] leading-tight text-foreground shadow-sm",
            isSelected ? "font-medium" : "hover:shadow",
          )}
          style={{ borderColor: meta.color, borderWidth: isSelected ? 2 : 1 }}
          title="Double-click to edit"
        >
          {connection.label}
        </button>
      )}
    </div>
  )
}
