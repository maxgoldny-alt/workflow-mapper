"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  NODE_TYPE_META,
  EDGE_TYPE_META,
  NODE_TYPES,
  EDGE_TYPES,
  type Node,
  type Connection,
  type Screen,
  type NodeType,
  type EdgeType,
} from "@/lib/diagram-templates"
import { nodeIcons } from "./toolbar"

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "edge"; index: number }
  | { kind: "screen"; id: string }
  | null

interface InspectorProps {
  selection: Selection
  nodes: Node[]
  connections: Connection[]
  screens: Screen[]
  onUpdateNode: (nodeId: string, updates: Partial<Node>) => void
  onDeleteNode: (nodeId: string) => void
  onUpdateConnection: (index: number, updates: Partial<Connection>) => void
  onDeleteConnection: (index: number) => void
  onUpdateScreen: (screenId: string, updates: Partial<Screen>) => void
  onDeleteScreen: (screenId: string) => void
}

export function Inspector({
  selection,
  nodes,
  connections,
  screens,
  onUpdateNode,
  onDeleteNode,
  onUpdateConnection,
  onDeleteConnection,
  onUpdateScreen,
  onDeleteScreen,
}: InspectorProps) {
  const node = selection?.kind === "node" ? nodes.find((n) => n.id === selection.id) : undefined
  const edge = selection?.kind === "edge" ? connections[selection.index] : undefined
  const screen = selection?.kind === "screen" ? screens.find((s) => s.id === selection.id) : undefined

  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">
          {node ? "Node" : edge ? "Edge" : screen ? "Screen" : "Properties"}
        </h2>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        {!selection && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Select something on the canvas to edit it.
            <br />
            <br />
            Double-click a node or screen title to rename it in place. Drag a dot on a node&apos;s edge to connect it to
            another node.
          </p>
        )}

        {node && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input
                value={node.label}
                onChange={(e) => onUpdateNode(node.id, { label: e.target.value })}
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Sublabel</Label>
              <Input
                value={node.sublabel || ""}
                placeholder="Optional"
                onChange={(e) => onUpdateNode(node.id, { sublabel: e.target.value || undefined })}
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <div className="grid grid-cols-5 gap-1">
                {NODE_TYPES.map((t) => {
                  const Icon = nodeIcons[t]
                  const active = node.type === t
                  return (
                    <button
                      key={t}
                      type="button"
                      title={NODE_TYPE_META[t].label}
                      onClick={() => onUpdateNode(node.id, { type: t as NodeType })}
                      className={cn(
                        "flex h-9 items-center justify-center rounded-md border transition-colors",
                        active ? "border-current" : "border-border text-muted-foreground hover:bg-muted",
                      )}
                      style={
                        active
                          ? {
                              color: NODE_TYPE_META[t].color,
                              backgroundColor: `${NODE_TYPE_META[t].color}1a`,
                              borderColor: NODE_TYPE_META[t].color,
                            }
                          : undefined
                      }
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Screen</Label>
              <p className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                {screens.find((s) => s.id === node.screen)?.title || "None — drag it onto a screen"}
              </p>
            </div>

            <Button variant="destructive" size="sm" className="w-full" onClick={() => onDeleteNode(node.id)}>
              <Trash2 className="mr-2 h-3 w-3" />
              Delete node
            </Button>
          </>
        )}

        {edge && selection?.kind === "edge" && (
          <>
            <p className="text-xs text-muted-foreground">
              {nodes.find((n) => n.id === edge.from)?.label} → {nodes.find((n) => n.id === edge.to)?.label}
            </p>

            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input
                value={edge.label || ""}
                placeholder="Optional"
                onChange={(e) => onUpdateConnection(selection.index, { label: e.target.value || undefined })}
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <div className="space-y-1">
                {EDGE_TYPES.map((t) => {
                  const active = edge.type === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onUpdateConnection(selection.index, { type: t as EdgeType })}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors",
                        active ? "border-current" : "border-border text-muted-foreground hover:bg-muted",
                      )}
                      style={active ? { borderColor: EDGE_TYPE_META[t].color } : undefined}
                    >
                      <span
                        className="h-0.5 w-5 shrink-0 rounded"
                        style={{ backgroundColor: EDGE_TYPE_META[t].color }}
                      />
                      <span className={active ? "font-medium text-foreground" : undefined}>
                        {EDGE_TYPE_META[t].label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => onDeleteConnection(selection.index)}
            >
              <Trash2 className="mr-2 h-3 w-3" />
              Delete edge
            </Button>
          </>
        )}

        {screen && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input
                value={screen.title}
                onChange={(e) => onUpdateScreen(screen.id, { title: e.target.value })}
                className="h-8 text-sm"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {nodes.filter((n) => n.screen === screen.id).length} node(s) inside. Drag the header to move the screen
              and everything in it.
            </p>

            <Button variant="destructive" size="sm" className="w-full" onClick={() => onDeleteScreen(screen.id)}>
              <Trash2 className="mr-2 h-3 w-3" />
              Delete screen
            </Button>
          </>
        )}
      </div>
    </aside>
  )
}
