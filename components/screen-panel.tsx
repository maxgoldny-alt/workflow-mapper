"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { Screen } from "@/lib/diagram-templates"

interface ScreenPanelProps {
  screen: Screen
  isSelected: boolean
  isEditing: boolean
  interactive: boolean
  nodeCount: number
  onPointerDownHeader: (e: React.PointerEvent, screen: Screen) => void
  onPointerDownResize: (e: React.PointerEvent, screen: Screen) => void
  onStartEditing: (screenId: string) => void
  onCommitTitle: (screenId: string, title: string) => void
  onCancelEditing: () => void
}

export function ScreenPanel({
  screen,
  isSelected,
  isEditing,
  interactive,
  nodeCount,
  onPointerDownHeader,
  onPointerDownResize,
  onStartEditing,
  onCommitTitle,
  onCancelEditing,
}: ScreenPanelProps) {
  const [draft, setDraft] = useState(screen.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) {
      setDraft(screen.title)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [isEditing, screen.title])

  const commit = () => {
    const next = draft.trim()
    if (next && next !== screen.title) onCommitTitle(screen.id, next)
    else onCancelEditing()
  }

  return (
    <div
      className={cn(
        "absolute rounded-xl border-2 bg-card/40",
        isSelected ? "border-primary" : "border-border",
      )}
      style={{ left: screen.x, top: screen.y, width: screen.width, height: screen.height }}
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-t-lg border-b border-border/70 px-3 py-1.5",
          interactive && "cursor-grab active:cursor-grabbing",
        )}
        onPointerDown={(e) => interactive && onPointerDownHeader(e, screen)}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onStartEditing(screen.id)
        }}
      >
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
            className="w-full rounded border border-border bg-background px-1 text-xs font-semibold outline-none"
          />
        ) : (
          <>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{screen.title}</span>
            <span className="text-[10px] text-muted-foreground/70">{nodeCount}</span>
          </>
        )}
      </div>

      {interactive && (
        <div
          title="Resize"
          onPointerDown={(e) => onPointerDownResize(e, screen)}
          className="absolute -bottom-1 -right-1 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-primary bg-card opacity-0 transition-opacity hover:opacity-100"
          style={{ opacity: isSelected ? 1 : undefined }}
        />
      )}
    </div>
  )
}
