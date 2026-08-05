"use client"

import type React from "react"
import { EDGE_TYPE_META, type Connection, type Node } from "@/lib/diagram-templates"
import { edgePath, nodeCenter, arrowAt } from "@/lib/geometry"

interface ConnectionLineProps {
  connection: Connection
  from: Node
  to: Node
  isSelected: boolean
  isDimmed: boolean
  animate: boolean
  onSelect: (e: React.MouseEvent) => void
}

export function ConnectionLine({ connection, from, to, isSelected, isDimmed, animate, onSelect }: ConnectionLineProps) {
  const meta = EDGE_TYPE_META[connection.type] || EDGE_TYPE_META.sequence
  const start = nodeCenter(from)
  const end = nodeCenter(to)
  const d = edgePath(start, end)
  const arrow = arrowAt(start, end, to)

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

      {/* The line runs center-to-center and disappears under the node body */}
      <path
        d={d}
        fill="none"
        stroke={meta.color}
        strokeWidth={isSelected ? width + 1 : width}
        strokeDasharray={dash}
        style={{ pointerEvents: "none" }}
      />

      {/* Dashes travelling toward the target read as direction of flow */}
      {animate && (
        <path
          d={d}
          fill="none"
          stroke={meta.color}
          strokeWidth={width + 0.5}
          strokeDasharray="1 14"
          strokeLinecap="round"
          className="animate-edge-flow"
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Arrowhead sits on the target's border so it stays visible */}
      <polygon
        points="0,-4 9,0 0,4"
        fill={meta.color}
        transform={`translate(${arrow.x}, ${arrow.y}) rotate(${arrow.angle})`}
        style={{ pointerEvents: "none" }}
      />
    </g>
  )
}
