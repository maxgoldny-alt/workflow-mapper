"use client"

import { cn } from "@/lib/utils"
import { EDGE_TYPE_META, MECHANISM_META, type Connection, type Node } from "@/lib/model"
import { edgeLabelPoint, nodeCenter } from "@/lib/geometry"
import { mechanismIcons } from "./toolbar"
import { InlineEditor } from "./inline-editor"

interface EdgeLabelProps {
  connection: Connection
  from: Node
  to: Node
  isHandoff: boolean
  isSelected: boolean
  isDimmed: boolean
  isEditing: boolean
  onSelect: () => void
  onStartEditing: () => void
  onCommit: (label: string) => void
  onCancel: () => void
}

/**
 * Edge labels are HTML, positioned in the open gap between the two nodes. They
 * paint below the nodes so they never swallow a drag aimed at a node. Handoffs
 * always show a pill carrying the mechanism glyph, even when unlabelled, because
 * "how does this cross the lane" is the whole point of the map.
 */
export function EdgeLabel({
  connection,
  from,
  to,
  isHandoff,
  isSelected,
  isDimmed,
  isEditing,
  onSelect,
  onStartEditing,
  onCommit,
  onCancel,
}: EdgeLabelProps) {
  const meta = EDGE_TYPE_META[connection.type] || EDGE_TYPE_META.sequence
  const mech = MECHANISM_META[connection.mechanism] || MECHANISM_META.unknown
  const MechIcon = mechanismIcons[connection.mechanism] ?? mechanismIcons.unknown
  const mid = edgeLabelPoint(nodeCenter(from), nodeCenter(to), from, to)
  const showGlyph = isHandoff || connection.mechanism !== "unknown"
  const text = connection.label || (isHandoff ? mech.short : "")

  if (!text && !showGlyph && !isEditing) {
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
        <InlineEditor
          value={connection.label ?? ""}
          onCommit={onCommit}
          onCancel={onCancel}
          className="w-28 rounded-full border bg-card px-2 py-0.5 text-center text-[11px] outline-none"
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
            "flex max-w-[170px] items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] leading-tight text-foreground shadow-sm",
            isSelected ? "font-medium" : "hover:shadow",
          )}
          style={{
            borderColor: isHandoff ? mech.color : meta.color,
            borderWidth: isSelected ? 2 : 1,
            backgroundColor: isHandoff ? `color-mix(in srgb, ${mech.color} 12%, var(--card))` : undefined,
          }}
          title={`${mech.label}${connection.payload ? ` · ${connection.payload}` : ""} — double-click to edit label`}
        >
          {showGlyph && <MechIcon className="h-3 w-3 shrink-0" style={{ color: mech.color }} />}
          {text && <span className="truncate">{text}</span>}
        </button>
      )}
    </div>
  )
}
