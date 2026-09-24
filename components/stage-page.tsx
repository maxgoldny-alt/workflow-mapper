"use client"

import { Fragment, useRef, useState, type ReactNode } from "react"
import { ArrowLeft, Check, Copy, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  CHANNEL_META,
  EXECUTION_META,
  TRIGGER_META,
  areaActors,
  areaSystems,
  dataObjectById,
  handoffs,
  isManualEdge,
  openQuestions,
  processesInArea,
  systemById,
  updateProcessDoc,
  type Connection,
  type Model,
  type Node,
  type Process,
  type ProcessArea,
} from "@/lib/model"
import { outlineOrder } from "@/lib/outline"
import { sopForArea } from "@/lib/sop"
import type { Finding } from "@/lib/findings"
import type { Selection } from "@/lib/selection"
import { StageOutline } from "./stage-outline"
import { ProcessCanvas } from "./process-canvas"

export type StageTab = "steps" | "diagram" | "sop" | "data"

export interface StagePageProps {
  model: Model
  area: ProcessArea
  /** Open on this workflow (if it belongs to the stage) until the user picks another. */
  processId?: string
  findings: Finding[]
  selection: Selection
  setSelection: (s: Selection) => void
  commit: (fn: (m: Model) => Model, history?: boolean) => void
  snapshot: () => void
  undo: () => void
  redo: () => void
  onAskAbout: (areaId: string) => void // opens the AI drawer focused on this stage
  onBack: () => void // back to the Overview
  tab: StageTab
  onTab: (t: StageTab) => void
}

const TABS: { id: StageTab; label: string }[] = [
  { id: "steps", label: "Steps" },
  { id: "diagram", label: "Diagram" },
  { id: "sop", label: "SOP" },
  { id: "data", label: "Data" },
]

const isPlaceholderActor = (a: string) => /^actor \d+$/i.test(a)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Level 2: one stage of the business. Every tab is a different reading of the
 * same data (the stage's process docs): an editable outline, the swimlane
 * diagram, the written SOP, and what moves between people and systems.
 */
export function StagePage({ model, area, processId, findings, selection, setSelection, commit, snapshot, undo, redo, onAskAbout, onBack, tab, onTab }: StagePageProps) {
  const procs = processesInArea(model, area.id)
  const [pickedId, setPickedId] = useState<string | null>(null)
  // A new processId from the shell overrides the user's earlier pick.
  const [lastProcessId, setLastProcessId] = useState(processId)
  if (processId !== lastProcessId) {
    setLastProcessId(processId)
    setPickedId(null)
  }
  const process: Process | undefined = procs.find((p) => p.id === pickedId) ?? procs.find((p) => p.id === processId) ?? procs[0]
  const color = area.color ?? "#64748b"

  const stepCount = procs.reduce((s, p) => s + outlineOrder(p.doc).length, 0)
  const people = areaActors(model, area.id).filter((a) => !isPlaceholderActor(a))
  const systems = areaSystems(model, area.id)
  const pids = new Set(procs.map((p) => p.id))
  const questions = openQuestions(model).filter((q) => q.ref.areaId === area.id || (q.ref.processId && pids.has(q.ref.processId)))
  const issues = findings.filter((f) => f.rule !== "unresolved-question" && f.rule !== "cross-actor-handoff" && (f.ref.areaId === area.id || (f.ref.processId && pids.has(f.ref.processId))))

  const showPicker = procs.length > 1 && (tab === "steps" || tab === "diagram")

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <div className="shrink-0 border-b border-border bg-card px-6 pt-4">
        <button type="button" onClick={onBack} className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Overview
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold leading-tight">{area.name}</h2>
            <p className="text-xs text-muted-foreground">
              {stepCount > 0 ? `${plural(stepCount, "step", "steps")} · ${plural(people.length, "person", "people")} · ${plural(systems.length, "system", "systems")}` : "Not mapped yet"}
              {issues.length > 0 && <span className="text-red-600"> · {plural(issues.length, "issue", "issues")}</span>}
              {questions.length > 0 && <span className="text-amber-600"> · {plural(questions.length, "open question", "open questions")}</span>}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onAskAbout(area.id)}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Ask AI
          </Button>
        </div>

        <div className="mt-3 flex gap-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTab(t.id)}
              className={cn("-mb-px border-b-2 px-3 py-1.5 text-sm", tab === t.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {showPicker && (
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-border bg-canvas px-6 py-2">
          {procs.map((p) => (
            <button key={p.id} type="button" onClick={() => setPickedId(p.id)} className={cn("rounded-full border px-2.5 py-0.5 text-xs", p.id === process?.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "steps" && (
          <StageOutline
            model={model}
            area={area}
            process={process}
            findings={findings}
            selection={selection}
            setSelection={setSelection}
            commit={commit}
            onOpenDiagram={process ? () => onTab("diagram") : undefined}
          />
        )}

        {tab === "diagram" &&
          (process && process.doc.nodes.length > 0 ? (
            <ProcessCanvas
              key={process.id}
              model={model}
              process={process}
              findings={findings}
              view="operational"
              selection={selection}
              setSelection={setSelection}
              commitDoc={(fn, hist = true) => commit((m) => updateProcessDoc(m, process.id, fn), hist)}
              snapshot={snapshot}
              undo={undo}
              redo={redo}
              readOnly
            />
          ) : (
            <Empty>
              <p>No steps yet. Add them in Steps or ask the AI.</p>
              <div className="mt-3 flex justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => onTab("steps")}>Go to Steps</Button>
                <Button variant="ghost" size="sm" onClick={() => onAskAbout(area.id)}><Sparkles className="mr-1 h-3.5 w-3.5" /> Ask AI</Button>
              </div>
            </Empty>
          ))}

        {tab === "sop" && <SopTab model={model} area={area} />}

        {tab === "data" && <DataTab model={model} procs={procs} setSelection={setSelection} />}
      </div>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6 text-center text-sm text-muted-foreground"><div>{children}</div></div>
}

/* ------------------------------------------------------------------ SOP */

function SopTab({ model, area }: { model: Model; area: ProcessArea }) {
  const md = sopForArea(model, area)
  const [copied, setCopied] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const rawRef = useRef<HTMLTextAreaElement>(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked: show the raw Markdown, selected, so it can be copied by hand.
      setShowRaw(true)
      requestAnimationFrame(() => {
        rawRef.current?.focus()
        rawRef.current?.select()
      })
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-3xl px-6 py-5">
        <div className="mb-3 flex items-center justify-end gap-2">
          {showRaw && <span className="text-xs text-muted-foreground">Copy was blocked. The Markdown is selected below; press Ctrl+C.</span>}
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy Markdown"}
          </Button>
        </div>
        {showRaw && (
          <textarea ref={rawRef} readOnly value={md} className="mb-4 h-48 w-full rounded-lg border border-border bg-background p-2 font-mono text-xs" />
        )}
        <article className="rounded-lg border border-border bg-card px-6 py-5 text-sm leading-relaxed">
          <Markdown source={md} />
        </article>
      </div>
    </div>
  )
}

/** Inline: **bold**, *italic*, _italic_. */
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|(?<!\w)_[^_]+_(?!\w)|(?<![*\w])\*[^*]+\*(?![*\w]))/g)
  return parts.map((p, i) => {
    if (p.length > 4 && p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.length > 2 && ((p.startsWith("_") && p.endsWith("_")) || (p.startsWith("*") && p.endsWith("*")))) return <em key={i}>{p.slice(1, -1)}</em>
    return <Fragment key={i}>{p}</Fragment>
  })
}

type OlBlock = { kind: "ol"; items: { text: string; subs: string[] }[] }
type UlBlock = { kind: "ul"; items: string[] }
type Block = { kind: "h"; level: number; text: string } | { kind: "p"; text: string } | { kind: "hr" } | OlBlock | UlBlock

/** Just enough Markdown for the generated SOP: #/##/###, numbered steps with nested "- " bullets, plain bullets, paragraphs, ---. */
function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = []
  let list: OlBlock | UlBlock | null = null
  const flush = () => {
    if (list) blocks.push(list)
    list = null
  }
  for (const raw of src.split("\n")) {
    const line = raw.replace(/\s+$/, "")
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    const numbered = line.match(/^\d+\.\s+(.*)$/)
    const nested = line.match(/^\s+[-*]\s+(.*)$/)
    const bullet = line.match(/^[-*]\s+(.*)$/)
    if (!line.trim()) {
      flush()
    } else if (heading) {
      flush()
      blocks.push({ kind: "h", level: heading[1].length, text: heading[2] })
    } else if (/^-{3,}$/.test(line)) {
      flush()
      blocks.push({ kind: "hr" })
    } else if (numbered) {
      const ol: OlBlock = list?.kind === "ol" ? list : { kind: "ol", items: [] }
      if (ol !== list) {
        flush()
        list = ol
      }
      ol.items.push({ text: numbered[1], subs: [] })
    } else if (nested) {
      const cur: OlBlock | UlBlock | null = list
      if (cur?.kind === "ol" && cur.items.length) cur.items[cur.items.length - 1].subs.push(nested[1])
      else if (cur?.kind === "ul") cur.items.push(nested[1])
      else {
        flush()
        list = { kind: "ul", items: [nested[1]] }
      }
    } else if (bullet) {
      const ul: UlBlock = list?.kind === "ul" ? list : { kind: "ul", items: [] }
      if (ul !== list) {
        flush()
        list = ul
      }
      ul.items.push(bullet[1])
    } else {
      flush()
      blocks.push({ kind: "p", text: line })
    }
  }
  flush()
  return blocks
}

function Markdown({ source }: { source: string }) {
  return (
    <>
      {parseMarkdown(source).map((b, i) => {
        switch (b.kind) {
          case "h":
            if (b.level === 1) return <h1 key={i} className="mb-2 text-lg font-semibold">{inline(b.text)}</h1>
            if (b.level === 2) return <h2 key={i} className="mb-2 mt-5 text-base font-semibold">{inline(b.text)}</h2>
            return <h3 key={i} className="mb-1.5 mt-4 text-sm font-semibold">{inline(b.text)}</h3>
          case "p":
            return <p key={i} className="mb-3 text-muted-foreground">{inline(b.text)}</p>
          case "hr":
            return <hr key={i} className="my-4 border-border" />
          case "ol":
            return (
              <ol key={i} className="mb-3 list-decimal space-y-1.5 pl-6">
                {b.items.map((it, j) => (
                  <li key={j}>
                    {inline(it.text)}
                    {it.subs.length > 0 && (
                      <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                        {it.subs.map((s, k) => <li key={k}>{inline(s)}</li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )
          case "ul":
            return (
              <ul key={i} className="mb-3 list-disc space-y-0.5 pl-6">
                {b.items.map((s, j) => <li key={j}>{inline(s)}</li>)}
              </ul>
            )
        }
      })}
    </>
  )
}

/* ----------------------------------------------------------------- Data */

function DataTab({ model, procs, setSelection }: { model: Model; procs: Process[]; setSelection: (s: Selection) => void }) {
  const multi = procs.length > 1
  const where = (p: Process) => (multi ? `${p.name}: ` : "")
  const isSystemNode = (n: Node) => n.type === "system" || n.type === "tool"

  // 1. Systems used, each with the steps that touch it.
  const systems = new Map<string, Set<string>>()
  const addUse = (name: string, step?: string) => {
    const set = systems.get(name) ?? new Set<string>()
    if (step) set.add(step)
    systems.set(name, set)
  }
  for (const p of procs) {
    const doc = p.doc
    for (const n of doc.nodes) {
      const name = n.systemId ? systemById(model, n.systemId)?.name ?? n.label : n.label
      if (isSystemNode(n)) {
        addUse(name)
        for (const c of doc.connections) {
          const otherId = c.from === n.id ? c.to : c.to === n.id ? c.from : null
          const other = otherId ? doc.nodes.find((x) => x.id === otherId) : undefined
          if (other && !isSystemNode(other) && other.type !== "note") addUse(name, where(p) + other.label)
        }
      } else if (n.systemId) {
        addUse(name, where(p) + n.label)
      }
    }
  }

  // 2. What moves between people.
  const moves = procs.flatMap((p) => handoffs(p.doc).map((h) => ({ ...h, p })))
  const what = (c: Connection) => c.payload?.trim() || (c.dataObjectIds ?? []).map((id) => dataObjectById(model, id)?.name).filter(Boolean).join(", ") || "Not said"
  const trigger = (c: Connection) => c.trigger?.trim() || (c.triggerKind && c.triggerKind !== "unknown" ? TRIGGER_META[c.triggerKind].label : "Not said")

  // 3. Data in / out per step.
  const names = (ids?: string[]) => (ids ?? []).map((id) => dataObjectById(model, id)?.name ?? id)
  const dataSteps: { p: Process; n: Node }[] = procs.flatMap((p) => outlineOrder(p.doc).filter((n) => (n.dataIn?.length ?? 0) + (n.dataOut?.length ?? 0) > 0).map((n) => ({ p, n })))

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-5 text-sm">
        <Section title="Systems used" hint="The tools and software this stage runs on.">
          {systems.size === 0 ? (
            <p className="text-muted-foreground">No systems recorded yet. Tell the AI which tools people use here, like email, a spreadsheet, or a booking app.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {[...systems].map(([name, steps]) => (
                <li key={name} className="rounded-lg border border-border bg-card px-3 py-2">
                  <div className="font-medium">{name}</div>
                  <div className="text-xs text-muted-foreground">{steps.size ? `Used in: ${[...steps].join(", ")}` : "Not linked to a step yet"}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="What moves between people" hint="Every time work passes from one person to another. Red means someone carries it by hand.">
          {moves.length === 0 ? (
            <p className="text-muted-foreground">No handoffs yet. Once two different people do steps here, what passes between them shows up here.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">From → To</th>
                    <th className="px-3 py-2 font-medium">At step</th>
                    <th className="px-3 py-2 font-medium">Channel</th>
                    <th className="px-3 py-2 font-medium">Done by</th>
                    <th className="px-3 py-2 font-medium">What moves</th>
                    <th className="px-3 py-2 font-medium">They know because</th>
                  </tr>
                </thead>
                <tbody>
                  {moves.map(({ edge, to, fromLane, toLane, p }) => {
                    const manual = isManualEdge(edge)
                    return (
                      <tr key={edge.id} onClick={() => setSelection({ kind: "edge", id: edge.id })} className={cn("cursor-pointer border-b border-border last:border-0 hover:bg-primary/5", manual && "text-red-600")}>
                        <td className="px-3 py-2 font-medium">{fromLane.actor} → {toLane.actor}</td>
                        <td className="px-3 py-2">{where(p)}{to.label}</td>
                        <td className="px-3 py-2">{CHANNEL_META[edge.channel].label}</td>
                        <td className="px-3 py-2">{EXECUTION_META[edge.execution].label}{manual && " (manual)"}</td>
                        <td className="px-3 py-2">{what(edge)}</td>
                        <td className="px-3 py-2">{trigger(edge)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Data in and out per step" hint="What each step needs and what it produces.">
          {dataSteps.length === 0 ? (
            <p className="text-muted-foreground">No step has data recorded yet. Tell the AI what a step needs (an order, a quote) and what it produces.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {dataSteps.map(({ p, n }) => (
                <li key={n.id} onClick={() => setSelection({ kind: "node", id: n.id })} className="cursor-pointer rounded-lg border border-border bg-card px-3 py-2 hover:border-primary">
                  <div className="font-medium">{where(p)}{n.label}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                    {(n.dataIn?.length ?? 0) > 0 && <span>In: {names(n.dataIn).join(", ")}</span>}
                    {(n.dataOut?.length ?? 0) > 0 && <span>Out: {names(n.dataOut).join(", ")}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      {children}
    </section>
  )
}
