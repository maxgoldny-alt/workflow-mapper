"use client"

import {
  MousePointer2,
  Hand,
  ListChecks,
  Diamond,
  Wrench,
  Server,
  StickyNote,
  Rows3,
  HelpCircle,
  Mail,
  MessageSquare,
  Table,
  Plug,
  PlugZap,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { NODE_TYPE_META, NODE_TYPES, type Mechanism, type NodeType } from "@/lib/model"

export type Tool = { kind: "select" } | { kind: "hand" } | { kind: "node"; nodeType: NodeType }

export const nodeIcons: Record<NodeType, typeof Hand> = {
  step: ListChecks,
  decision: Diamond,
  tool: Wrench,
  system: Server,
  note: StickyNote,
}

export const mechanismIcons: Record<Mechanism, typeof Hand> = {
  unknown: HelpCircle,
  manual: Hand,
  email: Mail,
  chat: MessageSquare,
  spreadsheet: Table,
  "api-available": Plug,
  "api-wired": PlugZap,
  automated: Zap,
}

interface ToolbarProps {
  tool: Tool
  onToolChange: (tool: Tool) => void
  onAddLane: () => void
}

export function Toolbar({ tool, onToolChange, onAddLane }: ToolbarProps) {
  const button = (active: boolean, onClick: () => void, Icon: typeof Hand, title: string, color?: string) => (
    <button
      key={title}
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-lg border transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      style={active && color ? { borderColor: color, backgroundColor: `${color}1a`, color } : undefined}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  )

  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-3">
      {button(tool.kind === "select", () => onToolChange({ kind: "select" }), MousePointer2, "Select — V")}
      {button(tool.kind === "hand", () => onToolChange({ kind: "hand" }), Hand, "Hand / pan — H (or hold Space)")}

      <div className="my-1 h-px w-8 bg-border" />

      {NODE_TYPES.map((t) =>
        button(
          tool.kind === "node" && tool.nodeType === t,
          () => onToolChange({ kind: "node", nodeType: t }),
          nodeIcons[t],
          `${NODE_TYPE_META[t].label} — ${NODE_TYPE_META[t].shortcut} (then click to place)`,
          NODE_TYPE_META[t].color,
        ),
      )}

      <div className="my-1 h-px w-8 bg-border" />

      {button(false, onAddLane, Rows3, "Add actor lane — L")}
    </div>
  )
}
