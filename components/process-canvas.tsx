"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DiagramNode } from "./diagram-node"
import { ConnectionLine } from "./connection-line"
import { EdgeLabel } from "./edge-label"
import { LanePanel } from "./lane-panel"
import { Toolbar, type Tool } from "./toolbar"
import {
  EDGE_TYPE_META,
  EDGE_TYPES,
  NODE_TYPE_META,
  NODE_W,
  NODE_H,
  LANE_HEADER_W,
  defaultConnection,
  isHandoff,
  newId,
  uniqueId,
  type Doc,
  type EdgeType,
  type Lane,
  type Model,
  type Node,
  type NodeType,
  type Process,
} from "@/lib/model"
import { addLane, moveLane, removeLane, resizeLane } from "@/lib/lane-ops"
import {
  nodeAtPoint,
  laneAtY,
  laneBoxes,
  lanesHeight,
  lanesWidth,
  clampNodeToLane,
  edgePath,
  nodeCenter,
  snapNode,
  nodesInRect,
  normalizeRect,
} from "@/lib/geometry"
import { useViewport, MIN_ZOOM, MAX_ZOOM } from "@/hooks/use-viewport"
import { nodeStyle, edgeStyle, type View } from "@/lib/views"
import type { Finding } from "@/lib/findings"
import type { Selection } from "@/lib/selection"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ZoomIn, ZoomOut, Maximize2, Waves, Magnet } from "lucide-react"

type Drag =
  | { kind: "pan"; startClient: { x: number; y: number }; startPan: { x: number; y: number } }
  | { kind: "node"; ids: string[]; last: { x: number; y: number }; moved: boolean }
  | { kind: "marquee"; start: { x: number; y: number }; current: { x: number; y: number }; additive: boolean }
  | { kind: "lane"; id: string }
  | { kind: "laneResize"; id: string; lastY: number }
  | { kind: "connect"; fromId: string; cursor: { x: number; y: number } }
  | null

export interface ProcessCanvasProps {
  model: Model
  process: Process
  findings: Finding[]
  view: View
  selection: Selection
  setSelection: (s: Selection) => void
  /** Edit this process's doc. History is recorded unless `history` is false. */
  commitDoc: (fn: (d: Doc) => Doc, history?: boolean) => void
  snapshot: () => void
  undo: () => void
  redo: () => void
}

/**
 * The detailed swimlane editor for one process. Owns tools, drags, inline
 * editing and the viewport; everything else (model, history, navigation)
 * belongs to the app shell.
 */
export function ProcessCanvas({ model, process, findings, view, selection, setSelection, commitDoc, snapshot, undo, redo }: ProcessCanvasProps) {
  const doc = process.doc
  const commit = commitDoc

  const [tool, setTool] = useState<Tool>({ kind: "select" })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingEdge, setEditingEdge] = useState<string | null>(null)
  const [defaultEdgeType, setDefaultEdgeType] = useState<EdgeType>("sequence")
  const [motion, setMotion] = useState(true)
  const [snap, setSnap] = useState(true)
  const [drag, setDrag] = useState<Drag>(null)
  const [spaceDown, setSpaceDown] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const { zoom, pan, setZoom, setPan, toCanvas, zoomAt, fitTo } = useViewport(viewportRef)

  /* ---------------------------------------------------------------- geometry */

  const lanes = useMemo(() => laneBoxes(doc.lanes), [doc.lanes])
  const boardW = useMemo(() => lanesWidth(doc), [doc])
  const boardH = lanesHeight(doc.lanes)
  const processFindings = useMemo(() => findings.filter((f) => f.ref.processId === process.id), [findings, process.id])

  const zoomToFit = useCallback(() => {
    fitTo([{ x: 0, y: 0, w: LANE_HEADER_W + 40, h: boardH }, ...doc.nodes.map((n) => ({ x: n.x, y: n.y, w: NODE_W, h: NODE_H }))])
  }, [fitTo, doc.nodes, boardH])

  const fittedFor = useRef<string | null>(null)
  useEffect(() => {
    if (fittedFor.current === process.id) return
    fittedFor.current = process.id
    zoomToFit()
  }, [process.id, zoomToFit])

  /* ------------------------------------------------------------ interactions */

  const panningMode = tool.kind === "hand" || spaceDown
  const interactive = tool.kind === "select" && !panningMode

  const clearEditing = () => {
    setEditingId(null)
    setEditingEdge(null)
  }

  const selectedNodeIds = useMemo(
    () => (selection?.kind === "node" ? [selection.id] : selection?.kind === "nodes" ? selection.ids : []),
    [selection],
  )
  const selectNodes = useCallback(
    (ids: string[]) => setSelection(ids.length === 0 ? null : ids.length === 1 ? { kind: "node", id: ids[0] } : { kind: "nodes", ids }),
    [setSelection],
  )

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
        verification: "confirmed",
      }
      commit((d) => ({ ...d, nodes: [...d.nodes, clampNodeToLane(d.lanes, draft)] }))
      setSelection({ kind: "node", id })
      setEditingId(id)
      setTool({ kind: "select" })
      return
    }

    clearEditing()
    setDrag({ kind: "marquee", start: p, current: p, additive: e.shiftKey })
  }

  const onNodePointerDown = (e: React.PointerEvent, node: Node) => {
    if (!interactive) return
    e.stopPropagation()
    const p = toCanvas(e.clientX, e.clientY)
    if (e.shiftKey) {
      selectNodes(selectedNodeIds.includes(node.id) ? selectedNodeIds.filter((id) => id !== node.id) : [...selectedNodeIds, node.id])
      return
    }
    const ids = selectedNodeIds.includes(node.id) ? selectedNodeIds : [node.id]
    if (ids.length === 1) setSelection({ kind: "node", id: node.id })
    snapshot()
    setDrag({ kind: "node", ids, last: p, moved: false })
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

  useEffect(() => {
    if (!drag) return

    const onMove = (e: PointerEvent) => {
      if (drag.kind === "pan") {
        setPan({ x: drag.startPan.x + (e.clientX - drag.startClient.x), y: drag.startPan.y + (e.clientY - drag.startClient.y) })
        return
      }
      const p = toCanvas(e.clientX, e.clientY)

      if (drag.kind === "node") {
        const dx = p.x - drag.last.x
        const dy = p.y - drag.last.y
        setDrag({ ...drag, last: p, moved: true })
        commit((d) => ({ ...d, nodes: d.nodes.map((n) => (drag.ids.includes(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)) }), false)
      } else if (drag.kind === "marquee") {
        setDrag({ ...drag, current: p })
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
            const edge = defaultConnection({ id, from: drag.fromId, to: target.id, type: defaultEdgeType, label, verification: "confirmed" })
            commit((d) => ({ ...d, connections: [...d.connections, edge] }))
            setSelection({ kind: "edge", id })
          }
        }
      } else if (drag.kind === "node" && drag.moved) {
        commit((d) => ({ ...d, nodes: d.nodes.map((n) => (drag.ids.includes(n.id) ? clampNodeToLane(d.lanes, snap ? snapNode(n) : n) : n)) }), false)
      } else if (drag.kind === "marquee") {
        const rect = normalizeRect(drag.start, drag.current)
        if (rect.width < 4 && rect.height < 4) {
          const lane = laneAtY(doc.lanes, p.y)
          setSelection(lane && p.y >= 0 && p.y <= boardH ? { kind: "lane", id: lane.id } : null)
        } else {
          const hit = nodesInRect(doc.nodes, rect).map((n) => n.id)
          selectNodes(drag.additive ? Array.from(new Set([...selectedNodeIds, ...hit])) : hit)
        }
      }
      setDrag(null)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [drag, toCanvas, commit, doc, defaultEdgeType, setPan, snap, boardH, selectedNodeIds, selectNodes, setSelection])

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) zoomAt(zoom * (e.deltaY > 0 ? 0.92 : 1.08), e.clientX, e.clientY)
    else setPan((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }))
  }

  /* --------------------------------------------------------------- mutations */

  const updateNode = useCallback(
    (id: string, updates: Partial<Node>) => commit((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n)) })),
    [commit],
  )
  const updateConnectionLabel = useCallback(
    (id: string, label?: string) => commit((d) => ({ ...d, connections: d.connections.map((c) => (c.id === id ? { ...c, label } : c)) })),
    [commit],
  )
  const updateLane = useCallback(
    (id: string, updates: Partial<Lane>) => commit((d) => ({ ...d, lanes: d.lanes.map((l) => (l.id === id ? { ...l, ...updates } : l)) })),
    [commit],
  )

  const deleteSelection = useCallback(() => {
    if (!selection) return
    if (selection.kind === "node" || selection.kind === "nodes") {
      const ids = selection.kind === "node" ? [selection.id] : selection.ids
      commit((d) => ({
        ...d,
        nodes: d.nodes.filter((n) => !ids.includes(n.id)),
        connections: d.connections.filter((c) => !ids.includes(c.from) && !ids.includes(c.to)),
      }))
    } else if (selection.kind === "edge") {
      commit((d) => ({ ...d, connections: d.connections.filter((c) => c.id !== selection.id) }))
    } else if (selection.kind === "lane") {
      commit((d) => removeLane(d, selection.id))
    } else return
    setSelection(null)
  }, [selection, commit, setSelection])

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!selectedNodeIds.length) return
      commit((d) => ({ ...d, nodes: d.nodes.map((n) => (selectedNodeIds.includes(n.id) ? clampNodeToLane(d.lanes, { ...n, x: n.x + dx, y: n.y + dy }) : n)) }))
    },
    [commit, selectedNodeIds],
  )

  const selectAll = useCallback(() => selectNodes(doc.nodes.map((n) => n.id)), [selectNodes, doc.nodes])

  const createLane = useCallback(() => {
    const { doc: next, id } = addLane(doc)
    commit(() => next)
    setSelection({ kind: "lane", id })
    setEditingId(id)
  }, [doc, commit, setSelection])

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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault()
        selectAll()
        return
      }
      const arrow = ARROWS[e.key]
      if (arrow) {
        e.preventDefault()
        const step = e.shiftKey ? 1 : 8
        nudge(arrow[0] * step, arrow[1] * step)
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
  }, [selection, undo, redo, deleteSelection, createLane, nudge, selectAll, setSelection])

  /* ------------------------------------------------------------------ render */

  const connectPreview = useMemo(() => {
    if (drag?.kind !== "connect") return null
    const from = doc.nodes.find((n) => n.id === drag.fromId)
    if (!from) return null
    const target = nodeAtPoint(doc.nodes, drag.cursor)
    return { d: edgePath(nodeCenter(from), drag.cursor), targetId: target?.id }
  }, [drag, doc.nodes])

  const cursorClass = panningMode ? (drag?.kind === "pan" ? "cursor-grabbing" : "cursor-grab") : tool.kind === "node" ? "cursor-crosshair" : "cursor-default"

  const edges = doc.connections.map((conn) => ({
    conn,
    from: doc.nodes.find((n) => n.id === conn.from),
    to: doc.nodes.find((n) => n.id === conn.to),
    handoff: isHandoff(doc, conn),
    style: edgeStyle(view, doc, conn, processFindings),
  }))
  const selectedEdgeId = selection?.kind === "edge" ? selection.id : null
  const handoffCount = edges.filter((e) => e.handoff).length

  return (
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

            <svg className="pointer-events-none absolute" style={{ left: -4000, top: -4000, width: 8000, height: 8000, overflow: "visible" }}>
              <g transform="translate(4000,4000)">
                {edges.map(({ conn, from, to, handoff, style }) =>
                  from && to ? (
                    <ConnectionLine
                      key={conn.id}
                      connection={conn}
                      from={from}
                      to={to}
                      isHandoff={handoff}
                      isSelected={selectedEdgeId === conn.id}
                      isDimmed={style.dimmed}
                      emphasised={style.emphasised}
                      animate={motion}
                      onSelect={(e) => {
                        e.stopPropagation()
                        setSelection({ kind: "edge", id: conn.id })
                      }}
                    />
                  ) : null,
                )}
                {connectPreview && <path d={connectPreview.d} fill="none" stroke={EDGE_TYPE_META[defaultEdgeType].color} strokeWidth={2} strokeDasharray="5 4" />}
              </g>
            </svg>

            {edges.map(({ conn, from, to, handoff, style }) =>
              from && to ? (
                <EdgeLabel
                  key={`label-${conn.id}`}
                  connection={conn}
                  from={from}
                  to={to}
                  isHandoff={handoff}
                  isSelected={selectedEdgeId === conn.id}
                  isDimmed={style.dimmed}
                  isEditing={editingEdge === conn.id}
                  showPayload={style.showPayload}
                  badge={style.badge}
                  onSelect={() => setSelection({ kind: "edge", id: conn.id })}
                  onStartEditing={() => {
                    setSelection({ kind: "edge", id: conn.id })
                    setEditingEdge(conn.id)
                  }}
                  onCommit={(label) => {
                    updateConnectionLabel(conn.id, label || undefined)
                    setEditingEdge(null)
                  }}
                  onCancel={() => setEditingEdge(null)}
                />
              ) : null,
            )}

            {doc.nodes.map((n) => {
              const st = nodeStyle(view, n, processFindings)
              return (
                <DiagramNode
                  key={n.id}
                  node={n}
                  isSelected={selectedNodeIds.includes(n.id)}
                  isDimmed={st.dimmed}
                  badge={st.badge}
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
              )
            })}
          </div>

          {drag?.kind === "marquee" && <Marquee rect={normalizeRect(drag.start, drag.current)} zoom={zoom} pan={pan} />}

          {doc.nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="rounded-lg border border-dashed border-border bg-card/90 px-4 py-2 text-center text-sm text-muted-foreground">
                Press <Kbd>1</Kbd> then click inside a lane to add the first step, or open the AI interview and describe this process.
                <br />
                <span className="text-xs">
                  Double-click a lane header to name the actor. <Kbd>L</Kbd> adds another lane.
                </span>
              </p>
            </div>
          )}

          {/* Edge type for the next connection + zoom, tucked into the corners */}
          <div className="absolute bottom-3 left-3 z-30 flex items-center gap-1 rounded-lg border border-border bg-card/95 px-2 py-1 shadow-lg backdrop-blur">
            <span className="text-[11px] text-muted-foreground">Next edge</span>
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
                style={{ backgroundColor: `${EDGE_TYPE_META[t].color}30`, borderColor: defaultEdgeType === t ? EDGE_TYPE_META[t].color : undefined }}
              >
                <span className="block h-0.5 w-2.5 rounded" style={{ backgroundColor: EDGE_TYPE_META[t].color }} />
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            <button type="button" onClick={() => setMotion((m) => !m)} className={cn("rounded p-1", motion ? "text-foreground" : "text-muted-foreground hover:bg-muted")} title="Animate flow">
              <Waves className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setSnap((s) => !s)} className={cn("rounded p-1", snap ? "text-foreground" : "text-muted-foreground hover:bg-muted")} title="Snap to grid">
              <Magnet className="h-3.5 w-3.5" />
            </button>
            <span className="ml-1 text-[11px] text-muted-foreground">
              {doc.nodes.length} steps · {handoffCount} handoffs
            </span>
          </div>

          <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg backdrop-blur">
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
      </div>
    </div>
  )
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

function Marquee({ rect, zoom, pan }: { rect: { x: number; y: number; width: number; height: number }; zoom: number; pan: { x: number; y: number } }) {
  return (
    <div
      className="pointer-events-none absolute z-20 border border-primary bg-primary/10"
      style={{ left: rect.x * zoom + pan.x, top: rect.y * zoom + pan.y, width: rect.width * zoom, height: rect.height * zoom }}
    />
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-muted px-1 font-mono text-[11px]">{children}</kbd>
}

