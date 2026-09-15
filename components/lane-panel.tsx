"use client"

import type React from "react"
import { GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import { LANE_HEADER_W, type Lane } from "@/lib/model"
import type { LaneBox } from "@/lib/geometry"
import { InlineEditor } from "./inline-editor"

interface LanePanelProps {
  lane: LaneBox
  index: number
  width: number
  isSelected: boolean
  isEditing: boolean
  interactive: boolean
  nodeCount: number
  onPointerDownHeader: (e: React.PointerEvent, lane: Lane) => void
  onPointerDownResize: (e: React.PointerEvent, lane: Lane) => void
  onStartEditing: (laneId: string) => void
  onCommitActor: (laneId: string, actor: string) => void
  onCancelEditing: () => void
}

/**
 * One actor's swimlane: a full-width band with a fixed header on the left.
 * Drag the header to reorder lanes, drag the bottom border to resize.
 */
export function LanePanel({
  lane,
  index,
  width,
  isSelected,
  isEditing,
  interactive,
  nodeCount,
  onPointerDownHeader,
  onPointerDownResize,
  onStartEditing,
  onCommitActor,
  onCancelEditing,
}: LanePanelProps) {
  const color = lane.color ?? "#64748b"

  const commit = (next: string) => {
    if (next && next !== lane.actor) onCommitActor(lane.id, next)
    else onCancelEditing()
  }

  return (
    <div
      className={cn("absolute left-0 border-b border-border/70", isSelected && "z-[1]")}
      style={{
        top: lane.top,
        width,
        height: lane.height,
        backgroundColor: `${color}${isSelected ? "1f" : index % 2 ? "0a" : "12"}`,
        boxShadow: isSelected ? `inset 0 0 0 2px ${color}` : `inset 0 -1px 0 ${color}55`,
      }}
    >
      <div
        className={cn(
          "absolute left-0 top-0 flex h-full flex-col justify-center gap-1 border-r border-border/70 bg-card/90 py-2 pl-4 pr-3 backdrop-blur-[2px]",
          interactive && "cursor-grab active:cursor-grabbing",
        )}
        style={{ width: LANE_HEADER_W, boxShadow: `inset 5px 0 0 ${color}` }}
        onPointerDown={(e) => {
          if (!interactive) return
          e.stopPropagation()
          onPointerDownHeader(e, lane)
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onStartEditing(lane.id)
        }}
      >
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          {isEditing ? (
            <InlineEditor
              value={lane.actor}
              onCommit={commit}
              onCancel={onCancelEditing}
              className="w-full rounded border border-border bg-background px-1 text-xs font-semibold outline-none"
            />
          ) : (
            <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-foreground" title={lane.actor}>
              {lane.actor}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <GripVertical className="h-3 w-3 opacity-50" />
          {nodeCount} {nodeCount === 1 ? "step" : "steps"}
        </div>
      </div>

      {interactive && (
        <div
          title="Drag to resize lane"
          onPointerDown={(e) => {
            e.stopPropagation()
            onPointerDownResize(e, lane)
          }}
          className="absolute -bottom-1 left-0 h-2 w-full cursor-ns-resize hover:bg-primary/20"
        />
      )}
    </div>
  )
}
