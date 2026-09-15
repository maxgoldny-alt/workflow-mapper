"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { DiagramNode } from "./diagram-node"
import { ConnectionLine } from "./connection-line"
import { EdgeLabel } from "./edge-label"
import { LanePanel } from "./lane-panel"
import { HandoffTable } from "./handoff-table"
import { Toolbar, type Tool } from "./toolbar"
import { Inspector, type Selection } from "./inspector"
import { ExportDialog } from "./export-dialog"
import { Welcome } from "./welcome"
import {
  EDGE_TYPE_META,
  EDGE_TYPES,
  MECHANISM_META,
  MECHANISMS,
  NODE_TYPE_META,
  NODE_W,
  NODE_H,
  LANE_HEADER_W,
  blankDoc,
  isHandoff,
  newId,
  uniqueId,
  type Connection,
  type Doc,
  type EdgeType,
  type Lane,
  type Mechanism,
  type Node,
  type NodeType,
  type WorkflowFile,
} from "@/lib/model"
import { templates, getTemplateById, docFromTemplate } from "@/lib/templates"
import { loadState, saveState, coerceDoc } from "@/lib/storage"
import { addLane, moveLane, removeLane, resizeLane } from "@/lib/lane-ops"
import { nodeAtPoint, laneAtY, laneBoxes, lanesHeight, lanesWidth, clampNodeToLane, edgePath, nodeCenter } from "@/lib/geometry"
import { useHistory } from "@/hooks/use-history"
import { useViewport, MIN_ZOOM, MAX_ZOOM } from "@/hooks/use-viewport"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { ZoomIn, ZoomOut, Maximize2, Upload, Undo2, Redo2, Sun, Moon, Plus, Waves, HelpCircle } from "lucide-react"

type Drag =
  | { kind: "pan"; startClient: { x: number; y: number }; startPan: { x: number; y: number } }
  | { kind: "node"; id: string; offset: { x: number; y: number }; moved: boolean }
  | { kind: "lane"; id: string }
  | { kind: "laneResize"; id: string; lastY: number }
  | { kind: "connect"; fromId: string; cursor: { x: number; y: number } }
  | null

export default function WorkflowCanvas() {
  const [workflows, setWorkflows] = useState<WorkflowFile[]>(() => [
    { id: "wf_default", name: "Operational Core", doc: docFromTemplate() },
  ])
  const [activeId, setActiveId] = useState("wf_default")
  const [loaded, setLoaded] = useState(false)

  const [tool, setTool] = useState<Tool>({ kind: "select" })
  const [selection, setSelection] = useState<Selection>(null)
  const [editingId, setEditingId] = useState<string | null>(null) // node or lane being renamed inline
  const [editingEdge, setEditingEdge] = useState<string | null>(null)
  const [defaultEdgeType, setDefaultEdgeType] = useState<EdgeType>("sequence")
  const [highlightType, setHighlightType] = useState<EdgeType | null>(null)
  const [highlightMech, setHighlightMech] = useState<Mechanism | null>(null)
  const [motion, setMotion] = useState(true)
  const [tableOpen, setTableOpen] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [drag, setDrag] = useState<Drag>(null)
  const [spaceDown, setSpaceDown] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { resolvedTheme, setTheme } = useTheme()
  // Theme is unknown during SSR; only render the toggle once hydrated
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false)

  const active = workflows.find((w) => w.id === activeId) ?? workflows[0]
  const doc = active.doc

  const setDoc = useCallback(
    (fn: (d: Doc) => Doc) => setWorkflows((ws) => ws.map((w) => (w.id === activeId ? { ...w, doc: fn(w.doc) } : w))),
    [activeId],
  )
  const history = useHistory(doc, setDoc)
  const { commit, snapshot, undo, redo } = history
  const { zoom, pan, setZoom, setPan, toCanvas, zoomAt, fitTo } = useViewport(viewportRef)

  /* ------------------------------------------------------------ persistence */

  useEffect(() => {
    // Hydrate from localStorage after mount; reading it during render would mismatch the server HTML
    const s = loadState()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkflows(s.workflows)
    setActiveId(s.activeId)
    setShowWelcome(!!s.fresh)
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    const t = setTimeout(() => saveState({ activeId, workflows }), 400)
    return () => clearTimeout(t)
  }, [loaded, workflows, activeId])

  /* ---------------------------------------------------------------- geometry */

  const lanes = useMemo(() => laneBoxes(doc.lanes), [doc.lanes])
  const boardW = useMemo(() => lanesWidth(doc), [doc])
  const boardH = lanesHeight(doc.lanes)

  const zoomToFit = useCallback(() => {
    fitTo([
      { x: 0, y: 0, w: LANE_HEADER_W + 40, h: boardH },
      ...doc.nodes.map((n) => ({ x: n.x, y: n.y, w: NODE_W, h: NODE_H })),
    ])
  }, [fitTo, doc.nodes, boardH])

  const didFit = useRef(false)
  useEffect(() => {
    if (!loaded || didFit.current) return
    didFit.current = true
    zoomToFit()
  }, [loaded, zoomToFit])

  /* ------------------------------------------------------------ interactions */

  const panningMode = tool.kind === "hand" || spaceDown
  const interactive = tool.kind === "select" && !panningMode

  const clearEditing = () => {
    setEditingId(null)
    setEditingEdge(null)
  }

  const onViewportPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || panningMode) {
      e.preventDefault()
      setDrag({ kind: "pan", startClient: { x: e.clientX, y: e.clientY }, startPan: { ...pan } })
      return
    }
    if (e.button !== 0) return
    const p = toCanvas(e.clientX, e.clientY)

    if (tool.kind === "node") {
      const id = uniqueId(tool.nodeType, doc.nodes)
      const draft: Node = {
        id,
        label: NODE_TYPE_META[tool.nodeType].label,
        type: tool.nodeType,
        x: p.x - NODE_W / 2,
        y: p.y - NODE_H / 2,
        lane: "",
      }
      commit((d) => ({ ...d, nodes: [...d.nodes, clampNodeToLane(d.lanes, draft)] }))
      setSelection({ kind: "node", id })
      setEditingId(id) // place, then type the name straight away
      setTool({ kind: "select" })
      return
    }

    // Empty board click: select the lane under the cursor (or nothing)
    const lane = laneAtY(doc.lanes, p.y)
    setSelection(lane && p.y >= 0 && p.y <= boardH ? { kind: "lane", id: lane.id } : null)
    clearEditing()
  }

  const onNodePointerDown = (e: React.PointerEvent, node: Node) => {
    if (!interactive) return
    e.stopPropagation()
    const p = toCanvas(e.clientX, e.clientY)
    setSelection({ kind: "node", id: node.id })
    snapshot()
    setDrag({ kind: "node", id: node.id, offset: { x: p.x - node.x, y: p.y - node.y }, moved: false })
  }

  const onStartConnect = (e: React.PointerEvent, node: Node) => {
    if (panningMode) return
    setDrag({ kind: "connect", fromId: node.id, cursor: toCanvas(e.clientX, e.clientY) })
  }

  const onLaneHeaderPointerDown = (e: React.PointerEvent, lane: Lane) => {
    setSelection({ kind: "lane", id: lane.id })
    snapshot()
    setDrag({ kind: "lane", id: lane.id })
  }

  const onLaneResizePointerDown = (e: React.PointerEvent, lane: Lane) => {
    setSelection({ kind: "lane", id: lane.id })
    snapshot()
    setDrag({ kind: "laneResize", id: lane.id, lastY: toCanvas(e.clientX, e.clientY).y })
  }

  // Global drag handling
  useEffect(() => {
    if (!drag) return

    const onMove = (e: PointerEvent) => {
      if (drag.kind === "pan") {
        setPan({
          x: drag.startPan.x + (e.clientX - drag.startClient.x),
          y: drag.startPan.y + (e.clientY - drag.startClient.y),
        })
        return
      }
      const p = toCanvas(e.clientX, e.clientY)

      if (drag.kind === "node") {
        if (!drag.moved) setDrag({ ...drag, moved: true })
        commit(
          (d) => ({
            ...d,
            nodes: d.nodes.map((n) => (n.id === drag.id ? { ...n, x: p.x - drag.offset.x, y: p.y - drag.offset.y } : n)),
          }),
          false,
        )
      } else if (drag.kind === "lane") {
        const target = laneAtY(doc.lanes, p.y)
        if (target && target.id !== drag.id) {
          const toIndex = doc.lanes.findIndex((l) => l.id === target.id)
          commit((d) => moveLane(d, drag.id, toIndex), false)
        }
      } else if (drag.kind === "laneResize") {
        const { doc: next, applied } = resizeLane(doc, drag.id, p.y - drag.lastY)
        if (applied) {
          commit(() => next, false)
          setDrag({ ...drag, lastY: drag.lastY + applied })
        }
      } else if (drag.kind === "connect") {
        setDrag({ ...drag, cursor: p })
      }
    }

    const onUp = (e: PointerEvent) => {
      const p = toCanvas(e.clientX, e.clientY)

      if (drag.kind === "connect") {
        const target = nodeAtPoint(doc.nodes, p)
        if (target && target.id !== drag.fromId) {
          const exists = doc.connections.some((c) => c.from === drag.fromId && c.to === target.id)
          if (!exists) {
            const id = newId("e")
            const label = defaultEdgeType === "sequence" ? undefined : EDGE_TYPE_META[defaultEdgeType].label
            const edge: Connection = { id, from: drag.fromId, to: target.id, type: defaultEdgeType, mechanism: "unknown", label }
            commit((d) => ({ ...d, connections: [...d.connections, edge] }))
            setSelection({ kind: "edge", id })
          }
        }
      } else if (drag.kind === "node" && drag.moved) {
        // Snap into whichever lane now holds the node's center
        commit((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === drag.id ? clampNodeToLane(d.lanes, n) : n)) }), false)
      }
      setDrag(null)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [drag, toCanvas, commit, doc, defaultEdgeType, setPan])

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) zoomAt(zoom * (e.deltaY > 0 ? 0.92 : 1.08), e.clientX, e.clientY)
    else setPan((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }))
  }

  /* --------------------------------------------------------------- mutations */

  const updateNode = useCallback(
    (id: string, updates: Partial<Node>) =>
      commit((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n)) })),
    [commit],
  )
  const updateConnection = useCallback(
    (id: string, updates: Partial<Connection>) =>
      commit((d) => ({ ...d, connections: d.connections.map((c) => (c.id === id ? { ...c, ...updates } : c)) })),
    [commit],
  )
  const updateLane = useCallback(
    (id: string, updates: Partial<Lane>) =>
      commit((d) => ({ ...d, lanes: d.lanes.map((l) => (l.id === id ? { ...l, ...updates } : l)) })),
    [commit],
  )

  const deleteNode = useCallback(
    (id: string) => {
      commit((d) => ({
        ...d,
        nodes: d.nodes.filter((n) => n.id !== id),
        connections: d.connections.filter((c) => c.from !== id && c.to !== id),
      }))
      setSelection(null)
    },
    [commit],
  )
  const deleteConnection = useCallback(
    (id: string) => {
      commit((d) => ({ ...d, connections: d.connections.filter((c) => c.id !== id) }))
      setSelection(null)
    },
    [commit],
  )
  const deleteLane = useCallback(
    (id: string) => {
      commit((d) => removeLane(d, id))
      setSelection(null)
    },
    [commit],
  )

  const deleteSelection = useCallback(() => {
    if (!selection) return
    if (selection.kind === "node") deleteNode(selection.id)
    else if (selection.kind === "edge") deleteConnection(selection.id)
    else deleteLane(selection.id)
  }, [selection, deleteNode, deleteConnection, deleteLane])

  const createLane = useCallback(() => {
    let id = ""
    commit((d) => {
      const r = addLane(d)
      id = r.id
      return r.doc
    })
    // commit runs synchronously through setState's updater on the next render, so read the id after
    setTimeout(() => {
      if (id) {
        setSelection({ kind: "lane", id })
        setEditingId(id)
      }
    }, 0)
  }, [commit])

  const shiftLane = (id: string, direction: -1 | 1) => {
    const idx = doc.lanes.findIndex((l) => l.id === id)
    commit((d) => moveLane(d, id, idx + direction))
  }

  /* ---------------------------------------------------------------- keyboard */

  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        e.preventDefault()
        setSpaceDown(true)
        return
      }
      if (isTyping(e.target)) return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (e.key === "Escape") {
        setDrag(null)
        clearEditing()
        setSelection(null)
        setTool({ kind: "select" })
        return
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selection) return
        e.preventDefault()
        deleteSelection()
        return
      }
      const k = e.key.toLowerCase()
      if (k === "v") setTool({ kind: "select" })
      else if (k === "h") setTool({ kind: "hand" })
      else if (k === "l") createLane()
      else {
        const entry = (Object.entries(NODE_TYPE_META) as [NodeType, { shortcut: string }][]).find(([, m]) => m.shortcut === e.key)
        if (entry) setTool({ kind: "node", nodeType: entry[0] })
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false)
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [selection, undo, redo, deleteSelection, createLane])

  /* ---------------------------------------------------------- workflow files */

  const openWorkflow = (id: string) => {
    setActiveId(id)
    setSelection(null)
    history.reset()
    setTimeout(zoomToFit, 0)
  }

  const createWorkflow = (templateId?: string) => {
    const id = newId("wf")
    const template = templateId ? getTemplateById(templateId) : undefined
    setWorkflows((ws) => [
      ...ws,
      {
        id,
        name: template && template.id !== "empty" ? template.name : `My workflow ${ws.length + 1}`,
        doc: template ? docFromTemplate(template) : blankDoc(),
      },
    ])
    openWorkflow(id)
  }

  const renameWorkflow = (name: string) => setWorkflows((ws) => ws.map((w) => (w.id === activeId ? { ...w, name } : w)))

  const deleteWorkflow = () => {
    const rest = workflows.filter((w) => w.id !== activeId)
    const next = rest.length ? rest : [{ id: newId("wf"), name: "Untitled 1", doc: blankDoc() }]
    setWorkflows(next)
    openWorkflow(next[0].id)
  }

  const loadTemplate = (templateId: string) => {
    const t = getTemplateById(templateId)
    if (!t) return
    commit(() => docFromTemplate(t))
    setSelection(null)
    setTimeout(zoomToFit, 0)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        const imported = coerceDoc(data)
        if (!imported) {
          alert("Invalid file: expected a workflow JSON with lanes, nodes, and connections.")
          return
        }
        const id = newId("wf")
        const name = (typeof data.name === "string" && data.name) || file.name.replace(/\.json$/i, "") || "Imported"
        setWorkflows((ws) => [...ws, { id, name, doc: imported }])
        openWorkflow(id)
      } catch {
        alert("Could not parse that file as JSON.")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  /* ------------------------------------------------------------------ render */

  const connectPreview = useMemo(() => {
    if (drag?.kind !== "connect") return null
    const from = doc.nodes.find((n) => n.id === drag.fromId)
    if (!from) return null
    const target = nodeAtPoint(doc.nodes, drag.cursor)
    return { d: edgePath(nodeCenter(from), drag.cursor), targetId: target?.id }
  }, [drag, doc.nodes])

  const cursorClass = panningMode
    ? drag?.kind === "pan"
      ? "cursor-grabbing"
      : "cursor-grab"
    : tool.kind === "node"
      ? "cursor-crosshair"
      : "cursor-default"

  const edges = doc.connections.map((conn) => ({
    conn,
    from: doc.nodes.find((n) => n.id === conn.from),
    to: doc.nodes.find((n) => n.id === conn.to),
    handoff: isHandoff(doc, conn),
    dimmed: (highlightType !== null && conn.type !== highlightType) || (highlightMech !== null && conn.mechanism !== highlightMech),
  }))

  const selectedEdgeId = selection?.kind === "edge" ? selection.id : null
  const handoffCount = edges.filter((e) => e.handoff).length

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2">
        <h1 className="text-sm font-semibold">Workflow Mapper</h1>

        <div className="flex items-center gap-1.5">
          <Select value={activeId} onValueChange={(id) => (id === "__new__" ? createWorkflow() : openWorkflow(id))}>
            <SelectTrigger className="h-8 w-[190px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workflows.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
              <SelectItem value="__new__">＋ New workflow</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => createWorkflow()} title="New workflow">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1">
          <span className="text-xs text-muted-foreground">New edge</span>
          {EDGE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              title={EDGE_TYPE_META[t].label}
              onClick={() => setDefaultEdgeType(t)}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-transform",
                defaultEdgeType === t ? "scale-110" : "border-transparent opacity-50 hover:opacity-100",
              )}
              style={{
                backgroundColor: `${EDGE_TYPE_META[t].color}30`,
                borderColor: defaultEdgeType === t ? EDGE_TYPE_META[t].color : undefined,
              }}
            >
              <span className="block h-0.5 w-2.5 rounded" style={{ backgroundColor: EDGE_TYPE_META[t].color }} />
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={!history.canUndo} title="Undo — Ctrl+Z">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={!history.canRedo} title="Redo — Ctrl+Shift+Z">
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" />
            Import
          </Button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
          <ExportDialog doc={doc} workflowName={active.name} />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowWelcome(true)} title="How this works">
            <HelpCircle className="h-4 w-4" />
          </Button>
          {mounted && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} title="Toggle theme">
              {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Toolbar tool={tool} onToolChange={setTool} onAddLane={createLane} />

        <div className="flex min-w-0 flex-1 flex-col">
          <div
            ref={viewportRef}
            className={cn("relative min-h-0 flex-1 overflow-hidden bg-canvas", cursorClass)}
            style={{
              backgroundImage: "radial-gradient(circle, var(--canvas-grid) 1px, transparent 1px)",
              backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }}
            onPointerDown={onViewportPointerDown}
            onWheel={onWheel}
          >
            <div className="absolute left-0 top-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
              {lanes.map((l, i) => (
                <LanePanel
                  key={l.id}
                  lane={l}
                  index={i}
                  width={boardW}
                  isSelected={selection?.kind === "lane" && selection.id === l.id}
                  isEditing={editingId === l.id}
                  interactive={interactive}
                  nodeCount={doc.nodes.filter((n) => n.lane === l.id).length}
                  onPointerDownHeader={onLaneHeaderPointerDown}
                  onPointerDownResize={onLaneResizePointerDown}
                  onStartEditing={setEditingId}
                  onCommitActor={(id, actor) => {
                    updateLane(id, { actor })
                    setEditingId(null)
                  }}
                  onCancelEditing={() => setEditingId(null)}
                />
              ))}

              {/* Edge lines — beneath the nodes so they tuck under the node body */}
              <svg className="pointer-events-none absolute" style={{ left: -4000, top: -4000, width: 8000, height: 8000, overflow: "visible" }}>
                <g transform="translate(4000,4000)">
                  {edges.map(({ conn, from, to, handoff, dimmed }) =>
                    from && to ? (
                      <ConnectionLine
                        key={conn.id}
                        connection={conn}
                        from={from}
                        to={to}
                        isHandoff={handoff}
                        isSelected={selectedEdgeId === conn.id}
                        isDimmed={dimmed}
                        animate={motion}
                        onSelect={(e) => {
                          e.stopPropagation()
                          setSelection({ kind: "edge", id: conn.id })
                        }}
                      />
                    ) : null,
                  )}
                  {connectPreview && (
                    <path d={connectPreview.d} fill="none" stroke={EDGE_TYPE_META[defaultEdgeType].color} strokeWidth={2} strokeDasharray="5 4" />
                  )}
                </g>
              </svg>

              {edges.map(({ conn, from, to, handoff, dimmed }) =>
                from && to ? (
                  <EdgeLabel
                    key={`label-${conn.id}`}
                    connection={conn}
                    from={from}
                    to={to}
                    isHandoff={handoff}
                    isSelected={selectedEdgeId === conn.id}
                    isDimmed={dimmed}
                    isEditing={editingEdge === conn.id}
                    onSelect={() => setSelection({ kind: "edge", id: conn.id })}
                    onStartEditing={() => {
                      setSelection({ kind: "edge", id: conn.id })
                      setEditingEdge(conn.id)
                    }}
                    onCommit={(label) => {
                      updateConnection(conn.id, { label: label || undefined })
                      setEditingEdge(null)
                    }}
                    onCancel={() => setEditingEdge(null)}
                  />
                ) : null,
              )}

              {doc.nodes.map((n) => (
                <DiagramNode
                  key={n.id}
                  node={n}
                  isSelected={selection?.kind === "node" && selection.id === n.id}
                  isDimmed={false}
                  isConnectTarget={drag?.kind === "connect" && connectPreview?.targetId === n.id}
                  isEditing={editingId === n.id}
                  interactive={interactive}
                  onPointerDown={onNodePointerDown}
                  onStartConnect={onStartConnect}
                  onStartEditing={setEditingId}
                  onCommitLabel={(id, label) => {
                    updateNode(id, { label })
                    setEditingId(null)
                  }}
                  onCancelEditing={() => setEditingId(null)}
                />
              ))}
            </div>

            {loaded && doc.nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <p className="rounded-lg border border-dashed border-border bg-card/90 px-4 py-2 text-center text-sm text-muted-foreground">
                  Press <kbd className="rounded border border-border bg-muted px-1 font-mono text-[11px]">1</kbd> then click inside a lane to add the first step.
                  <br />
                  <span className="text-xs">Double-click a lane header to name the actor. <kbd className="rounded border border-border bg-muted px-1 font-mono text-[11px]">L</kbd> adds another lane.</span>
                </p>
              </div>
            )}

            {showWelcome && (
              <Welcome
                onClose={() => setShowWelcome(false)}
                onStartSample={() => {
                  setShowWelcome(false)
                  if (doc.nodes.length === 0) loadTemplate("operational-core")
                }}
                onStartBlank={() => {
                  setShowWelcome(false)
                  createWorkflow("empty")
                }}
              />
            )}

            <div className="absolute bottom-4 right-4 z-30 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg backdrop-blur">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <button type="button" onClick={zoomToFit} className="min-w-[46px] text-center text-xs text-muted-foreground hover:text-foreground" title="Zoom to fit">
                {Math.round(zoom * 100)}%
              </button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomToFit} title="Zoom to fit">
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <HandoffTable
            doc={doc}
            open={tableOpen}
            selectedEdgeId={selectedEdgeId}
            onToggle={() => setTableOpen((o) => !o)}
            onSelectEdge={(id) => setSelection({ kind: "edge", id })}
          />
        </div>

        <Inspector
          selection={selection}
          doc={doc}
          workflowName={active.name}
          templates={templates}
          onRenameWorkflow={renameWorkflow}
          onDeleteWorkflow={deleteWorkflow}
          onLoadTemplate={loadTemplate}
          onAddLane={createLane}
          onUpdateNode={updateNode}
          onDeleteNode={deleteNode}
          onUpdateConnection={updateConnection}
          onDeleteConnection={deleteConnection}
          onUpdateLane={updateLane}
          onDeleteLane={deleteLane}
          onMoveLane={shiftLane}
        />
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-card px-4 py-1.5 text-xs text-muted-foreground">
        <span>{doc.lanes.length} actors</span>
        <span>{doc.nodes.length} nodes</span>
        <span>{doc.connections.length} edges</span>
        <span>{handoffCount} handoffs</span>

        <button
          type="button"
          onClick={() => setMotion((m) => !m)}
          className={cn("flex items-center gap-1 rounded px-1.5 py-0.5", motion ? "text-foreground" : "hover:bg-muted")}
          title="Animate flow along the edges"
        >
          <Waves className="h-3 w-3" />
          Motion {motion ? "on" : "off"}
        </button>

        <div className="flex items-center gap-1">
          <span>Type</span>
          {EDGE_TYPES.map((t) => (
            <FilterChip key={t} active={highlightType === t} color={EDGE_TYPE_META[t].color} label={EDGE_TYPE_META[t].label} onClick={() => setHighlightType((c) => (c === t ? null : t))} />
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span>How</span>
          {MECHANISMS.map((m) => (
            <FilterChip key={m} active={highlightMech === m} color={MECHANISM_META[m].color} label={MECHANISM_META[m].label} onClick={() => setHighlightMech((c) => (c === m ? null : m))} />
          ))}
        </div>

        <span className="ml-auto">1–5 place a node · L adds a lane · Space to pan · Ctrl+scroll to zoom</span>
      </footer>
    </div>
  )
}

const subscribeNoop = () => () => {}

function FilterChip({ active, color, label, onClick }: { active: boolean; color: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded px-1.5 py-0.5 transition-colors", active ? "text-foreground" : "hover:bg-muted")}
      style={active ? { backgroundColor: `${color}25` } : undefined}
    >
      {label}
    </button>
  )
}
