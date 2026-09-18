"use client"

import type React from "react"
import { EDGE_TYPE_META, EXECUTION_META, type Connection, type Node } from "@/lib/model"
import { edgePath, nodeCenter, arrowAt } from "@/lib/geometry"

interface ConnectionLineProps {
  connection: Connection
  from: Node
  to: Node
  isHandoff: boolean
  isSelected: boolean
  isDimmed: boolean
  emphasised: boolean
  animate: boolean
  onSelect: (e: React.MouseEvent) => void
}

/**
 * Edge type sets the colour; execution sets the dash. A solid line means the
 * data moves on its own; a dashed one means a person is still carrying it.
 * Handoffs (lane-crossing edges) get a halo in the execution colour.
 */
export function ConnectionLine({
  connection,
  from,
  to,
  isHandoff,
  isSelected,
  isDimmed,
  emphasised,
  animate,
  onSelect,
}: ConnectionLineProps) {
  const meta = EDGE_TYPE_META[connection.type] || EDGE_TYPE_META.sequence
  const exec = EXECUTION_META[connection.execution] || EXECUTION_META.unknown
  const start = nodeCenter(from)
  const end = nodeCenter(to)
  const d = edgePath(start, end)
  const arrow = arrowAt(start, end, to)
  const width = isHandoff ? 2.5 : 2

  return (
    <g opacity={isDimmed ? 0.15 : 1}>
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
        onClick={onSelect}
      />

      {(isSelected || emphasised) && (
        <path
          d={d}
          fill="none"
          stroke={isSelected ? meta.color : exec.color}
          strokeWidth={width + 6}
          strokeOpacity={isSelected ? 0.25 : 0.2}
        />
      )}

      <path
        d={d}
        fill="none"
        stroke={meta.color}
        strokeWidth={isSelected ? width + 1 : width}
        strokeDasharray={exec.dash}
        style={{ pointerEvents: "none" }}
      />

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

      <polygon
        points="0,-4 9,0 0,4"
        fill={meta.color}
        transform={`translate(${arrow.x}, ${arrow.y}) rotate(${arrow.angle})`}
        style={{ pointerEvents: "none" }}
      />
    </g>
  )
}
