"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Plus, ZoomIn, ZoomOut, Maximize2, HelpCircle, Hand } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  AREA_COLORS,
  EXECUTION_META,
  areaActors,
  areaManualHandoffs,
  areaOpenQuestions,
  areaSystems,
  newId,
  processesInArea,
  type AreaLink,
  type Model,
  type ProcessArea,
} from "@/lib/model"
import { useViewport, MIN_ZOOM, MAX_ZOOM } from "@/hooks/use-viewport"
import type { Finding } from "@/lib/findings"
import type { Selection } from "@/lib/selection"
import { edgePath } from "@/lib/geometry"

export const AREA_W = 260
export const AREA_H = 190
const GAP_X = 80
const ROW_Y = 80

export const areaPos = (a: ProcessArea) => ({ x: a.x ?? 60 + a.order * (AREA_W + GAP_X), y: a.y ?? ROW_Y })

interface OverviewCanvasProps {
  model: Model
  findings: Finding[]
  selection: Selection
  setSelection: (s: Selection) => void
  commit: (fn: (m: Model) => Model, history?: boolean) => void
  snapshot: () => void
  onOpenArea: (areaId: string) => void
  onStartInterview: () => void
}

type Drag =
  | { kind: "pan"; startClient: { x: number; y: number }; startPan: { x: number; y: number } }
  | { kind: "area"; id: string; last: { x: number; y: number }; moved: boolean }
  | { kind: "link"; fromId: string; cursor: { x: number; y: number } }
  | null

/**
 * Company level: one card per Process Area, arrows for the major handoffs
 * between them. Nothing from inside a process is drawn here.
 */
export function OverviewCanvas({ model, findings, selection, setSelection, commit, snapshot, onOpenArea, onStartInterview }: OverviewCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const { zoom, pan, setZoom, setPan, toCanvas, zoomAt, fitTo } = useViewport(viewportRef)
  const [drag, setDrag] = useState<Drag>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [handMode, setHandMode] = useState(false)

  const areas = useMemo(() => [...model.areas].sort((a, b) => a.order - b.order), [model.areas])
  const positions = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, areaPos(a)])), [areas])

  const zoomToFit = useCallback(() => {
    fitTo(areas.map((a) => ({ ...positions[a.id], w: AREA_W, h: AREA_H })))
  }, [fitTo, areas, positions])

  const didFit = useRef(false)
  useEffect(() => {
    if (didFit.current) return
    didFit.current = true
    zoomToFit()
  }, [zoomToFit])

  const panning = handMode || spaceDown

  const onViewportPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || panning) {
      e.preventDefault()
      setDrag({ kind: "pan", startClient: { x: e.clientX, y: e.clientY }, startPan: { ...pan } })
      return
    }
    if (e.button === 0) setSelection(null)
  }

  const onAreaPointerDown = (e: React.PointerEvent, a: ProcessArea) => {
    if (panning) return
    e.stopPropagation()
    setSelection({ kind: "area", id: a.id })
    snapshot()
    setDrag({ kind: "area", id: a.id, last: toCanvas(e.clientX, e.clientY), moved: false })
  }

  const onStartLink = (e: React.PointerEvent, a: ProcessArea) => {
    e.stopPropagation()
    setDrag({ kind: "link", fromId: a.id, cursor: toCanvas(e.clientX, e.clientY) })
  }

  const areaAt = useCallback(
    (p: { x: number; y: number }) => areas.find((a) => p.x >= positions[a.id].x && p.x <= positions[a.id].x + AREA_W && p.y >= positions[a.id].y && p.y <= positions[a.id].y + AREA_H),
    [areas, positions],
  )

  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      if (drag.kind === "pan") {
        setPan({ x: drag.startPan.x + (e.clientX - drag.startClient.x), y: drag.startPan.y + (e.clientY - drag.startClient.y) })
        return
      }
      const p = toCanvas(e.clientX, e.clientY)
      if (drag.kind === "area") {
        const dx = p.x - drag.last.x
        const dy = p.y - drag.last.y
        setDrag({ ...drag, last: p, moved: true })
        commit(
          (m) => ({ ...m, areas: m.areas.map((a) => (a.id === drag.id ? { ...a, x: areaPos(a).x + dx, y: areaPos(a).y + dy } : a)) }),
          false,
        )
      } else if (drag.kind === "link") {
        setDrag({ ...drag, cursor: p })
      }
    }
    const onUp = (e: PointerEvent) => {
      const p = toCanvas(e.clientX, e.clientY)
      if (drag.kind === "link") {
        const target = areaAt(p)
        if (target && target.id !== drag.fromId && !model.areaLinks.some((l) => l.from === drag.fromId && l.to === target.id)) {
          const id = newId("al")
          commit((m) => ({ ...m, areaLinks: [...m.areaLinks, { id, from: drag.fromId, to: target.id, verification: "confirmed" }] }))
          setSelection({ kind: "areaLink", id })
        }
      } else if (drag.kind === "area" && drag.moved) {
        // Snap and re-derive order from x so the breadcrumb/report order follows the layout
        commit((m) => {
          const snapped = m.areas.map((a) => (a.id === drag.id ? { ...a, x: Math.round(areaPos(a).x / 8) * 8, y: Math.round(areaPos(a).y / 8) * 8 } : a))
          const sorted = [...snapped].sort((a, b) => areaPos(a).x - areaPos(b).x || areaPos(a).y - areaPos(b).y)
          return { ...m, areas: sorted.map((a, i) => ({ ...a, order: i })) }
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
  }, [drag, toCanvas, commit, setPan, areaAt, model.areaLinks, setSelection])

  useEffect(() => {
    const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      if (e.code === "Space") {
        e.preventDefault()
        setSpaceDown(true)
      }
      if (e.key === "Escape") setSelection(null)
      if ((e.key === "Delete" || e.key === "Backspace") && selection && (selection.kind === "area" || selection.kind === "areaLink")) {
        e.preventDefault()
        if (selection.kind === "areaLink") commit((m) => ({ ...m, areaLinks: m.areaLinks.filter((l) => l.id !== selection.id) }))
        else if (processesInArea(model, selection.id).every((p) => p.doc.nodes.length === 0)) commit((m) => removeArea(m, selection.id))
        setSelection(null)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false)
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [selection, commit, model, setSelection])

  const addArea = () => {
    const id = newId("area")
    commit((m) => ({
      ...m,
      areas: [...m.areas, { id, name: `Area ${m.areas.length + 1}`, order: m.areas.length, color: AREA_COLORS[m.areas.length % AREA_COLORS.length] }],
    }))
    setSelection({ kind: "area", id })
  }

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) zoomAt(zoom * (e.deltaY > 0 ? 0.92 : 1.08), e.clientX, e.clientY)
    else setPan((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }))
  }

  const anchor = (id: string, side: "left" | "right") => {
    const p = positions[id]
    return { x: p.x + (side === "right" ? AREA_W : 0), y: p.y + AREA_H / 2 }
  }

  return (
    <div
      ref={viewportRef}
      className={cn("relative min-h-0 flex-1 overflow-hidden bg-canvas", panning ? (drag?.kind === "pan" ? "cursor-grabbing" : "cursor-grab") : "cursor-default")}
      style={{
        backgroundImage: "radial-gradient(circle, var(--canvas-grid) 1px, transparent 1px)",
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
      onPointerDown={onViewportPointerDown}
      onWheel={onWheel}
    >
      <div className="absolute left-0 top-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
        <svg className="pointer-events-none absolute" style={{ left: -4000, top: -4000, width: 8000, height: 8000, overflow: "visible" }}>
          <g transform="translate(4000,4000)">
            {model.areaLinks.map((l) => {
              if (!positions[l.from] || !positions[l.to]) return null
              const a = anchor(l.from, "right")
              const b = anchor(l.to, "left")
              const selected = selection?.kind === "areaLink" && selection.id === l.id
              const exec = EXECUTION_META[l.execution ?? "unknown"]
              const d = edgePath(a, b)
              const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
              return (
                <g key={l.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={18}
                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelection({ kind: "areaLink", id: l.id })
                    }}
                  />
                  {selected && <path d={d} fill="none" stroke="#2563eb" strokeWidth={9} strokeOpacity={0.25} />}
                  <path d={d} fill="none" stroke={exec.color} strokeWidth={2.5} strokeDasharray={exec.dash} />
                  <polygon points="0,-5 10,0 0,5" fill={exec.color} transform={`translate(${b.x}, ${b.y})`} />
                  {(l.label || l.payload) && (
                    <foreignObject x={mid.x - 80} y={mid.y - 14} width={160} height={28} style={{ overflow: "visible" }}>
                      <div className="flex justify-center">
                        <span className="rounded-full border bg-card px-2 py-0.5 text-[11px] shadow-sm" style={{ borderColor: exec.color }}>
                          {l.label || l.payload}
                        </span>
                      </div>
                    </foreignObject>
                  )}
                </g>
              )
            })}
            {drag?.kind === "link" && <path d={edgePath(anchor(drag.fromId, "right"), drag.cursor)} fill="none" stroke="#2563eb" strokeWidth={2} strokeDasharray="5 4" />}
          </g>
        </svg>

        {areas.map((a) => (
          <AreaCard
            key={a.id}
            area={a}
            model={model}
            findings={findings}
            pos={positions[a.id]}
            selected={selection?.kind === "area" && selection.id === a.id}
            linkTarget={drag?.kind === "link" && areaAt(drag.cursor)?.id === a.id}
            onPointerDown={onAreaPointerDown}
            onStartLink={onStartLink}
            onOpen={() => onOpenArea(a.id)}
          />
        ))}
      </div>

      {areas.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="max-w-md rounded-xl border border-dashed border-border bg-card/90 p-6 text-center">
            <h3 className="text-base font-semibold">Nothing mapped yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Describe the business to the AI interviewer and the areas appear here, or add the first process area by hand.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button onClick={onStartInterview}>Start mapping with AI</Button>
              <Button variant="outline" onClick={addArea}>
                <Plus className="mr-1 h-4 w-4" /> Add area
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-3 left-3 z-30 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg backdrop-blur">
        <Button variant="outline" size="sm" onClick={addArea}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Area
        </Button>
        <Button variant={handMode ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setHandMode((h) => !h)} title="Pan (or hold Space)">
          <Hand className="h-4 w-4" />
        </Button>
        <span className="px-2 text-[11px] text-muted-foreground">Double-click an area to open it · drag the dot to link areas</span>
      </div>

      <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg backdrop-blur">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <button type="button" onClick={zoomToFit} className="min-w-[46px] text-center text-xs text-muted-foreground hover:text-foreground">
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
  )
}

function AreaCard({
  area,
  model,
  findings,
  pos,
  selected,
  linkTarget,
  onPointerDown,
  onStartLink,
  onOpen,
}: {
  area: ProcessArea
  model: Model
  findings: Finding[]
  pos: { x: number; y: number }
  selected: boolean
  linkTarget: boolean
  onPointerDown: (e: React.PointerEvent, a: ProcessArea) => void
  onStartLink: (e: React.PointerEvent, a: ProcessArea) => void
  onOpen: () => void
}) {
  const color = area.color ?? "#64748b"
  const procs = processesInArea(model, area.id)
  const actors = areaActors(model, area.id)
  const systems = areaSystems(model, area.id)
  const manual = areaManualHandoffs(model, area.id)
  const questions = areaOpenQuestions(model, area.id)
  const pids = new Set(procs.map((p) => p.id))
  const findingCount = findings.filter((f) => f.rule !== "unresolved-question" && f.rule !== "cross-actor-handoff" && (f.ref.areaId === area.id || (f.ref.processId && pids.has(f.ref.processId)))).length
  const steps = procs.reduce((s, p) => s + p.doc.nodes.filter((n) => n.type === "step" || n.type === "decision" || n.type === "trigger").length, 0)

  return (
    <div
      className={cn("group absolute flex cursor-grab select-none flex-col rounded-xl border-2 bg-card shadow-sm transition-shadow active:cursor-grabbing", selected && "shadow-lg")}
      style={{ left: pos.x, top: pos.y, width: AREA_W, height: AREA_H, borderColor: selected || linkTarget ? color : `${color}66`, boxShadow: selected ? `0 0 0 3px ${color}33` : undefined }}
      onPointerDown={(e) => onPointerDown(e, area)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
    >
      <div className="flex items-center gap-2 rounded-t-[10px] px-3 py-2" style={{ backgroundColor: `${color}14`, boxShadow: `inset 4px 0 0 ${color}` }}>
        <span className="truncate text-sm font-semibold">{area.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{procs.length} {procs.length === 1 ? "process" : "processes"}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-3 py-2 text-[11px] leading-snug">
        {area.purpose ? <p className="line-clamp-2 text-muted-foreground">{area.purpose}</p> : <p className="italic text-muted-foreground/70">No purpose recorded</p>}
        <Row label="Who" value={actors.length ? actors.slice(0, 4).join(", ") + (actors.length > 4 ? ` +${actors.length - 4}` : "") : "—"} />
        <Row label="Systems" value={systems.length ? systems.slice(0, 3).join(", ") + (systems.length > 3 ? ` +${systems.length - 3}` : "") : "—"} />
        <Row label="In → Out" value={`${area.inputs || "?"} → ${area.outputs || "?"}`} />
      </div>
      <div className="flex items-center gap-2 border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>{steps} steps</span>
        {manual > 0 && <span className="text-red-600">{manual} manual handoffs</span>}
        {questions > 0 && (
          <span className="flex items-center gap-0.5 text-amber-600">
            <HelpCircle className="h-3 w-3" /> {questions}
          </span>
        )}
        {findingCount > 0 && <span>{findingCount} findings</span>}
      </div>

      <button
        type="button"
        title="Drag to link to another area"
        onPointerDown={(e) => onStartLink(e, area)}
        className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-card opacity-0 transition-opacity group-hover:opacity-100"
        style={{ backgroundColor: color, opacity: selected ? 1 : undefined }}
      />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-12 shrink-0 text-muted-foreground/80">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  )
}

export function removeArea(m: Model, areaId: string): Model {
  return {
    ...m,
    areas: m.areas.filter((a) => a.id !== areaId).map((a, i) => ({ ...a, order: i })),
    areaLinks: m.areaLinks.filter((l) => l.from !== areaId && l.to !== areaId),
    processes: m.processes.filter((p) => p.areaId !== areaId),
  }
}

