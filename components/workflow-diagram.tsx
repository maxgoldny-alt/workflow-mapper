"use client"

import type React from "react"
import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { DiagramNode } from "./diagram-node"
import { ConnectionLine } from "./connection-line"
import { ScreenPanel } from "./screen-panel"
import { CodeInput } from "./code-input"
import { EditPanel } from "./edit-panel"
import { ExportDialog } from "./export-dialog"
import { parseMermaid, calculateNodePositions, calculateSubgraphBounds } from "@/lib/mermaid-parser"
import {
  diagramTemplates,
  defaultTemplate,
  getTemplateById,
  EDGE_TYPE_META,
  EDGE_TYPES,
  type Node,
  type Connection,
  type Screen,
  type EdgeType,
} from "@/lib/diagram-templates"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Pencil, ZoomIn, ZoomOut, Maximize2, Move, LayoutTemplate, Upload } from "lucide-react"

const STORAGE_KEY = "workflow-mapper-state-v1"

export default function WorkflowDiagram() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [currentTemplateId, setCurrentTemplateId] = useState<string>(defaultTemplate.id)
  const [nodes, setNodes] = useState<Node[]>(defaultTemplate.nodes)
  const [connections, setConnections] = useState<Connection[]>(defaultTemplate.connections)
  const [screens, setScreens] = useState<Screen[]>(defaultTemplate.screens)
  const [showEditPanel, setShowEditPanel] = useState(false)
  const [highlightedEdgeTypes, setHighlightedEdgeTypes] = useState<Set<string>>(new Set())
  const [highlightAll, setHighlightAll] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load autosaved state on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        if (Array.isArray(saved.nodes) && Array.isArray(saved.connections) && Array.isArray(saved.screens)) {
          setNodes(saved.nodes)
          setConnections(saved.connections)
          setScreens(saved.screens)
          if (saved.templateId) setCurrentTemplateId(saved.templateId)
        }
      }
    } catch {
      // Corrupt save — keep the default template
    }
    setLoaded(true)
  }, [])

  // Autosave (debounced) after initial load
  useEffect(() => {
    if (!loaded) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ templateId: currentTemplateId, nodes, connections, screens }),
        )
      } catch {
        // localStorage full or unavailable — autosave silently skipped
      }
    }, 400)
    return () => clearTimeout(t)
  }, [loaded, nodes, connections, screens, currentTemplateId])

  const toggleEdgeTypeHighlight = useCallback((type: string) => {
    setHighlightedEdgeTypes((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(type)) {
        newSet.delete(type)
      } else {
        newSet.add(type)
      }
      return newSet
    })
  }, [])

  const toggleHighlightAll = useCallback(() => {
    setHighlightAll((prev) => !prev)
  }, [])

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const diagramRef = useRef<HTMLDivElement>(null)

  const handleTemplateChange = useCallback((templateId: string) => {
    const template = getTemplateById(templateId)
    if (template) {
      setCurrentTemplateId(templateId)
      setNodes(template.nodes.map((n) => ({ ...n })))
      setConnections(template.connections.map((c) => ({ ...c })))
      setScreens(template.screens.map((s) => ({ ...s })))
      setSelectedNode(null)
      setPan({ x: 0, y: 0 })
      setZoom(1)
    }
  }, [])

  const handleCodeSubmit = useCallback(
    (content: string) => {
      if (!content) {
        handleTemplateChange(currentTemplateId)
        return
      }

      try {
        const parsed = parseMermaid(content)
        const positions = calculateNodePositions(parsed)
        const bounds = calculateSubgraphBounds(parsed, positions)

        const newNodes: Node[] = parsed.nodes.map((node) => {
          const pos = positions.get(node.id) || { x: 100, y: 100 }
          return {
            id: node.id,
            label: node.label,
            sublabel: node.sublabel,
            type: node.type,
            screen: node.system,
            x: pos.x,
            y: pos.y,
          }
        })

        setNodes(newNodes)
        setConnections(parsed.connections)
        setScreens(bounds)
      } catch (error) {
        console.error("Failed to parse Mermaid:", error)
      }
    },
    [currentTemplateId, handleTemplateChange],
  )

  const handleImportJSON = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        if (Array.isArray(data.nodes) && Array.isArray(data.connections)) {
          setNodes(data.nodes)
          setConnections(data.connections)
          setScreens(Array.isArray(data.screens) ? data.screens : [])
          setSelectedNode(null)
        } else {
          alert("Invalid file: expected JSON with nodes, connections, and screens.")
        }
      } catch {
        alert("Could not parse that file as JSON.")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }, [])

  const getConnectedNodes = (nodeId: string) => {
    const connected = new Set<string>()
    connections.forEach((conn) => {
      if (conn.from === nodeId) connected.add(conn.to)
      if (conn.to === nodeId) connected.add(conn.from)
    })
    return connected
  }

  const handleNodeDrag = useCallback((nodeId: string, newX: number, newY: number) => {
    setNodes((prevNodes) => prevNodes.map((node) => (node.id === nodeId ? { ...node, x: newX, y: newY } : node)))
  }, [])

  const handleUpdateNode = useCallback((nodeId: string, updates: Partial<Node>) => {
    setNodes((prevNodes) => prevNodes.map((node) => (node.id === nodeId ? { ...node, ...updates } : node)))
  }, [])

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((prevNodes) => prevNodes.filter((node) => node.id !== nodeId))
      setConnections((prevConnections) => prevConnections.filter((conn) => conn.from !== nodeId && conn.to !== nodeId))
      if (selectedNode === nodeId) {
        setSelectedNode(null)
      }
    },
    [selectedNode],
  )

  const handleAddNode = useCallback((node: Node) => {
    setNodes((prevNodes) => [...prevNodes, node])
  }, [])

  const handleUpdateConnection = useCallback((index: number, updates: Partial<Connection>) => {
    setConnections((prevConnections) =>
      prevConnections.map((conn, i) => (i === index ? { ...conn, ...updates } : conn)),
    )
  }, [])

  const handleDeleteConnection = useCallback((index: number) => {
    setConnections((prevConnections) => prevConnections.filter((_, i) => i !== index))
  }, [])

  const handleAddConnection = useCallback((connection: Connection) => {
    setConnections((prevConnections) => [...prevConnections, connection])
  }, [])

  const handleAddScreen = useCallback((screen: Screen) => {
    setScreens((prev) => [...prev, screen])
  }, [])

  const handleRenameScreen = useCallback((screenId: string, title: string) => {
    setScreens((prev) => prev.map((s) => (s.id === screenId ? { ...s, title } : s)))
  }, [])

  const handleDeleteScreen = useCallback((screenId: string) => {
    setScreens((prev) => {
      const remaining = prev.filter((s) => s.id !== screenId)
      const fallback = remaining[0]?.id
      // Re-home nodes from the deleted screen so they don't become orphans
      setNodes((prevNodes) =>
        prevNodes.map((n) => (n.screen === screenId && fallback ? { ...n, screen: fallback } : n)),
      )
      return remaining
    })
  }, [])

  const handleGroupDrag = useCallback((groupId: string, deltaX: number, deltaY: number) => {
    setNodes((prevNodes) =>
      prevNodes.map((node) => {
        if (node.screen === groupId) {
          return { ...node, x: node.x + deltaX, y: node.y + deltaY }
        }
        return node
      }),
    )

    setScreens((prevScreens) =>
      prevScreens.map((sg) => {
        if (sg.id === groupId) {
          return { ...sg, x: sg.x + deltaX, y: sg.y + deltaY }
        }
        return sg
      }),
    )
  }, [])

  const connectedNodes = hoveredNode ? getConnectedNodes(hoveredNode) : new Set<string>()

  const diagramBounds = useMemo(() => {
    if (nodes.length === 0) {
      return { minX: 0, minY: 0, maxX: 1300, maxY: 550, width: 1300, height: 550 }
    }

    const NODE_WIDTH = 120
    const NODE_HEIGHT = 70
    const PADDING = 100

    const minX = Math.min(...nodes.map((n) => n.x)) - PADDING
    const maxX = Math.max(...nodes.map((n) => n.x)) + NODE_WIDTH + PADDING
    const minY = Math.min(...nodes.map((n) => n.y)) - PADDING
    const maxY = Math.max(...nodes.map((n) => n.y)) + NODE_HEIGHT + PADDING

    return {
      minX: Math.min(0, minX),
      minY: Math.min(0, minY),
      maxX: Math.max(1300, maxX),
      maxY: Math.max(550, maxY),
      width: Math.max(1300, maxX - Math.min(0, minX)),
      height: Math.max(550, maxY - Math.min(0, minY)),
    }
  }, [nodes])

  // Screens auto-fit around their nodes; empty screens keep their stored geometry
  const dynamicScreens = useMemo(() => {
    return screens.map((sg) => {
      const screenNodes = nodes.filter((n) => n.screen === sg.id)

      if (screenNodes.length === 0) return sg

      const NODE_WIDTH = 120
      const NODE_HEIGHT = 70
      const PADDING = 30

      const minX = Math.min(...screenNodes.map((n) => n.x))
      const maxX = Math.max(...screenNodes.map((n) => n.x))
      const minY = Math.min(...screenNodes.map((n) => n.y))
      const maxY = Math.max(...screenNodes.map((n) => n.y))

      return {
        ...sg,
        x: minX - PADDING,
        y: minY - PADDING - 20,
        width: maxX - minX + NODE_WIDTH + PADDING * 2,
        height: maxY - minY + NODE_HEIGHT + PADDING * 2 + 20,
      }
    })
  }, [screens, nodes])

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.25, 3))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.25, 0.25))
  }, [])

  const handleResetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault()
        setIsPanning(true)
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
      }
    },
    [pan],
  )

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const touch = e.touches[0]
        setIsPanning(true)
        setPanStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y })
      }
    },
    [pan],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y })
      }
    },
    [isPanning, panStart],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (isPanning && e.touches.length >= 1) {
        const touch = e.touches[0]
        setPan({ x: touch.clientX - panStart.x, y: touch.clientY - panStart.y })
      }
    },
    [isPanning, panStart],
  )

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const handleTouchEnd = useCallback(() => {
    setIsPanning(false)
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setZoom((prev) => Math.max(0.25, Math.min(3, prev + delta)))
    }
  }, [])

  return (
    <div
      className="relative w-full min-h-screen overflow-hidden touch-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background Grid */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          width: `${diagramBounds.width * zoom + 500}px`,
          height: `${(diagramBounds.height + 150) * zoom + 500}px`,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        <svg className="w-full h-full">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-primary"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Header */}
      <header className="relative z-20 p-6 border-b border-border/50 sticky top-0 bg-background/90 backdrop-blur">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-accent animate-pulse" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Workflow Mapper</h1>
          </div>

          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4 text-muted-foreground" />
            <Select value={currentTemplateId} onValueChange={handleTemplateChange}>
              <SelectTrigger className="w-[180px] h-8 text-sm">
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent className="z-50">
                {diagramTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex flex-col">
                      <span>{template.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <CodeInput onCodeSubmit={handleCodeSubmit} />

          <Button
            variant={showEditPanel ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setShowEditPanel(!showEditPanel)}
          >
            <Pencil className="w-4 h-4" />
            Edit
          </Button>

          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4" />
            Import
          </Button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportJSON} />

          <ExportDialog nodes={nodes} connections={connections} screens={dynamicScreens} diagramRef={diagramRef} />

          <div className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border/50 bg-background/50">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn}>
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleResetView} title="Reset View">
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex gap-2 ml-auto text-sm text-muted-foreground items-center">
            <button
              type="button"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                highlightAll
                  ? "bg-primary/20 border-primary ring-1 ring-primary"
                  : "border-border/50 bg-background/50 hover:bg-muted/50"
              }`}
              onClick={toggleHighlightAll}
            >
              <span className={highlightAll ? "text-foreground font-medium" : ""}>All</span>
            </button>
            <div className="w-px h-6 bg-border/50" />
            {EDGE_TYPES.map((type) => {
              const meta = EDGE_TYPE_META[type]
              return (
                <button
                  key={type}
                  type="button"
                  className={`flex items-center gap-2 px-2 py-1 rounded transition-all cursor-pointer ${
                    highlightedEdgeTypes.has(type)
                      ? "bg-primary/20 ring-1 ring-primary"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => toggleEdgeTypeHighlight(type)}
                >
                  <div className={`w-3 h-0.5 ${meta.dash ? "opacity-50" : ""}`} style={{ background: meta.color }} />
                  <span className={highlightedEdgeTypes.has(type) ? "text-foreground" : ""}>{meta.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </header>

      {/* Edit Panel */}
      {showEditPanel && (
        <EditPanel
          nodes={nodes}
          connections={connections}
          screens={screens}
          selectedNodeId={selectedNode}
          onUpdateNode={handleUpdateNode}
          onDeleteNode={handleDeleteNode}
          onAddNode={handleAddNode}
          onUpdateConnection={handleUpdateConnection}
          onDeleteConnection={handleDeleteConnection}
          onAddConnection={handleAddConnection}
          onAddScreen={handleAddScreen}
          onRenameScreen={handleRenameScreen}
          onDeleteScreen={handleDeleteScreen}
          onClose={() => setShowEditPanel(false)}
        />
      )}

      {/* Main Diagram Area - with zoom and pan */}
      <div
        ref={diagramRef}
        className={`relative p-8 ${isPanning ? "cursor-grabbing" : "cursor-default"}`}
        style={{
          minWidth: `${diagramBounds.width}px`,
          minHeight: `${diagramBounds.height}px`,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onWheel={handleWheel}
      >
        {dynamicScreens.map((sg) => (
          <ScreenPanel
            key={sg.id}
            id={sg.id}
            title={sg.title}
            x={sg.x}
            y={sg.y}
            width={sg.width}
            height={sg.height}
            onDrag={handleGroupDrag}
          />
        ))}

        {/* SVG for Connections */}
        <svg
          className="absolute pointer-events-none"
          style={{
            left: 0,
            top: 0,
            width: `${diagramBounds.width}px`,
            height: `${diagramBounds.height}px`,
            overflow: "visible",
          }}
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {EDGE_TYPES.map((type) => (
              <marker
                key={type}
                id={`arrow-${type}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE_TYPE_META[type].color} />
              </marker>
            ))}
          </defs>
          {connections.map((conn, index) => {
            const fromNode = nodes.find((n) => n.id === conn.from)
            const toNode = nodes.find((n) => n.id === conn.to)
            if (!fromNode || !toNode) return null

            const isHighlighted =
              highlightAll ||
              highlightedEdgeTypes.has(conn.type) ||
              hoveredNode === conn.from ||
              hoveredNode === conn.to ||
              (selectedNode && (selectedNode === conn.from || selectedNode === conn.to))

            return (
              <ConnectionLine
                key={`${conn.from}-${conn.to}-${index}`}
                fromX={fromNode.x + 60}
                fromY={fromNode.y + 50}
                toX={toNode.x + 60}
                toY={toNode.y + 50}
                label={conn.label}
                type={conn.type as EdgeType}
                lineStyle={conn.lineStyle}
                isHighlighted={!!isHighlighted}
              />
            )
          })}
        </svg>

        {/* Nodes */}
        {nodes.map((node) => (
          <DiagramNode
            key={node.id}
            {...node}
            isSelected={selectedNode === node.id}
            isConnected={highlightAll || connectedNodes.has(node.id)}
            isHovered={hoveredNode === node.id}
            onSelect={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
            onHover={(hovered) => setHoveredNode(hovered ? node.id : null)}
            onDrag={handleNodeDrag}
          />
        ))}
      </div>

      {/* Status Bar */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 border-t border-border/50 bg-background/80 backdrop-blur z-20">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4 text-muted-foreground">
            <span>Nodes: {nodes.length}</span>
            <span>Edges: {connections.length}</span>
            <span>Screens: {screens.length}</span>
            <span>Zoom: {Math.round(zoom * 100)}%</span>
            <span className="text-primary/70 flex items-center gap-1">
              <Move className="w-3 h-3" />
              Alt+Drag or Middle-click to pan | Ctrl+Scroll to zoom
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-accent">Auto-saved</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
