"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { DiagramNode } from "./diagram-node"
import { ConnectionLine } from "./connection-line"
import { EdgeLabel } from "./edge-label"
import { ScreenPanel } from "./screen-panel"
import { Toolbar, type Tool } from "./toolbar"
import { Inspector, type Selection } from "./inspector"
import { ExportDialog } from "./export-dialog"
import {
  diagramTemplates,
  defaultTemplate,
  getTemplateById,
  EDGE_TYPE_META,
  EDGE_TYPES,
  NODE_TYPE_META,
  NODE_W,
  NODE_H,
  type Node,
  type Connection,
  type Screen,
  type EdgeType,
  type NodeType,
} from "@/lib/diagram-templates"
import { nodeAtPoint, screenContaining, normalizeRect, edgePath, nodeCenter } from "@/lib/geometry"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { ZoomIn, ZoomOut, Maximize2, Upload, Undo2, Redo2, Sun, Moon, Plus, Waves } from "lucide-react"

const STORAGE_KEY = "workflow-mapper-v3"
const LEGACY_KEY = "workflow-mapper-state-v2"
const MIN_ZOOM = 0.2
const MAX_ZOOM = 2.5

export interface Doc {
  nodes: Node[]
  connections: Connection[]
  screens: Screen[]
}

interface WorkflowFile {
  id: string
  name: string
  doc: Doc
}

type Drag =
  | { kind: "pan"; startClient: { x: number; y: number }; startPan: { x: number; y: number } }
  | { kind: "node"; id: string; offset: { x: number; y: number }; moved: boolean }
  | { kind: "screen"; id: string; last: { x: number; y: number } }
  | { kind: "resize"; id: string; start: { x: number; y: number }; startSize: { w: number; h: number } }
  | { kind: "connect"; fromId: string; cursor: { x: number; y: number } }
  | { kind: "drawScreen"; start: { x: number; y: number }; current: { x: number; y: number } }
  | null

const docFromTemplate = (t = defaultTemplate): Doc => ({
  nodes: t.nodes.map((n) => ({ ...n })),
  connections: t.connections.map((c) => ({ ...c })),
  screens: t.screens.map((s) => ({ ...s })),
})

const blankDoc = (): Doc => ({
  nodes: [],
  connections: [],
  screens: [{ id: "screen_1", title: "Screen 1", x: 120, y: 120, width: 460, height: 320 }],
})

const newId = () => `wf_${Math.random().toString(36).slice(2, 9)}`

export default function WorkflowCanvas() {
  const [workflows, setWorkflows] = useState<WorkflowFile[]>(() => [
    { id: "wf_default", name: "Operational Core", doc: docFromTemplate() },
  ])
  const [activeId, setActiveId] = useState("wf_default")

  const [past, setPast] = useState<Doc[]>([])
  const [future, setFuture] = useState<Doc[]>([])

  const [tool, setTool] = useState<Tool>({ kind: "select" })
  const [selection, setSelection] = useState<Selection>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingEdge, setEditingEdge] = useState<number | null>(null)
  const [defaultEdgeType, setDefaultEdgeType] = useState<EdgeType>("sequence")
  const [highlightType, setHighlightType] = useState<EdgeType | null>(null)
  const [motion, setMotion] = useState(true)

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState<Drag>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const active = workflows.find((w) => w.id === activeId) ?? workflows[0]
  const doc = active.doc

  /* ---------------------------------------------------------------- state */

  const setDoc = useCallback(
    (fn: (d: Doc) => Doc) => {
      setWorkflows((ws) => ws.map((w) => (w.id === activeId ? { ...w, doc: fn(w.doc) } : w)))
    },
    [activeId],
  )

  const commit = useCallback(
    (fn: (d: Doc) => Doc, history = true) => {
      if (history) {
        setPast((p) => [...p.slice(-49), doc])
        setFuture([])
      }
      setDoc(fn)
    },
    [doc, setDoc],
  )

  const undo = useCallback(() => {
    if (!past.length) return
    const prev = past[past.length - 1]
    setFuture((f) => [doc, ...f.slice(0, 49)])
    setPast((p) => p.slice(0, -1))
    setDoc(() => prev)
  }, [past, doc, setDoc])

  const redo = useCallback(() => {
    if (!future.length) return
    const next = future[0]
    setPast((p) => [...p, doc])
    setFuture((f) => f.slice(1))
    setDoc(() => next)
  }, [future, doc, setDoc])

  // Load saved workflows
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        if (Array.isArray(saved.workflows) && saved.workflows.length) {
          setWorkflows(saved.workflows)
          setActiveId(saved.activeId ?? saved.workflows[0].id)
          setLoaded(true)
          return
        }
      }
      // Migrate a single-document save from the previous version
      const legacy = localStorage.getItem(LEGACY_KEY)
      if (legacy) {
        const d = JSON.parse(legacy)
        if (Array.isArray(d.nodes) && Array.isArray(d.connections)) {
          const id = newId()
          setWorkflows([
            { id, name: "My workflow", doc: { nodes: d.nodes, connections: d.connections, screens: d.screens ?? [] } },
          ])
          setActiveId(id)
        }
      }
    } catch {
      /* corrupt save — fall back to the default template */
    }
    setLoaded(true)
  }, [])

  // Autosave
  useEffect(() => {
    if (!loaded) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeId, workflows }))
      } catch {
        /* storage unavailable — skip this save */
      }
    }, 400)
    return () => clearTimeout(t)
  }, [loaded, workflows, activeId])

  /* ------------------------------------------------------------ geometry */

  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const r = viewportRef.current?.getBoundingClientRect()
      if (!r) return { x: 0, y: 0 }
      return { x: (clientX - r.left - pan.x) / zoom, y: (clientY - r.top - pan.y) / zoom }
    },
    [pan, zoom],
  )

  const zoomAt = useCallback(
    (nextZoom: number, clientX: number, clientY: number) => {
      const r = viewportRef.current?.getBoundingClientRect()
      if (!r) return
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))
      const cx = clientX - r.left
      const cy = clientY - r.top
      // Keep the canvas point under the cursor pinned while zooming
      const canvasX = (cx - pan.x) / zoom
      const canvasY = (cy - pan.y) / zoom
      setPan({ x: cx - canvasX * z, y: cy - canvasY * z })
      setZoom(z)
    },
    [pan, zoom],
  )

  const zoomToFit = useCallback(() => {
    const r = viewportRef.current?.getBoundingClientRect()
    if (!r) return
    const boxes = [
      ...doc.nodes.map((n) => ({ x: n.x, y: n.y, w: NODE_W, h: NODE_H })),
      ...doc.screens.map((s) => ({ x: s.x, y: s.y, w: s.width, h: s.height })),
    ]
    if (!boxes.length) {
      setZoom(1)
      setPan({ x: 0, y: 0 })
      return
    }
    const minX = Math.min(...boxes.map((b) => b.x))
    const minY = Math.min(...boxes.map((b) => b.y))
    const maxX = Math.max(...boxes.map((b) => b.x + b.w))
    const maxY = Math.max(...boxes.map((b) => b.y + b.h))
    const pad = 60
    const z = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad * 2) / (maxY - minY))),
    )
    setZoom(z)
    setPan({
      x: (r.width - (maxX - minX) * z) / 2 - minX * z,
      y: (r.height - (maxY - minY) * z) / 2 - minY * z,
    })
  }, [doc.nodes, doc.screens])

  // Frame the whole map once, on first paint, so nothing starts off-screen
  const didFit = useRef(false)
  useEffect(() => {
    if (!loaded || didFit.current) return
    didFit.current = true
    zoomToFit()
  }, [loaded, zoomToFit])

  /* --------------------------------------------------------- interactions */

  const panningMode = tool.kind === "hand" || spaceDown

  const onViewportPointerDown = (e: React.PointerEvent) => {
    // Middle mouse, hand tool, or held Space always pans
    if (e.button === 1 || panningMode) {
      e.preventDefault()
      setDrag({ kind: "pan", startClient: { x: e.clientX, y: e.clientY }, startPan: { ...pan } })
      return
    }
    if (e.button !== 0) return

    const p = toCanvas(e.clientX, e.clientY)

    if (tool.kind === "node") {
      const id = uniqueId(tool.nodeType, doc.nodes)
      const screen = screenContaining(doc.screens, { x: p.x, y: p.y })
      commit((d) => ({
        ...d,
        nodes: [
          ...d.nodes,
          {
            id,
            label: NODE_TYPE_META[tool.nodeType].label,
            type: tool.nodeType,
            x: p.x - NODE_W / 2,
            y: p.y - NODE_H / 2,
            screen: screen?.id ?? "",
          },
        ],
      }))
      setSelection({ kind: "node", id })
      setEditingId(id) // place, then type the name straight away
      setTool({ kind: "select" })
      return
    }

    if (tool.kind === "screen") {
      setDrag({ kind: "drawScreen", start: p, current: p })
      return
    }

    setSelection(null)
    setEditingId(null)
    setEditingEdge(null)
  }

  const onNodePointerDown = (e: React.PointerEvent, node: Node) => {
    if (panningMode || tool.kind !== "select") return
    e.stopPropagation()
    const p = toCanvas(e.clientX, e.clientY)
    setSelection({ kind: "node", id: node.id })
    setPast((prev) => [...prev.slice(-49), doc])
    setFuture([])
    setDrag({ kind: "node", id: node.id, offset: { x: p.x - node.x, y: p.y - node.y }, moved: false })
  }

  const onStartConnect = (e: React.PointerEvent, node: Node) => {
    if (panningMode) return
    setDrag({ kind: "connect", fromId: node.id, cursor: toCanvas(e.clientX, e.clientY) })
  }

  const onScreenHeaderPointerDown = (e: React.PointerEvent, screen: Screen) => {
    if (panningMode || tool.kind !== "select") return
    e.stopPropagation()
    setSelection({ kind: "screen", id: screen.id })
    setPast((prev) => [...prev.slice(-49), doc])
    setFuture([])
    setDrag({ kind: "screen", id: screen.id, last: toCanvas(e.clientX, e.clientY) })
  }

  const onScreenResizePointerDown = (e: React.PointerEvent, screen: Screen) => {
    e.stopPropagation()
    setSelection({ kind: "screen", id: screen.id })
    setPast((prev) => [...prev.slice(-49), doc])
    setFuture([])
    setDrag({
      kind: "resize",
      id: screen.id,
      start: toCanvas(e.clientX, e.clientY),
      startSize: { w: screen.width, h: screen.height },
    })
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
            nodes: d.nodes.map((n) =>
              n.id === drag.id ? { ...n, x: p.x - drag.offset.x, y: p.y - drag.offset.y } : n,
            ),
          }),
          false,
        )
      } else if (drag.kind === "screen") {
        const dx = p.x - drag.last.x
        const dy = p.y - drag.last.y
        setDrag({ ...drag, last: p })
        commit(
          (d) => ({
            ...d,
            screens: d.screens.map((s) => (s.id === drag.id ? { ...s, x: s.x + dx, y: s.y + dy } : s)),
            // A screen carries its contents with it
            nodes: d.nodes.map((n) => (n.screen === drag.id ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
          }),
          false,
        )
      } else if (drag.kind === "resize") {
        commit(
          (d) => ({
            ...d,
            screens: d.screens.map((s) =>
              s.id === drag.id
                ? {
                    ...s,
                    width: Math.max(120, drag.startSize.w + (p.x - drag.start.x)),
                    height: Math.max(90, drag.startSize.h + (p.y - drag.start.y)),
                  }
                : s,
            ),
          }),
          false,
        )
      } else if (drag.kind === "connect") {
        setDrag({ ...drag, cursor: p })
      } else if (drag.kind === "drawScreen") {
        setDrag({ ...drag, current: p })
      }
    }

    const onUp = (e: PointerEvent) => {
      const p = toCanvas(e.clientX, e.clientY)

      if (drag.kind === "connect") {
        const target = nodeAtPoint(doc.nodes, p)
        if (target && target.id !== drag.fromId) {
          const exists = doc.connections.some((c) => c.from === drag.fromId && c.to === target.id)
          if (!exists) {
            // Label it with its type so the map is readable without clicking anything
            const label = defaultEdgeType === "sequence" ? undefined : EDGE_TYPE_META[defaultEdgeType].label
            commit((d) => ({
              ...d,
              connections: [...d.connections, { from: drag.fromId, to: target.id, type: defaultEdgeType, label }],
            }))
            setSelection({ kind: "edge", index: doc.connections.length })
          }
        }
      } else if (drag.kind === "drawScreen") {
        const rect = normalizeRect(drag.start, drag.current)
        if (rect.width > 40 && rect.height > 40) {
          const id = uniqueId("screen", doc.screens)
          commit((d) => ({ ...d, screens: [...d.screens, { id, title: "New screen", ...rect }] }))
          setSelection({ kind: "screen", id })
          setEditingId(id)
        }
        setTool({ kind: "select" })
      } else if (drag.kind === "node" && drag.moved) {
        // Re-home the node into whichever screen now contains it
        commit((d) => {
          const moved = d.nodes.find((n) => n.id === drag.id)
          if (!moved) return d
          const screen = screenContaining(d.screens, nodeCenter(moved))
          return { ...d, nodes: d.nodes.map((n) => (n.id === drag.id ? { ...n, screen: screen?.id ?? "" } : n)) }
        }, false)
      }

      setDrag(null)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [drag, toCanvas, commit, doc.nodes, doc.connections, doc.screens, defaultEdgeType])

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      zoomAt(zoom * (e.deltaY > 0 ? 0.92 : 1.08), e.clientX, e.clientY)
    } else {
      setPan((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }))
    }
  }

  /* ------------------------------------------------------------ mutations */

  const deleteSelection = useCallback(() => {
    if (!selection) return
    if (selection.kind === "node") {
      commit((d) => ({
        ...d,
        nodes: d.nodes.filter((n) => n.id !== selection.id),
        connections: d.connections.filter((c) => c.from !== selection.id && c.to !== selection.id),
      }))
    } else if (selection.kind === "edge") {
      commit((d) => ({ ...d, connections: d.connections.filter((_, i) => i !== selection.index) }))
    } else {
      commit((d) => ({
        ...d,
        screens: d.screens.filter((s) => s.id !== selection.id),
        nodes: d.nodes.map((n) => (n.screen === selection.id ? { ...n, screen: "" } : n)),
      }))
    }
    setSelection(null)
  }, [selection, commit])

  /* --------------------------------------------------------- keyboard */

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
        setEditingId(null)
        setEditingEdge(null)
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
      else if (k === "s") setTool({ kind: "screen" })
      else {
        const entry = (Object.entries(NODE_TYPE_META) as [NodeType, { shortcut: string }][]).find(
          ([, m]) => m.shortcut === e.key,
        )
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
  }, [selection, undo, redo, deleteSelection])

  const updateNode = useCallback(
    (id: string, updates: Partial<Node>) =>
      commit((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n)) })),
    [commit],
  )
  const updateConnection = useCallback(
    (index: number, updates: Partial<Connection>) =>
      commit((d) => ({ ...d, connections: d.connections.map((c, i) => (i === index ? { ...c, ...updates } : c)) })),
    [commit],
  )
  const updateScreen = useCallback(
    (id: string, updates: Partial<Screen>) =>
      commit((d) => ({ ...d, screens: d.screens.map((s) => (s.id === id ? { ...s, ...updates } : s)) })),
    [commit],
  )

  /* ------------------------------------------------------- workflow files */

  const createWorkflow = (templateId?: string) => {
    const id = newId()
    const template = templateId ? getTemplateById(templateId) : undefined
    setWorkflows((ws) => [
      ...ws,
      { id, name: template ? template.name : `Untitled ${ws.length + 1}`, doc: template ? docFromTemplate(template) : blankDoc() },
    ])
    setActiveId(id)
    setSelection(null)
    setPast([])
    setFuture([])
    setTimeout(zoomToFit, 0)
  }

  const switchWorkflow = (id: string) => {
    if (id === "__new__") {
      createWorkflow()
      return
    }
    setActiveId(id)
    setSelection(null)
    setPast([])
    setFuture([])
    setTimeout(zoomToFit, 0)
  }

  const renameWorkflow = (name: string) =>
    setWorkflows((ws) => ws.map((w) => (w.id === activeId ? { ...w, name } : w)))

  const deleteWorkflow = () => {
    setWorkflows((ws) => {
      const rest = ws.filter((w) => w.id !== activeId)
      if (!rest.length) {
        const fresh = { id: newId(), name: "Untitled 1", doc: blankDoc() }
        setActiveId(fresh.id)
        return [fresh]
      }
      setActiveId(rest[0].id)
      return rest
    })
    setSelection(null)
    setPast([])
    setFuture([])
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
        if (Array.isArray(data.nodes) && Array.isArray(data.connections)) {
          const id = newId()
          setWorkflows((ws) => [
            ...ws,
            {
              id,
              name: file.name.replace(/\.json$/i, "") || "Imported",
              doc: {
                nodes: data.nodes,
                connections: data.connections,
                screens: Array.isArray(data.screens) ? data.screens : [],
              },
            },
          ])
          setActiveId(id)
          setSelection(null)
          setTimeout(zoomToFit, 0)
        } else {
          alert("Invalid file: expected JSON with nodes, connections, and screens.")
        }
      } catch {
        alert("Could not parse that file as JSON.")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  /* ---------------------------------------------------------------- render */

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
    : tool.kind === "node" || tool.kind === "screen"
      ? "cursor-crosshair"
      : "cursor-default"

  const edgePairs = doc.connections.map((conn, i) => ({
    conn,
    i,
    from: doc.nodes.find((n) => n.id === conn.from),
    to: doc.nodes.find((n) => n.id === conn.to),
  }))

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2">
        <h1 className="text-sm font-semibold">Workflow Mapper</h1>

        <div className="flex items-center gap-1.5">
          <Select value={activeId} onValueChange={switchWorkflow}>
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

        {/* Type used for the next edge you draw */}
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={!past.length} title="Undo — ⌘Z">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={!future.length} title="Redo — ⇧⌘Z">
            <Redo2 className="h-4 w-4" />
          </Button>

          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" />
            Import
          </Button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />

          <ExportDialog nodes={doc.nodes} connections={doc.connections} screens={doc.screens} />

          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              title="Toggle theme"
            >
              {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Toolbar tool={tool} onToolChange={setTool} />

        {/* Canvas */}
        <div
          ref={viewportRef}
          className={cn("relative flex-1 overflow-hidden bg-canvas", cursorClass)}
          style={{
            backgroundImage: "radial-gradient(circle, var(--canvas-grid) 1px, transparent 1px)",
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
          onPointerDown={onViewportPointerDown}
          onWheel={onWheel}
        >
          <div
            className="absolute left-0 top-0"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
          >
            {doc.screens.map((s) => (
              <ScreenPanel
                key={s.id}
                screen={s}
                isSelected={selection?.kind === "screen" && selection.id === s.id}
                isEditing={editingId === s.id}
                interactive={tool.kind === "select" && !panningMode}
                nodeCount={doc.nodes.filter((n) => n.screen === s.id).length}
                onPointerDownHeader={onScreenHeaderPointerDown}
                onPointerDownResize={onScreenResizePointerDown}
                onStartEditing={setEditingId}
                onCommitTitle={(id, title) => {
                  updateScreen(id, { title })
                  setEditingId(null)
                }}
                onCancelEditing={() => setEditingId(null)}
              />
            ))}

            {/* Edge lines — beneath the nodes, so they tuck under the node body */}
            <svg
              className="pointer-events-none absolute"
              style={{ left: -4000, top: -4000, width: 8000, height: 8000, overflow: "visible" }}
            >
              <g transform="translate(4000,4000)">
                {edgePairs.map(({ conn, i, from, to }) =>
                  from && to ? (
                    <ConnectionLine
                      key={`${conn.from}-${conn.to}-${i}`}
                      connection={conn}
                      from={from}
                      to={to}
                      isSelected={selection?.kind === "edge" && selection.index === i}
                      isDimmed={highlightType !== null && conn.type !== highlightType}
                      animate={motion}
                      onSelect={(e) => {
                        e.stopPropagation()
                        setSelection({ kind: "edge", index: i })
                      }}
                    />
                  ) : null,
                )}

                {connectPreview && (
                  <path
                    d={connectPreview.d}
                    fill="none"
                    stroke={EDGE_TYPE_META[defaultEdgeType].color}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                  />
                )}
              </g>
            </svg>

            {/* Edge labels — painted under the nodes so they never swallow a node drag */}
            {edgePairs.map(({ conn, i, from, to }) =>
              from && to ? (
                <EdgeLabel
                  key={`label-${conn.from}-${conn.to}-${i}`}
                  connection={conn}
                  index={i}
                  from={from}
                  to={to}
                  isSelected={selection?.kind === "edge" && selection.index === i}
                  isDimmed={highlightType !== null && conn.type !== highlightType}
                  isEditing={editingEdge === i}
                  onSelect={() => setSelection({ kind: "edge", index: i })}
                  onStartEditing={() => {
                    setSelection({ kind: "edge", index: i })
                    setEditingEdge(i)
                  }}
                  onCommit={(label) => {
                    updateConnection(i, { label: label || undefined })
                    setEditingEdge(null)
                  }}
                  onCancel={() => setEditingEdge(null)}
                />
              ) : null,
            )}

            {/* Nodes */}
            {doc.nodes.map((n) => (
              <DiagramNode
                key={n.id}
                node={n}
                isSelected={selection?.kind === "node" && selection.id === n.id}
                isDimmed={false}
                isConnectTarget={drag?.kind === "connect" && connectPreview?.targetId === n.id}
                isEditing={editingId === n.id}
                interactive={tool.kind === "select" && !panningMode}
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

            {/* Screen being drawn */}
            {drag?.kind === "drawScreen" && (
              <div
                className="pointer-events-none absolute rounded-xl border-2 border-dashed border-primary bg-primary/5"
                style={normalizeRect(drag.start, drag.current)}
              />
            )}
          </div>

          {/* Zoom controls */}
          <div className="absolute bottom-4 right-4 z-30 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg backdrop-blur">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={zoomToFit}
              className="min-w-[46px] text-center text-xs text-muted-foreground hover:text-foreground"
              title="Zoom to fit"
            >
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

        <Inspector
          selection={selection}
          nodes={doc.nodes}
          connections={doc.connections}
          screens={doc.screens}
          workflowName={active.name}
          templates={diagramTemplates}
          onRenameWorkflow={renameWorkflow}
          onDeleteWorkflow={deleteWorkflow}
          onLoadTemplate={loadTemplate}
          onUpdateNode={updateNode}
          onDeleteNode={(id) => {
            setSelection({ kind: "node", id })
            deleteSelection()
          }}
          onUpdateConnection={updateConnection}
          onDeleteConnection={(index) => {
            setSelection({ kind: "edge", index })
            deleteSelection()
          }}
          onUpdateScreen={updateScreen}
          onDeleteScreen={(id) => {
            setSelection({ kind: "screen", id })
            deleteSelection()
          }}
        />
      </div>

      {/* Status bar */}
      <footer className="flex shrink-0 items-center gap-4 border-t border-border bg-card px-4 py-1.5 text-xs text-muted-foreground">
        <span>{doc.nodes.length} nodes</span>
        <span>{doc.connections.length} edges</span>
        <span>{doc.screens.length} screens</span>

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
          <span>Highlight</span>
          {EDGE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setHighlightType((cur) => (cur === t ? null : t))}
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors",
                highlightType === t ? "text-foreground" : "hover:bg-muted",
              )}
              style={highlightType === t ? { backgroundColor: `${EDGE_TYPE_META[t].color}25` } : undefined}
            >
              {EDGE_TYPE_META[t].label}
            </button>
          ))}
        </div>

        <span className="ml-auto">Space or H to pan · ⌘scroll to zoom · double-click to rename</span>
      </footer>
    </div>
  )
}

function uniqueId(base: string, existing: { id: string }[]) {
  let id = `${base}_${existing.length + 1}`
  let i = existing.length + 2
  while (existing.some((e) => e.id === id)) id = `${base}_${i++}`
  return id
}
