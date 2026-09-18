"use client"

import { cn } from "@/lib/utils"
import { CHANNEL_META, EDGE_TYPE_META, EXECUTION_META, edgeHow, type Connection, type Node } from "@/lib/model"
import { edgeLabelPoint, nodeCenter } from "@/lib/geometry"
import { channelIcons } from "./toolbar"
import { InlineEditor } from "./inline-editor"

interface EdgeLabelProps {
  connection: Connection
  from: Node
  to: Node
  isHandoff: boolean
  isSelected: boolean
  isDimmed: boolean
  isEditing: boolean
  showPayload: boolean
  badge?: { text: string; color: string; title: string }
  onSelect: () => void
  onStartEditing: () => void
  onCommit: (label: string) => void
  onCancel: () => void
}

/**
 * Edge labels are HTML, positioned in the open gap between the two nodes. They
 * paint below the nodes so they never swallow a drag aimed at a node. Handoffs
 * always show a pill carrying the channel glyph, even when unlabelled, because
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
  showPayload,
  badge,
  onSelect,
  onStartEditing,
  onCommit,
  onCancel,
}: EdgeLabelProps) {
  const meta = EDGE_TYPE_META[connection.type] || EDGE_TYPE_META.sequence
  const exec = EXECUTION_META[connection.execution] || EXECUTION_META.unknown
  const ChannelIcon = channelIcons[connection.channel] ?? channelIcons.unknown
  const mid = edgeLabelPoint(nodeCenter(from), nodeCenter(to), from, to)
  const known = connection.channel !== "unknown" || connection.execution !== "unknown"
  const showGlyph = isHandoff || known
  const text = showPayload && connection.payload ? connection.payload : connection.label || (isHandoff ? CHANNEL_META[connection.channel].label.toLowerCase() : "")

  if (!text && !showGlyph && !isEditing && !badge) {
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
      style={{ left: mid.x, top: mid.y, opacity: isDimmed ? 0.25 : 1 }}
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
            "relative flex max-w-[180px] items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] leading-tight text-foreground shadow-sm",
            isSelected ? "font-medium" : "hover:shadow",
          )}
          style={{
            borderColor: isHandoff ? exec.color : meta.color,
            borderWidth: isSelected ? 2 : 1,
            backgroundColor: isHandoff ? `color-mix(in srgb, ${exec.color} 12%, var(--card))` : undefined,
          }}
          title={`${edgeHow(connection)}${connection.payload ? ` · ${connection.payload}` : ""} — double-click to edit label`}
        >
          {showGlyph && <ChannelIcon className="h-3 w-3 shrink-0" style={{ color: exec.color }} />}
          {text && <span className="truncate">{text}</span>}
          {badge && (
            <span
              className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white"
              style={{ backgroundColor: badge.color }}
              title={badge.title}
            >
              {badge.text}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
