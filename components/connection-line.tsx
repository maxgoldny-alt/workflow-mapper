"use client"

import { EDGE_TYPE_META, type EdgeType } from "@/lib/diagram-templates"

interface ConnectionLineProps {
  fromX: number
  fromY: number
  toX: number
  toY: number
  label?: string
  type: EdgeType
  lineStyle?: "solid" | "dotted" | "thick"
  isHighlighted: boolean
}

export function ConnectionLine({ fromX, fromY, toX, toY, label, type, lineStyle = "solid", isHighlighted }: ConnectionLineProps) {
  const meta = EDGE_TYPE_META[type] || EDGE_TYPE_META.sequence
  const stroke = meta.color
  const glow = meta.color

  // Determine stroke width based on lineStyle
  const baseStrokeWidth = lineStyle === "thick" ? 4 : 2
  const highlightedStrokeWidth = lineStyle === "thick" ? 5 : 3

  // Dash pattern comes from the edge type (data = dashed, uses = dotted), or an explicit override
  const getDashArray = () => {
    if (lineStyle === "dotted") return "4 4"
    return meta.dash
  }

  const midX = (fromX + toX) / 2
  const midY = (fromY + toY) / 2
  const dx = toX - fromX

  const cx1 = fromX + dx * 0.25
  const cy1 = fromY
  const cx2 = toX - dx * 0.25
  const cy2 = toY

  const pathD = `M ${fromX} ${fromY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${toX} ${toY}`

  return (
    <g className="transition-opacity duration-300" style={{ opacity: isHighlighted ? 1 : 0.35 }}>
      {/* Glow effect */}
      {isHighlighted && (
        <path d={pathD} fill="none" stroke={glow} strokeWidth="6" strokeOpacity="0.3" filter="url(#glow)" />
      )}

      {/* Main line with directional arrowhead */}
      <path
        d={pathD}
        fill="none"
        stroke={stroke}
        strokeWidth={isHighlighted ? highlightedStrokeWidth : baseStrokeWidth}
        strokeDasharray={getDashArray()}
        markerEnd={`url(#arrow-${type})`}
      />

      {/* Animated particles when highlighted */}
      {isHighlighted && (
        <circle r="4" fill={stroke}>
          <animateMotion dur="2s" repeatCount="indefinite" path={pathD} />
        </circle>
      )}

      {/* Label */}
      {label && (
        <g transform={`translate(${midX}, ${midY - 8})`}>
          <rect
            x="-35"
            y="-10"
            width="70"
            height="18"
            rx="4"
            fill="rgba(0,0,0,0.7)"
            stroke={isHighlighted ? stroke : "transparent"}
            strokeWidth="1"
          />
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            fill={isHighlighted ? stroke : "#888"}
            fontSize="9"
            fontFamily="var(--font-mono)"
            className="select-none"
          >
            {label}
          </text>
        </g>
      )}
    </g>
  )
}
