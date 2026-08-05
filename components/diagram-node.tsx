"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { NODE_TYPE_META, NODE_W, NODE_H, type Node } from "@/lib/diagram-templates"
import { nodeIcons } from "./toolbar"

export type HandleSide = "top" | "right" | "bottom" | "left"

interface DiagramNodeProps {
  node: Node
  isSelected: boolean
  isDimmed: boolean
  isConnectTarget: boolean
  isEditing: boolean
  interactive: boolean
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
  onPointerDown,
  onStartConnect,
  onStartEditing,
  onCommitLabel,
  onCancelEditing,
}: DiagramNodeProps) {
  const meta = NODE_TYPE_META[node.type]
  const Icon = nodeIcons[node.type]
  const [draft, setDraft] = useState(node.label)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) {
      setDraft(node.label)
      // Focus after paint so the click that opened the editor doesn't steal it back
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [isEditing, node.label])

  const commit = () => {
    const next = draft.trim()
    if (next && next !== node.label) onCommitLabel(node.id, next)
    else onCancelEditing()
  }

  return (
    <div
      className={cn(
        "group absolute select-none",
        isDimmed && "opacity-40",
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
          "flex h-full w-full flex-col items-center justify-center gap-1.5 border-2 bg-card px-2 shadow-sm transition-shadow",
          node.type === "actor" ? "rounded-full" : "rounded-xl",
          node.type === "decision" && "border-dashed",
        )}
        style={{
          borderColor: meta.color,
          backgroundColor: `${meta.color}0f`,
          boxShadow: isSelected || isConnectTarget ? `0 0 0 3px ${meta.color}40` : undefined,
        }}
      >
        <Icon className="h-5 w-5 shrink-0" style={{ color: meta.color }} />

        {isEditing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === "Enter") commit()
              if (e.key === "Escape") onCancelEditing()
            }}
            className="w-full rounded border border-border bg-background px-1 text-center text-xs font-medium outline-none"
          />
        ) : (
          <div className="w-full text-center">
            <div className="truncate text-xs font-medium leading-tight text-foreground">{node.label}</div>
            {node.sublabel && (
              <div className="truncate text-[10px] leading-tight text-muted-foreground">{node.sublabel}</div>
            )}
          </div>
        )}
      </div>

      {/* Connection handles — drag one onto another node to draw an edge */}
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
