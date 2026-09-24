"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ZoomIn, ZoomOut, Maximize2, HelpCircle, Diamond, Zap, AlertTriangle, ListChecks, Users, Server, Hand } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  areaActors,
  areaSystems,
  openQuestions,
  processesInArea,
  type Model,
  type Node,
  type ProcessArea,
  type SketchNode,
} from "@/lib/model"
import type { Finding } from "@/lib/findings"
import type { Nav, Selection } from "@/lib/selection"
import { useViewport, MIN_ZOOM, MAX_ZOOM } from "@/hooks/use-viewport"
import { edgePath } from "@/lib/geometry"

/**
 * The Operating Map: the business end to end, drawn as framed stages with
 * their key steps, real connectors between them, exceptions off to the side,
 * and a loop back to demand. Everything on it answers one question: where
 * does work come from, who touches it, where does it hand off, where is it
 * weak, and where do I drill in next.
 */

interface LoopMapProps {
  model: Model
  findings: Finding[]
  selection: Selection
  setSelection: (s: Selection) => void
  onOpenArea: (areaId: string) => void
  onMapArea: (areaId: string) => void
  onAskAbout: (areaId: string) => void
  onNavigate: (nav: Nav, selection?: Selection) => void
  commit: (fn: (m: Model) => Model, history?: boolean) => void
  snapshot: () => void
}

/* ---------------------------------------------------------------- layout */

const SEC_W = 236
const NODE_H = 44
const NODE_GAP = 10
const HEAD_H = 40
const META_H = 44
const PAD = 12
const GAP_X = 64
const LEFT = 40
const TOP = 40
const SIDE_DROP = 70

interface MapNode {
  id: string
  label: string
  kind: SketchNode["kind"]
  /** Real node in a mapped workflow; undefined for sketch placeholders. */
  ref?: { processId: string; nodeId: string }
  x: number
  y: number
}

interface Gap {
  key: string
  label: string
  severity: "red" | "orange"
  icon: typeof HelpCircle
}

interface Section {
  area: ProcessArea
  x: number
  y: number
  w: number
  h: number
  nodes: MapNode[]
  actors: string[]
  systems: string[]
  gaps: Gap[]
  mapped: boolean
  openQuestions: number
}

/** Up to four key nodes from a mapped workflow: its intake, first step, first decision, last step. */
function keyNodesFromProcess(model: Model, areaId: string): MapNode[] {
  const procs = processesInArea(model, areaId).filter((p) => p.doc.nodes.length)
  const out: MapNode[] = []
  for (const p of procs) {
    const work = p.doc.nodes.filter((n) => n.type !== "note" && n.type !== "system" && n.type !== "tool").sort((a, b) => a.x - b.x || a.y - b.y)
    const triggers = work.filter((n) => n.type === "trigger")
    const steps = work.filter((n) => n.type === "step")
    const decisions = work.filter((n) => n.type === "decision")
    const push = (n: Node | undefined, kind: SketchNode["kind"], labelOverride?: string) => {
      if (!n || out.some((o) => o.ref?.nodeId === n.id)) return
      out.push({ id: n.id, label: labelOverride ?? n.label, kind, ref: { processId: p.id, nodeId: n.id }, x: 0, y: 0 })
    }
    if (triggers.length > 1) push(triggers[0], "source", triggers.map((t) => t.label.replace(/\s*(order|request)?\s*(arrives|received|comes in)\s*$/i, "")).join(" / ").slice(0, 40))
    else push(triggers[0], "source")
    push(steps[0], "step")
    push(decisions[0], "decision")
    if (steps.length > 1) push(steps[steps.length - 1], "step")
    if (out.length >= 4) break
  }
  return out.slice(0, 4)
}

function gapsFor(model: Model, findings: Finding[], area: ProcessArea): Gap[] {
  const pids = new Set(processesInArea(model, area.id).map((p) => p.id))
  const mine = findings.filter((f) => f.ref.areaId === area.id || (f.ref.processId && pids.has(f.ref.processId)))
  const has = (...rules: string[]) => mine.filter((f) => rules.includes(f.rule)).length
  const gaps: Gap[] = []
  const add = (n: number, key: string, label: string, severity: Gap["severity"], icon: typeof HelpCircle) => {
    if (n > 0) gaps.push({ key, label: n > 1 ? `${label} ×${n}` : label, severity, icon })
  }
  add(has("manual-reentry", "duplicate-entry"), "reentry", "Re-entered by hand", "red", Hand)
  add(has("unknown-trigger", "unknown-channel", "unknown-execution"), "handoff", "Unclear handoff", "red", Zap)
  add(has("human-polling"), "waiting", "Someone checks by hand", "orange", HelpCircle)
  add(has("unknown-system"), "system", "Unknown system", "orange", Server)
  add(has("undefined-owner", "single-person-dependency"), "owner", "Owner unclear / one person", "orange", Users)
  add(has("single-branch-decision"), "branch", "Missing decision branch", "orange", Diamond)
  const q = openQuestions(model).filter((x) => x.ref.areaId === area.id || (x.ref.processId && pids.has(x.ref.processId))).length
  add(q, "questions", "Open question", "orange", HelpCircle)
  return gaps.slice(0, 3)
}

function layout(model: Model, findings: Finding[]): { sections: Section[]; main: Section[]; width: number; height: number } {
  const areas = [...model.areas].sort((a, b) => a.order - b.order)
  const sections: Section[] = areas.map((area) => {
    const fromProcess = keyNodesFromProcess(model, area.id)
    const mapped = fromProcess.length > 0
    const sketch: MapNode[] = (area.sketch ?? []).slice(0, 4).map((n, i) => ({ id: `${area.id}_s${i}`, label: n.label, kind: n.kind, x: 0, y: 0 }))
    const nodes = mapped ? fromProcess : sketch
    const gaps = gapsFor(model, findings, area)
    const h = HEAD_H + PAD + Math.max(1, nodes.length) * (NODE_H + NODE_GAP) + META_H + (gaps.length ? 26 : 0)
    return { area, x: 0, y: 0, w: SEC_W, h, nodes, actors: areaActors(model, area.id), systems: areaSystems(model, area.id), gaps, mapped, openQuestions: 0 }
  })
  const main = sections.filter((s) => !s.area.side)
  const side = sections.filter((s) => s.area.side)
  const rowH = Math.max(...main.map((s) => s.h), 200)
  main.forEach((s, i) => {
    s.x = s.area.x ?? LEFT + i * (SEC_W + GAP_X)
    s.y = s.area.y ?? TOP
  })
  // Side stages hang under the main stage that precedes them in order
  side.forEach((s) => {
    const before = [...main].reverse().find((m) => m.area.order < s.area.order) ?? main[0]
    s.x = s.area.x ?? (before ? before.x + SEC_W / 2 + GAP_X / 2 : LEFT)
    s.y = s.area.y ?? TOP + rowH + SIDE_DROP
  })
  for (const s of sections) s.nodes.forEach((n, i) => {
    n.x = s.x + PAD
    n.y = s.y + HEAD_H + PAD + i * (NODE_H + NODE_GAP)
  })
  const width = Math.max(LEFT + main.length * (SEC_W + GAP_X), ...sections.map((s) => s.x + s.w + GAP_X))
  const height = Math.max(TOP + rowH + (side.length ? SIDE_DROP + Math.max(...side.map((s) => s.h)) : 0), ...sections.map((s) => s.y + s.h)) + 80
  return { sections, main, width, height }
}

/* ------------------------------------------------------------- component */

export function LoopMap({ model, findings, selection, setSelection, onOpenArea, onMapArea, onAskAbout, onNavigate, commit, snapshot }: LoopMapProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const { zoom, pan, setZoom, setPan, zoomAt, fitTo, toCanvas } = useViewport(viewportRef)
  const [drag, setDrag] = useState<{ startClient: { x: number; y: number }; startPan: { x: number; y: number } } | null>(null)
  const [secDrag, setSecDrag] = useState<{ id: string; last: { x: number; y: number } } | null>(null)

  const { sections, main, width, height } = useMemo(() => layout(model, findings), [model, findings])

  const zoomToFit = useCallback(() => fitTo([{ x: 0, y: 0, w: width, h: height }]), [fitTo, width, height])
  const didFit = useRef(false)
  useEffect(() => {
    if (didFit.current) return
    didFit.current = true
    zoomToFit()
  }, [zoomToFit])

  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => setPan({ x: drag.startPan.x + (e.clientX - drag.startClient.x), y: drag.startPan.y + (e.clientY - drag.startClient.y) })
    const up = () => setDrag(null)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
  }, [drag, setPan])

  // Drag a section by its header; the position sticks to the stage
  useEffect(() => {
    if (!secDrag) return
    const move = (e: PointerEvent) => {
      const p = toCanvas(e.clientX, e.clientY)
      const dx = p.x - secDrag.last.x
      const dy = p.y - secDrag.last.y
      setSecDrag({ ...secDrag, last: p })
      commit((m) => ({ ...m, areas: m.areas.map((a) => (a.id === secDrag.id ? { ...a, x: (sections.find((s) => s.area.id === a.id)?.x ?? 0) + dx, y: (sections.find((s) => s.area.id === a.id)?.y ?? 0) + dy } : a)) }), false)
    }
    const up = () => {
      commit((m) => ({ ...m, areas: m.areas.map((a) => (a.id === secDrag.id && a.x !== undefined && a.y !== undefined ? { ...a, x: Math.round(a.x / 8) * 8, y: Math.round(a.y / 8) * 8 } : a)) }), false)
      setSecDrag(null)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
  }, [secDrag, toCanvas, commit, sections])

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) zoomAt(zoom * (e.deltaY > 0 ? 0.92 : 1.08), e.clientX, e.clientY)
    else setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
  }

  /* connectors */
  const links = useMemo(() => {
    const out: { id: string; d: string; kind: "main" | "exception" | "return" | "cross"; label?: string; end: { x: number; y: number } }[] = []
    const byId = Object.fromEntries(sections.map((s) => [s.area.id, s]))
    const lastNode = (s: Section) => s.nodes[s.nodes.length - 1]
    const firstNode = (s: Section) => s.nodes[0]
    const exitOf = (s: Section) => {
      const n = lastNode(s)
      return n ? { x: n.x + SEC_W - PAD * 2, y: n.y + NODE_H / 2 } : { x: s.x + s.w, y: s.y + s.h / 2 }
    }
    const entryOf = (s: Section) => {
      const n = firstNode(s)
      return n ? { x: n.x, y: n.y + NODE_H / 2 } : { x: s.x, y: s.y + s.h / 2 }
    }
    // Main flow: consecutive main stages
    main.slice(1).forEach((s, i) => {
      const a = main[i]
      const from = exitOf(a)
      const to = entryOf(s)
      const link = model.areaLinks.find((l) => l.from === a.area.id && l.to === s.area.id)
      out.push({ id: `m${i}`, d: edgePath(from, to), kind: "main", label: link?.payload ?? link?.label, end: to })
    })
    // Explicit cross-links that are not the consecutive chain
    model.areaLinks.forEach((l) => {
      const a = byId[l.from]
      const b = byId[l.to]
      if (!a || !b) return
      const ai = main.indexOf(a)
      const bi = main.indexOf(b)
      if (ai >= 0 && bi === ai + 1) return
      if (a.area.side || b.area.side) return
      out.push({ id: l.id, d: edgePath(exitOf(a), entryOf(b)), kind: "cross", label: l.label ?? l.payload, end: entryOf(b) })
    })
    // Exceptions: from the nearest decision before the side stage into it, and back out to the next main stage
    sections.filter((s) => s.area.side).forEach((side) => {
      const before = [...main].reverse().find((m) => m.area.order < side.area.order)
      const after = main.find((m) => m.area.order > side.area.order)
      if (before) {
        const dec = before.nodes.find((n) => n.kind === "decision") ?? lastNode(before)
        const from = dec ? { x: dec.x + (SEC_W - PAD * 2) / 2, y: dec.y + NODE_H } : { x: before.x + before.w / 2, y: before.y + before.h }
        const to = { x: side.x + side.w / 2, y: side.y }
        out.push({ id: `x-in-${side.area.id}`, d: `M ${from.x} ${from.y} C ${from.x} ${from.y + 40}, ${to.x} ${to.y - 40}, ${to.x} ${to.y}`, kind: "exception", label: dec?.kind === "decision" ? "no" : undefined, end: to })
      }
      if (after) {
        const from = { x: side.x + side.w, y: side.y + side.h / 2 }
        const to = entryOf(after)
        out.push({ id: `x-out-${side.area.id}`, d: `M ${from.x} ${from.y} C ${from.x + 60} ${from.y}, ${to.x - 30} ${to.y + 60}, ${to.x} ${to.y}`, kind: "exception", end: to })
      }
    })
    // Loop back from the last main stage to demand, routed along the bottom
    if (main.length > 1) {
      const last = main[main.length - 1]
      const first = main[0]
      const from = exitOf(last)
      const bottom = height - 30
      const to = entryOf(first)
      out.push({ id: "return", d: `M ${from.x} ${from.y} H ${from.x + 24} Q ${from.x + 40} ${from.y} ${from.x + 40} ${from.y + 16} V ${bottom - 16} Q ${from.x + 40} ${bottom} ${from.x + 24} ${bottom} H ${to.x - 24} Q ${to.x - 40} ${bottom} ${to.x - 40} ${bottom - 16} V ${to.y + 16} Q ${to.x - 40} ${to.y} ${to.x - 24} ${to.y} H ${to.x}`, kind: "return", label: "repeat / referral", end: to })
    }
    return out
  }, [sections, main, model.areaLinks, height])

  const selectedArea = selection?.kind === "area" ? selection.id : null

  return (
    <div
      ref={viewportRef}
      className={cn("relative min-h-0 flex-1 overflow-hidden bg-canvas", drag ? "cursor-grabbing" : "cursor-default")}
      style={{ backgroundImage: "radial-gradient(circle, var(--canvas-grid) 1px, transparent 1px)", backgroundSize: `${24 * zoom}px ${24 * zoom}px`, backgroundPosition: `${pan.x}px ${pan.y}px` }}
      onPointerDown={(e) => {
        if (e.button === 1 || e.button === 0) {
          setSelection(null)
          setDrag({ startClient: { x: e.clientX, y: e.clientY }, startPan: { ...pan } })
        }
      }}
      onWheel={onWheel}
    >
      <div className="absolute left-0 top-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0", width, height }}>
        <svg className="pointer-events-none absolute left-0 top-0" width={width} height={height} style={{ overflow: "visible" }}>
          <defs>
            <marker id="lm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" /></marker>
            <marker id="lm-arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#dc2626" /></marker>
          </defs>
          {links.map((l) => (
            <g key={l.id}>
              <path
                d={l.d}
                fill="none"
                stroke={l.kind === "exception" ? "#dc2626" : l.kind === "return" ? "#94a3b8" : "#64748b"}
                strokeWidth={l.kind === "main" ? 2 : 1.5}
                strokeDasharray={l.kind === "main" ? undefined : l.kind === "return" ? "2 6" : "6 4"}
                strokeOpacity={l.kind === "return" ? 0.9 : l.kind === "cross" ? 0.7 : 1}
                markerEnd={l.kind === "exception" ? "url(#lm-arrow-red)" : "url(#lm-arrow)"}
              />
            </g>
          ))}
        </svg>

        {links.filter((l) => l.label).map((l) => {
          const m = l.kind === "return" ? { x: width / 2, y: height - 30 } : midpoint(l.d)
          return (
            <span key={`lbl-${l.id}`} className={cn("absolute -translate-x-1/2 -translate-y-1/2 rounded-full border bg-card px-1.5 py-0.5 text-[10px] shadow-sm", l.kind === "exception" ? "border-red-300 text-red-700" : "border-border text-muted-foreground")} style={{ left: m.x, top: m.y }}>
              {l.label}
            </span>
          )
        })}

        {sections.map((s) => (
          <SectionFrame
            key={s.area.id}
            s={s}
            selected={selectedArea === s.area.id}
            onSelect={() => setSelection({ kind: "area", id: s.area.id })}
            onDragStart={(e) => {
              setSelection({ kind: "area", id: s.area.id })
              snapshot()
              setSecDrag({ id: s.area.id, last: toCanvas(e.clientX, e.clientY) })
            }}
            onOpen={() => (s.mapped ? onOpenArea(s.area.id) : onMapArea(s.area.id))}
            onAsk={() => onAskAbout(s.area.id)}
            onNode={(n) => (n.ref ? onNavigate({ level: "process", processId: n.ref.processId }, { kind: "node", id: n.ref.nodeId }) : setSelection({ kind: "area", id: s.area.id }))}
          />
        ))}
      </div>

      <div className="absolute bottom-3 left-3 z-30 rounded-lg border border-border bg-card/95 px-2 py-1 text-[11px] text-muted-foreground shadow-lg backdrop-blur">
        <span className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-slate-500" /> main flow</span>
        <span className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-red-500" /> exception</span>
        <span className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t-2 border-dotted border-slate-400" /> repeat</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-6 rounded border border-dashed border-slate-400" /> typical, not yet mapped</span>
      </div>

      <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg backdrop-blur">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}><ZoomOut className="h-4 w-4" /></Button>
        <button type="button" onClick={zoomToFit} className="min-w-[46px] text-center text-xs text-muted-foreground hover:text-foreground">{Math.round(zoom * 100)}%</button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))}><ZoomIn className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomToFit} title="Zoom to fit"><Maximize2 className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}

function midpoint(d: string): { x: number; y: number } {
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
  if (nums.length < 4) return { x: 0, y: 0 }
  const x0 = nums[0], y0 = nums[1], x1 = nums[nums.length - 2], y1 = nums[nums.length - 1]
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
}

/* ---------------------------------------------------------------- section */

function SectionFrame({ s, selected, onSelect, onDragStart, onOpen, onAsk, onNode }: { s: Section; selected: boolean; onSelect: () => void; onDragStart: (e: React.PointerEvent) => void; onOpen: () => void; onAsk: () => void; onNode: (n: MapNode) => void }) {
  const color = s.area.color ?? "#64748b"
  const red = s.gaps.some((g) => g.severity === "red")
  return (
    <div
      className={cn("absolute rounded-xl border-2 bg-card/70 backdrop-blur-[1px] transition-shadow", selected && "shadow-lg")}
      style={{ left: s.x, top: s.y, width: s.w, height: s.h, borderColor: selected ? color : red ? "#dc262699" : `${color}66`, borderStyle: s.mapped ? "solid" : "dashed" }}
      onPointerDown={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
    >
      <div
        className="flex cursor-grab items-center gap-2 rounded-t-[10px] px-3 active:cursor-grabbing"
        style={{ height: HEAD_H, backgroundColor: `${color}14`, boxShadow: `inset 4px 0 0 ${color}` }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.stopPropagation()
          onDragStart(e)
        }}
      >
        <span className="truncate text-[13px] font-semibold" title={s.area.purpose || s.area.name}>{s.area.name}</span>
        {s.area.side && <span className="text-[10px] text-muted-foreground">side path</span>}
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpen() }} className="ml-auto text-[10px] text-primary hover:underline">{s.mapped ? "Outline" : "Map"}</button>
      </div>

      {s.nodes.map((n) => (
        <MapNodeBox key={n.id} n={n} left={n.x - s.x} top={n.y - s.y} sketch={!n.ref} onClick={() => onNode(n)} />
      ))}
      {s.nodes.length === 0 && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onAsk() }} className="absolute left-3 right-3 rounded-md border border-dashed border-border py-2 text-[11px] text-muted-foreground hover:text-foreground" style={{ top: HEAD_H + PAD, height: NODE_H }}>
          Nothing known yet · ask AI
        </button>
      )}

      <div className="absolute left-3 right-3 space-y-0.5 text-[10px] leading-tight text-muted-foreground" style={{ top: HEAD_H + PAD + Math.max(1, s.nodes.length) * (NODE_H + NODE_GAP) }}>
        <div className="flex items-start gap-1"><Users className="mt-px h-3 w-3 shrink-0" /><span className="truncate">{s.actors.length ? s.actors.slice(0, 3).join(", ") + (s.actors.length > 3 ? ` +${s.actors.length - 3}` : "") : "Who: not yet known"}</span></div>
        <div className="flex items-start gap-1"><Server className="mt-px h-3 w-3 shrink-0" /><span className="truncate">{s.systems.length ? s.systems.slice(0, 3).join(", ") + (s.systems.length > 3 ? ` +${s.systems.length - 3}` : "") : "Systems: not yet known"}</span></div>
        {s.gaps.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {s.gaps.map((g) => (
              <span key={g.key} className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px", g.severity === "red" ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300")}>
                <g.icon className="h-2.5 w-2.5" /> {g.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MapNodeBox({ n, left, top, sketch, onClick }: { n: MapNode; left: number; top: number; sketch: boolean; onClick: () => void }) {
  const Icon = n.kind === "decision" ? Diamond : n.kind === "source" ? Zap : n.kind === "exception" ? AlertTriangle : ListChecks
  const tone = n.kind === "decision" ? "#d97706" : n.kind === "source" ? "#0891b2" : n.kind === "exception" ? "#dc2626" : "#4f46e5"
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={sketch ? "Typical for this kind of business; not mapped yet" : "Open in the workflow"}
      className={cn("absolute flex items-center gap-2 border bg-card px-2 text-left text-[11px] leading-tight shadow-sm hover:shadow", n.kind === "decision" ? "rounded-lg border-dashed" : "rounded-md", sketch && "border-dashed text-muted-foreground")}
      style={{ left, top, width: SEC_W - PAD * 2, height: NODE_H, borderColor: sketch ? "#94a3b8" : tone, opacity: sketch ? 0.85 : 1 }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: tone }} />
      <span className="line-clamp-2">{n.label}</span>
    </button>
  )
}
