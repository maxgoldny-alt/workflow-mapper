"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, ArrowRight, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  CHANNEL_META,
  EXECUTION_META,
  INTEGRATION_META,
  handoffs,
  isManualEdge,
  processById,
  type Model,
  type Ref,
} from "@/lib/model"
import { RULE_META, type Finding } from "@/lib/findings"
import { channelIcons } from "./toolbar"

type Tab = "handoffs" | "findings" | "questions"

interface BottomTrayProps {
  model: Model
  findings: Finding[]
  /** Restrict to this process when set; otherwise the whole company. */
  processId?: string
  selectedEdgeId: string | null
  onSelectRef: (ref: Ref) => void
  onAnswerQuestion: (id: string, answer: string) => void
  onDismissQuestion: (id: string) => void
}

/**
 * Collapsible tray under the map: Handoffs | Findings | Questions. Shows a
 * one-line summary when closed so it costs almost no space.
 */
export function BottomTray({ model, findings, processId, selectedEdgeId, onSelectRef, onAnswerQuestion, onDismissQuestion }: BottomTrayProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>("handoffs")

  const procs = processId ? model.processes.filter((p) => p.id === processId) : model.processes
  const rows = procs.flatMap((p) => handoffs(p.doc).map((h) => ({ ...h, process: p })))
  const manual = rows.filter((r) => isManualEdge(r.edge)).length
  const fs = findings.filter((f) => f.rule !== "unresolved-question" && (!processId || f.ref.processId === processId))
  const qs = model.questions.filter((q) => q.status === "open" && (!processId || q.ref.processId === processId))

  const tabs: { id: Tab; label: string; count: number; accent?: string }[] = [
    { id: "handoffs", label: "Handoffs", count: rows.length, accent: manual ? `${manual} manual` : undefined },
    { id: "findings", label: "Findings", count: fs.length },
    { id: "questions", label: "Questions", count: qs.length },
  ]

  return (
    <div className="shrink-0 border-t border-border bg-card">
      <div className="flex items-center gap-1 px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id)
              setOpen(open && tab === t.id ? false : true)
            }}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-2 py-1.5 text-xs",
              open && tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="font-medium">{t.label}</span>
            <span className="rounded-full bg-muted px-1.5 text-[10px]">{t.count}</span>
            {t.accent && <span className="text-[10px] text-red-600">{t.accent}</span>}
          </button>
        ))}
        <button type="button" onClick={() => setOpen((o) => !o)} className="ml-auto p-1.5 text-muted-foreground hover:text-foreground">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {open && (
        <div className="max-h-60 overflow-auto border-t border-border">
          {tab === "handoffs" && (
            rows.length === 0 ? (
              <Empty>No handoffs yet. Connect a step in one lane to a step in another.</Empty>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card text-left text-[11px] text-muted-foreground">
                  <tr>
                    {!processId && <th className="px-3 py-1.5 font-medium">Process</th>}
                    <th className="px-3 py-1.5 font-medium">From</th>
                    <th className="py-1.5 font-medium">To</th>
                    <th className="py-1.5 font-medium">Channel</th>
                    <th className="py-1.5 font-medium">Execution</th>
                    <th className="py-1.5 font-medium">Integration</th>
                    <th className="py-1.5 font-medium">What moves</th>
                    <th className="py-1.5 pr-3 font-medium">Trigger</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ edge, from, to, fromLane, toLane, process }) => {
                    const Icon = channelIcons[edge.channel]
                    const exec = EXECUTION_META[edge.execution]
                    return (
                      <tr
                        key={edge.id}
                        onClick={() => onSelectRef({ processId: process.id, connectionId: edge.id })}
                        className={cn("cursor-pointer border-t border-border/60 hover:bg-muted/50", selectedEdgeId === edge.id && "bg-primary/10")}
                      >
                        {!processId && <td className="px-3 py-1.5 text-muted-foreground">{process.name}</td>}
                        <td className="px-3 py-1.5">
                          <span className="font-medium" style={{ color: fromLane.color }}>{fromLane.actor}</span>
                          <span className="text-muted-foreground"> · {from.label}</span>
                        </td>
                        <td className="py-1.5">
                          <span className="inline-flex items-center gap-1">
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium" style={{ color: toLane.color }}>{toLane.actor}</span>
                            <span className="text-muted-foreground"> · {to.label}</span>
                          </span>
                        </td>
                        <td className="py-1.5">
                          <span className="inline-flex items-center gap-1">
                            <Icon className="h-3 w-3" /> {CHANNEL_META[edge.channel].label}
                          </span>
                        </td>
                        <td className="py-1.5">
                          <span className="rounded-full border px-1.5 py-0.5" style={{ color: exec.color, borderColor: `${exec.color}66` }}>{exec.label}</span>
                        </td>
                        <td className="py-1.5 text-muted-foreground">{INTEGRATION_META[edge.integration].label}</td>
                        <td className="py-1.5 text-muted-foreground">{edge.payload || "—"}</td>
                        <td className="max-w-[220px] truncate py-1.5 pr-3 text-muted-foreground">{edge.trigger || "—"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          )}

          {tab === "findings" && (
            fs.length === 0 ? (
              <Empty>No findings. Findings come from the structure of the map and recorded facts, not from guesses.</Empty>
            ) : (
              <ul className="divide-y divide-border/60">
                {fs.map((f) => (
                  <li key={f.id} onClick={() => onSelectRef(f.ref)} className="flex cursor-pointer items-start gap-3 px-3 py-1.5 text-xs hover:bg-muted/50">
                    <span
                      className={cn("mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium", f.level === "observation" ? "bg-amber-500/15 text-amber-700" : f.level === "potential" ? "bg-cyan-500/15 text-cyan-700" : "bg-emerald-500/15 text-emerald-700")}
                    >
                      {f.level}
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium">{f.title}</span>
                      <span className="text-muted-foreground"> — {f.detail}</span>
                      <span className="ml-2 text-[10px] text-muted-foreground/70">{RULE_META[f.rule].label}{f.ref.processId ? ` · ${processById(model, f.ref.processId)?.name}` : ""}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )
          )}

          {tab === "questions" && (
            qs.length === 0 ? (
              <Empty>No open questions.</Empty>
            ) : (
              <ul className="divide-y divide-border/60">
                {qs.map((q) => (
                  <QuestionRow key={q.id} text={q.text} where={q.ref.processId ? processById(model, q.ref.processId)?.name : q.ref.areaId ? model.areas.find((a) => a.id === q.ref.areaId)?.name : undefined} onGo={() => onSelectRef(q.ref)} onAnswer={(a) => onAnswerQuestion(q.id, a)} onDismiss={() => onDismissQuestion(q.id)} />
                ))}
              </ul>
            )
          )}
        </div>
      )}
    </div>
  )
}

function QuestionRow({ text, where, onGo, onAnswer, onDismiss }: { text: string; where?: string; onGo: () => void; onAnswer: (a: string) => void; onDismiss: () => void }) {
  const [answer, setAnswer] = useState("")
  return (
    <li className="flex items-center gap-2 px-3 py-1.5 text-xs">
      <button type="button" onClick={onGo} className="min-w-0 flex-1 truncate text-left hover:underline" title={text}>
        {text}
        {where && <span className="ml-2 text-[10px] text-muted-foreground">{where}</span>}
      </button>
      <input
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && answer.trim()) {
            onAnswer(answer.trim())
            setAnswer("")
          }
        }}
        placeholder="Answer…"
        className="w-56 rounded border border-border bg-background px-2 py-1 text-xs outline-none"
      />
      <button type="button" disabled={!answer.trim()} onClick={() => { onAnswer(answer.trim()); setAnswer("") }} className="rounded p-1 text-emerald-600 hover:bg-muted disabled:opacity-30" title="Record answer">
        <Check className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onDismiss} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Dismiss">
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-3 text-xs text-muted-foreground">{children}</p>
}
