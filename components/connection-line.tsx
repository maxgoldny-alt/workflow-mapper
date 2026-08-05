"use client"

import type React from "react"
import { EDGE_TYPE_META, type Connection, type Node } from "@/lib/diagram-templates"
import { edgeAnchors, edgePath } from "@/lib/geometry"

interface ConnectionLineProps {
  connection: Connection
  from: Node
  to: Node
  isSelected: boolean
  isDimmed: boolean
  onSelect: (e: React.MouseEvent) => void
}

export function ConnectionLine({ connection, from, to, isSelected, isDimmed, onSelect }: ConnectionLineProps) {
  const meta = EDGE_TYPE_META[connection.type] || EDGE_TYPE_META.sequence
  const { start, end } = edgeAnchors(from, to)
  const d = edgePath(start, end)

  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2

  const width = connection.lineStyle === "thick" ? 3 : 2
  const dash = connection.lineStyle === "dotted" ? "3 4" : meta.dash

  return (
    <g opacity={isDimmed ? 0.25 : 1}>
      {/* Invisible fat stroke so the edge is easy to click */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
        onClick={onSelect}
      />

      {isSelected && <path d={d} fill="none" stroke={meta.color} strokeWidth={width + 6} strokeOpacity={0.25} />}

      <path
        d={d}
        fill="none"
        stroke={meta.color}
        strokeWidth={isSelected ? width + 1 : width}
        strokeDasharray={dash}
        markerEnd={`url(#arrow-${connection.type})`}
        style={{ pointerEvents: "none" }}
      />

      {connection.label && (
        <g style={{ pointerEvents: "none" }}>
          <rect
            x={midX - connection.label.length * 3.3 - 6}
            y={midY - 9}
            width={connection.label.length * 6.6 + 12}
            height={18}
            rx={9}
            className="fill-card"
            stroke={meta.color}
            strokeOpacity={isSelected ? 0.9 : 0.35}
          />
          <text
            x={midX}
            y={midY}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="10"
            className="fill-foreground"
          >
            {connection.label}
          </text>
        </g>
      )}
    </g>
  )
}
