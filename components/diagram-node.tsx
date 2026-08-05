"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { User, ListChecks, Diamond, Wrench, Server, GripVertical } from "lucide-react"
import type { NodeType } from "@/lib/diagram-templates"

interface DiagramNodeProps {
  id: string
  label: string
  sublabel?: string
  type: NodeType
  x: number
  y: number
  screen: string
  isSelected: boolean
  isConnected: boolean
  isHovered: boolean
  onSelect: () => void
  onHover: (hovered: boolean) => void
  onDrag: (nodeId: string, x: number, y: number) => void
}

const typeConfig: Record<NodeType, { icon: typeof User; className: string; glowColor: string }> = {
  actor: {
    icon: User,
    className: "border-cyan-500/50 bg-cyan-500/5 text-cyan-400 shadow-cyan-500/20 rounded-full",
    glowColor: "shadow-cyan-500/50",
  },
  step: {
    icon: ListChecks,
    className: "border-primary bg-primary/10 text-primary shadow-primary/20",
    glowColor: "shadow-primary/50",
  },
  decision: {
    icon: Diamond,
    className: "border-dashed border-amber-500/60 bg-amber-500/5 text-amber-400 shadow-amber-500/20",
    glowColor: "shadow-amber-500/50",
  },
  tool: {
    icon: Wrench,
    className: "border-green-500/50 bg-green-500/5 text-green-400 shadow-green-500/20",
    glowColor: "shadow-green-500/50",
  },
  system: {
    icon: Server,
    className: "border-violet-500/50 bg-violet-500/5 text-violet-400 shadow-violet-500/20",
    glowColor: "shadow-violet-500/50",
  },
}

export function DiagramNode({
  id,
  label,
  sublabel,
  type,
  x,
  y,
  isSelected,
  isConnected,
  isHovered,
  onSelect,
  onHover,
  onDrag,
}: DiagramNodeProps) {
  const config = typeConfig[type]
  const Icon = config.icon
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const nodeRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return // Only left click
    e.preventDefault()
    e.stopPropagation()

    setIsDragging(true)
    dragOffset.current = {
      x: e.clientX - x,
      y: e.clientY - y,
    }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation()
    const touch = e.touches[0]
    setIsDragging(true)
    dragOffset.current = {
      x: touch.clientX - x,
      y: touch.clientY - y,
    }
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffset.current.x
      const newY = e.clientY - dragOffset.current.y
      onDrag(id, Math.max(0, newX), Math.max(0, newY))
    }

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      const newX = touch.clientX - dragOffset.current.x
      const newY = touch.clientY - dragOffset.current.y
      onDrag(id, Math.max(0, newX), Math.max(0, newY))
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    const handleTouchEnd = () => {
      setIsDragging(false)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    document.addEventListener("touchmove", handleTouchMove, { passive: false })
    document.addEventListener("touchend", handleTouchEnd)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.removeEventListener("touchmove", handleTouchMove)
      document.removeEventListener("touchend", handleTouchEnd)
    }
  }, [isDragging, id, onDrag])

  return (
    <div
      ref={nodeRef}
      className={cn(
        "absolute transition-all duration-300 ease-out select-none",
        "w-[120px]",
        isDragging && "cursor-grabbing z-50 transition-none",
        !isDragging && "cursor-grab",
      )}
      style={{ left: x, top: y }}
      onClick={(e) => {
        if (!isDragging) {
          e.stopPropagation()
          onSelect()
        }
      }}
      onMouseEnter={() => !isDragging && onHover(true)}
      onMouseLeave={() => !isDragging && onHover(false)}
    >
      <div
        className={cn(
          "relative p-3 rounded-lg border-2 backdrop-blur-sm",
          "transition-all duration-300",
          config.className,
          (isSelected || isHovered || isDragging) && ["scale-110 z-20", "shadow-lg", config.glowColor],
          isConnected && !isHovered && "opacity-100",
          !isConnected && !isHovered && !isSelected && "opacity-60",
          isDragging && "ring-2 ring-white/30",
        )}
      >
        <div
          className="absolute -top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 p-1 rounded bg-background/80 border border-border/50 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          style={{ opacity: isHovered || isDragging ? 1 : 0 }}
        >
          <GripVertical className="w-3 h-3 text-muted-foreground" />
        </div>

        {/* Pulse ring when selected */}
        {isSelected && <div className="absolute inset-0 rounded-lg border-2 border-current animate-ping opacity-30" />}

        <div onMouseDown={handleMouseDown} onTouchStart={handleTouchStart}>
          {/* Icon */}
          <div className="flex justify-center mb-2">
            <Icon className={cn("w-6 h-6", type === "decision" && "rotate-0")} />
          </div>

          {/* Labels */}
          <div className="text-center">
            <div className="text-xs font-medium truncate">{label}</div>
            {sublabel && <div className="text-[10px] opacity-70 truncate">{sublabel}</div>}
          </div>
        </div>

        {/* Connection indicator dots */}
        {(isSelected || isHovered) && !isDragging && (
          <>
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-current animate-pulse" />
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-current animate-pulse" />
            <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 rounded-full bg-current animate-pulse" />
            <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 rounded-full bg-current animate-pulse" />
          </>
        )}
      </div>
    </div>
  )
}
