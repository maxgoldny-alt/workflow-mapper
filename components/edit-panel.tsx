"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { X, Plus, Trash2 } from "lucide-react"
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

interface EditPanelProps {
  nodes: Node[]
  connections: Connection[]
  screens: Screen[]
  selectedNodeId: string | null
  onUpdateNode: (nodeId: string, updates: Partial<Node>) => void
  onDeleteNode: (nodeId: string) => void
  onAddNode: (node: Node) => void
  onUpdateConnection: (index: number, updates: Partial<Connection>) => void
  onDeleteConnection: (index: number) => void
  onAddConnection: (connection: Connection) => void
  onAddScreen: (screen: Screen) => void
  onRenameScreen: (screenId: string, title: string) => void
  onDeleteScreen: (screenId: string) => void
  onClose: () => void
}

export function EditPanel({
  nodes,
  connections,
  screens,
  selectedNodeId,
  onUpdateNode,
  onDeleteNode,
  onAddNode,
  onUpdateConnection,
  onDeleteConnection,
  onAddConnection,
  onAddScreen,
  onRenameScreen,
  onDeleteScreen,
  onClose,
}: EditPanelProps) {
  const [activeTab, setActiveTab] = useState<"node" | "connection" | "screens" | "add">("node")
  const [newNodeLabel, setNewNodeLabel] = useState("")
  const [newNodeType, setNewNodeType] = useState<NodeType>("step")
  const [newNodeScreen, setNewNodeScreen] = useState<string>(screens[0]?.id || "")
  const [newConnFrom, setNewConnFrom] = useState("")
  const [newConnTo, setNewConnTo] = useState("")
  const [newConnLabel, setNewConnLabel] = useState("")
  const [newConnType, setNewConnType] = useState<EdgeType>("sequence")
  const [newScreenTitle, setNewScreenTitle] = useState("")

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  const handleAddNode = () => {
    if (!newNodeLabel) return
    const baseId = newNodeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "node"
    let id = baseId
    let i = 2
    while (nodes.some((n) => n.id === id)) {
      id = `${baseId}_${i++}`
    }
    const screenId = newNodeScreen || screens[0]?.id || "screen_1"
    const screen = screens.find((s) => s.id === screenId)
    onAddNode({
      id,
      label: newNodeLabel,
      type: newNodeType,
      screen: screenId,
      x: (screen?.x ?? 60) + 60,
      y: (screen?.y ?? 60) + 80,
    })
    setNewNodeLabel("")
  }

  const handleAddConnection = () => {
    if (!newConnFrom || !newConnTo) return
    onAddConnection({
      from: newConnFrom,
      to: newConnTo,
      label: newConnLabel || undefined,
      type: newConnType,
    })
    setNewConnFrom("")
    setNewConnTo("")
    setNewConnLabel("")
  }

  const handleAddScreen = () => {
    if (!newScreenTitle) return
    const baseId = newScreenTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "screen"
    let id = baseId
    let i = 2
    while (screens.some((s) => s.id === id)) {
      id = `${baseId}_${i++}`
    }
    const maxX = screens.length ? Math.max(...screens.map((s) => s.x + s.width)) : 0
    onAddScreen({
      id,
      title: newScreenTitle,
      x: maxX + 60,
      y: 80,
      width: 420,
      height: 320,
    })
    setNewScreenTitle("")
  }

  const tabs = [
    { key: "node", label: "Nodes" },
    { key: "connection", label: "Edges" },
    { key: "screens", label: "Screens" },
    { key: "add", label: "Add" },
  ] as const

  return (
    <div className="fixed right-4 top-24 w-80 bg-background/95 backdrop-blur border border-border rounded-lg shadow-xl z-50 max-h-[calc(100vh-150px)] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="font-semibold text-foreground">Edit Workflow</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`flex-1 px-2 py-2 text-sm ${activeTab === tab.key ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {activeTab === "node" && (
          <>
            {selectedNode ? (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Selected: <span className="text-foreground font-medium">{selectedNode.label}</span>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={selectedNode.label}
                    onChange={(e) => onUpdateNode(selectedNode.id, { label: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Sublabel</Label>
                  <Input
                    value={selectedNode.sublabel || ""}
                    onChange={(e) => onUpdateNode(selectedNode.id, { sublabel: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={selectedNode.type}
                    onValueChange={(v) => onUpdateNode(selectedNode.id, { type: v as NodeType })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NODE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {NODE_TYPE_META[t].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Screen</Label>
                  <Select
                    value={selectedNode.screen}
                    onValueChange={(v) => onUpdateNode(selectedNode.id, { screen: v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {screens.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => onDeleteNode(selectedNode.id)}
                >
                  <Trash2 className="w-3 h-3 mr-2" />
                  Delete Node
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Click a node to select and edit it.</p>
                <div className="space-y-1 max-h-64 overflow-auto">
                  {nodes.map((node) => (
                    <div key={node.id} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                      <span className="flex items-center gap-2 truncate">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: NODE_TYPE_META[node.type]?.color }}
                        />
                        {node.label}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => onDeleteNode(node.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === "connection" && (
          <div className="space-y-2 max-h-80 overflow-auto">
            {connections.map((conn, index) => (
              <div key={`${conn.from}-${conn.to}-${index}`} className="p-2 rounded bg-muted/50 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate">
                    {nodes.find((n) => n.id === conn.from)?.label || conn.from} →{" "}
                    {nodes.find((n) => n.id === conn.to)?.label || conn.to}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={() => onDeleteConnection(index)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={conn.label || ""}
                    onChange={(e) => onUpdateConnection(index, { label: e.target.value })}
                    placeholder="Label"
                    className="h-7 text-xs flex-1"
                  />
                  <Select
                    value={conn.type}
                    onValueChange={(v) => onUpdateConnection(index, { type: v as EdgeType })}
                  >
                    <SelectTrigger className="h-7 text-xs w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EDGE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {EDGE_TYPE_META[t].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "screens" && (
          <div className="space-y-4">
            <div className="space-y-2">
              {screens.map((screen) => {
                const nodeCount = nodes.filter((n) => n.screen === screen.id).length
                return (
                  <div key={screen.id} className="p-2 rounded bg-muted/50 space-y-1">
                    <div className="flex items-center gap-2">
                      <Input
                        value={screen.title}
                        onChange={(e) => onRenameScreen(screen.id, e.target.value)}
                        className="h-7 text-sm flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => onDeleteScreen(screen.id)}
                        title={nodeCount > 0 ? "Deletes the screen; its nodes move to the first screen" : "Delete screen"}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="text-[11px] text-muted-foreground pl-1">{nodeCount} node{nodeCount === 1 ? "" : "s"}</div>
                  </div>
                )
              })}
            </div>
            <div className="space-y-2 p-3 rounded bg-muted/30 border border-border">
              <h4 className="text-sm font-medium">Add Screen</h4>
              <Input
                value={newScreenTitle}
                onChange={(e) => setNewScreenTitle(e.target.value)}
                placeholder="Screen title"
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleAddScreen()}
              />
              <Button size="sm" className="w-full" onClick={handleAddScreen} disabled={!newScreenTitle}>
                <Plus className="w-3 h-3 mr-2" />
                Add Screen
              </Button>
            </div>
          </div>
        )}

        {activeTab === "add" && (
          <div className="space-y-4">
            <div className="space-y-3 p-3 rounded bg-muted/30 border border-border">
              <h4 className="text-sm font-medium">Add Node</h4>
              <div className="space-y-2">
                <Input
                  value={newNodeLabel}
                  onChange={(e) => setNewNodeLabel(e.target.value)}
                  placeholder="Label"
                  className="h-8 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleAddNode()}
                />
                <div className="flex gap-2">
                  <Select value={newNodeType} onValueChange={(v) => setNewNodeType(v as NodeType)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NODE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {NODE_TYPE_META[t].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={newNodeScreen || screens[0]?.id || ""} onValueChange={setNewNodeScreen}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Screen" />
                    </SelectTrigger>
                    <SelectContent>
                      {screens.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" className="w-full" onClick={handleAddNode} disabled={!newNodeLabel}>
                  <Plus className="w-3 h-3 mr-2" />
                  Add Node
                </Button>
              </div>
            </div>

            <div className="space-y-3 p-3 rounded bg-muted/30 border border-border">
              <h4 className="text-sm font-medium">Add Edge</h4>
              <div className="space-y-2">
                <Select value={newConnFrom} onValueChange={setNewConnFrom}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="From node" />
                  </SelectTrigger>
                  <SelectContent>
                    {nodes.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={newConnTo} onValueChange={setNewConnTo}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="To node" />
                  </SelectTrigger>
                  <SelectContent>
                    {nodes.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={newConnLabel}
                  onChange={(e) => setNewConnLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="h-8 text-sm"
                />
                <Select value={newConnType} onValueChange={(v) => setNewConnType(v as EdgeType)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDGE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {EDGE_TYPE_META[t].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={handleAddConnection}
                  disabled={!newConnFrom || !newConnTo}
                >
                  <Plus className="w-3 h-3 mr-2" />
                  Add Edge
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
