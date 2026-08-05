"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { GripHorizontal } from "lucide-react"

interface ScreenPanelProps {
  id: string
  title: string
  x: number
  y: number
  width: number
  height: number
  onDrag?: (id: string, deltaX: number, deltaY: number) => void
}

export function ScreenPanel({ id, title, x, y, width, height, onDrag }: ScreenPanelProps) {
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const onDragRef = useRef(onDrag)

  useEffect(() => {
    onDragRef.current = onDrag
  }, [onDrag])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    setIsDragging(true)
    dragStartRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation()
    const touch = e.touches[0]
    setIsDragging(true)
    dragStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x
      const deltaY = e.clientY - dragStartRef.current.y

      if (deltaX === 0 && deltaY === 0) return

      if (onDragRef.current) {
        onDragRef.current(id, deltaX, deltaY)
        dragStartRef.current = { x: e.clientX, y: e.clientY }
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      const deltaX = touch.clientX - dragStartRef.current.x
      const deltaY = touch.clientY - dragStartRef.current.y

      if (deltaX === 0 && deltaY === 0) return

      if (onDragRef.current) {
        onDragRef.current(id, deltaX, deltaY)
        dragStartRef.current = { x: touch.clientX, y: touch.clientY }
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    const handleTouchEnd = () => {
      setIsDragging(false)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    window.addEventListener("touchmove", handleTouchMove, { passive: false })
    window.addEventListener("touchend", handleTouchEnd)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
      window.removeEventListener("touchmove", handleTouchMove)
      window.removeEventListener("touchend", handleTouchEnd)
    }
  }, [isDragging, id])

  return (
    <div
      className={`absolute rounded-xl border border-border/30 bg-card/20 backdrop-blur-sm transition-shadow ${
        isDragging ? "shadow-lg shadow-primary/20 border-primary/50" : ""
      }`}
      style={{ left: x, top: y, width, height }}
    >
      {/* Header - Draggable (moves the screen and every node inside it) */}
      <div
        className={`flex items-center gap-2 px-4 py-2 border-b border-border/30 cursor-grab select-none ${
          isDragging ? "cursor-grabbing bg-primary/10" : "hover:bg-primary/5"
        }`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <GripHorizontal className="w-4 h-4 text-muted-foreground/50" />
        <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
      </div>

      {/* Corner accents */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <line x1="0" y1="20" x2="0" y2="40" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" className="text-primary" />
        <line x1="0" y1="20" x2="20" y2="20" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" className="text-primary" />
        <line x1={width} y1="20" x2={width} y2="40" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" className="text-primary" />
        <line x1={width} y1="20" x2={width - 20} y2="20" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" className="text-primary" />
        <line x1="0" y1={height - 20} x2="0" y2={height - 40} stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" className="text-primary" />
        <line x1="0" y1={height - 20} x2="20" y2={height - 20} stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" className="text-primary" />
        <line x1={width} y1={height - 20} x2={width} y2={height - 40} stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" className="text-primary" />
        <line x1={width} y1={height - 20} x2={width - 20} y2={height - 20} stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" className="text-primary" />
      </svg>
    </div>
  )
}
