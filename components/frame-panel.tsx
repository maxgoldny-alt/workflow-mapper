"use client"

import type React from "react"
import { cn } from "@/lib/utils"
import type { Frame } from "@/lib/model"
import { InlineEditor } from "./inline-editor"

interface FramePanelProps {
  frame: Frame
  isSelected: boolean
  isEditing: boolean
  interactive: boolean
  count: number
  onPointerDownHeader: (e: React.PointerEvent, frame: Frame) => void
  onPointerDownResize: (e: React.PointerEvent, frame: Frame) => void
  onStartEditing: (id: string) => void
  onCommitName: (id: string, name: string) => void
  onCancelEditing: () => void
}

/**
 * A phase frame: a named box around a group of steps. Drag the header to move
 * the frame and everything inside it; drag the corner to resize. Frames are
 * layout only; they never change what a step means.
 */
export function FramePanel({ frame, isSelected, isEditing, interactive, count, onPointerDownHeader, onPointerDownResize, onStartEditing, onCommitName, onCancelEditing }: FramePanelProps) {
  const color = frame.color ?? "#64748b"
  return (
    <div
      className={cn("absolute rounded-xl border-2 border-dashed", isSelected ? "border-solid" : "")}
      style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height, borderColor: isSelected ? color : `${color}99`, backgroundColor: `${color}0a` }}
    >
      <div
        className={cn("absolute left-2 top-0 flex -translate-y-1/2 items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-[11px] font-semibold shadow-sm", interactive && "cursor-grab active:cursor-grabbing")}
        style={{ borderColor: color, color }}
        onPointerDown={(e) => {
          if (!interactive) return
          e.stopPropagation()
          onPointerDownHeader(e, frame)
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onStartEditing(frame.id)
        }}
      >
        {isEditing ? (
          <InlineEditor
            value={frame.name}
            onCommit={(v) => (v && v !== frame.name ? onCommitName(frame.id, v) : onCancelEditing())}
            onCancel={onCancelEditing}
            className="w-32 rounded border border-border bg-background px-1 text-[11px] font-semibold text-foreground outline-none"
          />
        ) : (
          <>
            <span>{frame.name}</span>
            <span className="font-normal opacity-70">{count}</span>
          </>
        )}
      </div>
      {interactive && (
        <div
          title="Resize"
          onPointerDown={(e) => {
            e.stopPropagation()
            onPointerDownResize(e, frame)
          }}
          className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-sm border-2 bg-card"
          style={{ borderColor: color, opacity: isSelected ? 1 : 0.5 }}
        />
      )}
    </div>
  )
}
