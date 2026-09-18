"use client"

import type React from "react"
import { cn } from "@/lib/utils"
import { NODE_TYPE_META, NODE_W, NODE_H, VERIFICATION_META, type Node } from "@/lib/model"
import { nodeIcons } from "./toolbar"
import { InlineEditor } from "./inline-editor"

export type HandleSide = "top" | "right" | "bottom" | "left"

interface DiagramNodeProps {
  node: Node
  isSelected: boolean
  isDimmed: boolean
  isConnectTarget: boolean
  isEditing: boolean
  interactive: boolean
  badge?: { text: string; color: string; title: string }
  onPointerDown: (e: React.PointerEvent, node: Node) => void
  onStartConnect: (e: React.PointerEvent, node: Node, side: HandleSide) => void
  onStartEditing: (nodeId: string) => void
  onCommitLabel: (nodeId: string, label: string) => void
  onCancelEditing: () => void
}

const handlePositions: Record<HandleSide, string> = {
  top: "left-1/2 -top-1.5 -translate-x-1/2",
  right: "-right-1.5 top-1/2 -translate-y-1/2",
  bottom: "left-1/2 -bottom-1.5 -translate-x-1/2",
  left: "-left-1.5 top-1/2 -translate-y-1/2",
}

export function DiagramNode({
  node,
  isSelected,
  isDimmed,
  isConnectTarget,
  isEditing,
  interactive,
  badge,
  onPointerDown,
  onStartConnect,
  onStartEditing,
  onCommitLabel,
  onCancelEditing,
}: DiagramNodeProps) {
  const meta = NODE_TYPE_META[node.type]
  const Icon = nodeIcons[node.type]
  const isNote = node.type === "note"
  const ver = node.verification
  const commit = (next: string) => {
    if (next && next !== node.label) onCommitLabel(node.id, next)
    else onCancelEditing()
  }

  return (
    <div
      className={cn(
        "group absolute select-none transition-opacity",
        isDimmed && "opacity-25",
        interactive ? "cursor-grab active:cursor-grabbing" : "cursor-default",
      )}
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
      onPointerDown={(e) => onPointerDown(e, node)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onStartEditing(node.id)
      }}
    >
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-1.5 border-2 px-2 shadow-sm transition-shadow",
          isNote ? "rounded-sm border-transparent" : node.type === "trigger" ? "rounded-full bg-card" : "rounded-xl bg-card",
          node.type === "decision" && "border-dashed",
          ver === "inferred" && !isNote && "border-dotted",
        )}
        style={{
          borderColor: isNote ? undefined : meta.color,
          backgroundColor: isNote ? "#fef3c7" : `${meta.color}0f`,
          color: isNote ? "#713f12" : undefined,
          boxShadow: isSelected || isConnectTarget ? `0 0 0 3px ${meta.color}40` : undefined,
        }}
      >
        {!isNote && <Icon className="h-5 w-5 shrink-0" style={{ color: meta.color }} />}

        {isEditing ? (
          <InlineEditor
            value={node.label}
            onCommit={commit}
            onCancel={onCancelEditing}
            className="w-full rounded border border-border bg-background px-1 text-center text-xs font-medium text-foreground outline-none"
          />
        ) : (
          <div className="w-full text-center">
            <div className={cn("text-xs font-medium leading-tight", isNote ? "line-clamp-2" : "line-clamp-2 text-foreground")}>
              {node.label}
            </div>
            {node.sublabel && (
              <div className={cn("text-[10px] leading-tight", isNote ? "line-clamp-2 opacity-80" : "truncate text-muted-foreground")}>
                {node.sublabel}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status marks: notes dot, verification, finding badge */}
      {node.notes && !isNote && (
        <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full border border-card bg-amber-400" title={node.notes} />
      )}
      {ver && ver !== "confirmed" && !isNote && (
        <span
          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full border border-card px-1 text-[9px] font-semibold text-white"
          style={{ backgroundColor: VERIFICATION_META[ver].color }}
          title={VERIFICATION_META[ver].hint}
        >
          {VERIFICATION_META[ver].short}
        </span>
      )}
      {badge && (
        <span
          className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card px-1 text-[10px] font-semibold text-white"
          style={{ backgroundColor: badge.color }}
          title={badge.title}
        >
          {badge.text}
        </span>
      )}

      {interactive &&
        (Object.keys(handlePositions) as HandleSide[]).map((side) => (
          <button
            key={side}
            type="button"
            title="Drag to connect"
            onPointerDown={(e) => {
              e.stopPropagation()
              onStartConnect(e, node, side)
            }}
            className={cn(
              "absolute h-3 w-3 rounded-full border-2 border-card opacity-0 transition-opacity hover:scale-125",
              "group-hover:opacity-100",
              isSelected && "opacity-100",
              handlePositions[side],
            )}
            style={{ backgroundColor: meta.color }}
          />
        ))}
    </div>
  )
}
