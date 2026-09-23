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
  Zap,
  HelpCircle,
  Mail,
  Phone,
  MessageSquare,
  Globe,
  FileText,
  Table,
  FileSpreadsheet,
  Plug,
  Cpu,
  Users,
  MoreHorizontal,
  Hash,
  MessageCircle,
  Frame,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { NODE_TYPE_META, NODE_TYPES, type Channel, type NodeType } from "@/lib/model"

export type Tool = { kind: "select" } | { kind: "hand" } | { kind: "node"; nodeType: NodeType } | { kind: "frame" }

export const nodeIcons: Record<NodeType, typeof Hand> = {
  step: ListChecks,
  decision: Diamond,
  trigger: Zap,
  tool: Wrench,
  system: Server,
  note: StickyNote,
}

export const channelIcons: Record<Channel, typeof Hand> = {
  email: Mail,
  phone: Phone,
  sms: MessageSquare,
  website: Globe,
  "web-form": Globe,
  slack: Hash,
  teams: MessageCircle,
  whatsapp: MessageCircle,
  chat: MessageSquare,
  spreadsheet: Table,
  csv: FileSpreadsheet,
  paper: FileText,
  api: Plug,
  system: Cpu,
  "in-person": Users,
  other: MoreHorizontal,
  unknown: HelpCircle,
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
        "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      style={active && color ? { borderColor: color, backgroundColor: `${color}1a`, color } : undefined}
    >
      <Icon className="h-[17px] w-[17px]" />
    </button>
  )

  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-2">
      {button(tool.kind === "select", () => onToolChange({ kind: "select" }), MousePointer2, "Select — V")}
      {button(tool.kind === "hand", () => onToolChange({ kind: "hand" }), Hand, "Hand / pan — H (or hold Space)")}

      <div className="my-1 h-px w-7 bg-border" />

      {NODE_TYPES.map((t) =>
        button(
          tool.kind === "node" && tool.nodeType === t,
          () => onToolChange({ kind: "node", nodeType: t }),
          nodeIcons[t],
          `${NODE_TYPE_META[t].label} — ${NODE_TYPE_META[t].shortcut} (then click to place)`,
          NODE_TYPE_META[t].color,
        ),
      )}

      <div className="my-1 h-px w-7 bg-border" />

      {button(false, onAddLane, Rows3, "Add actor lane — L")}
      {button(tool.kind === "frame", () => onToolChange({ kind: "frame" }), Frame, "Phase frame — F (drag to draw around steps)")}
    </div>
  )
}
