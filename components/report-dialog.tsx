"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { FileText, Download, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Model } from "@/lib/model"
import type { Finding } from "@/lib/findings"
import { generateReport, reportMarkdown } from "@/lib/reports"

interface ReportDialogProps {
  model: Model
  findings: Finding[]
}

/** Documentation derived from the model. Unknowns are printed as UNKNOWN, never invented. */
export function ReportDialog({ model, findings }: ReportDialogProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState("summary")
  const [copied, setCopied] = useState(false)
  const sections = useMemo(() => (open ? generateReport(model, findings) : []), [open, model, findings])
  const current = sections.find((s) => s.id === active) ?? sections[0]

  const download = () => {
    const blob = new Blob([reportMarkdown(sections)], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${model.company.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-current-state.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(current?.markdown ?? "")
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-transparent">
          <FileText className="h-4 w-4" />
          Report
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[80vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Current-state documentation</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 gap-3">
          <nav className="w-40 shrink-0 space-y-0.5">
            {sections.map((s) => (
              <button key={s.id} type="button" onClick={() => setActive(s.id)} className={cn("block w-full rounded-md px-2 py-1.5 text-left text-sm", current?.id === s.id ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>
                {s.title}
              </button>
            ))}
            <div className="pt-3">
              <Button variant="outline" size="sm" className="w-full" onClick={download}><Download className="mr-1 h-3 w-3" /> All (.md)</Button>
            </div>
          </nav>
          <div className="relative min-w-0 flex-1 overflow-auto rounded-md border border-border bg-muted/30 p-4">
            <Button variant="ghost" size="sm" className="absolute right-2 top-2" onClick={copy}>{copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}</Button>
            <Markdown text={current?.markdown ?? ""} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Minimal markdown renderer: headings, lists, tables, bold, checkboxes. Good enough for generated reports. */
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n")
  const out: React.ReactNode[] = []
  let i = 0
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, k) =>
      part.startsWith("**") ? <strong key={k} className={part.includes("UNKNOWN") ? "text-red-600" : undefined}>{part.slice(2, -2)}</strong> : part.startsWith("_") && part.endsWith("_") ? <em key={k} className="text-muted-foreground">{part.slice(1, -1)}</em> : part,
    )
  while (i < lines.length) {
    const l = lines[i]
    if (l.startsWith("|")) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!/^\|[\s-|]+\|$/.test(lines[i])) rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()))
        i++
      }
      out.push(
        <div key={i} className="my-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr>{rows[0]?.map((c, k) => <th key={k} className="border-b border-border px-2 py-1 text-left font-medium">{c}</th>)}</tr></thead>
            <tbody>{rows.slice(1).map((r, ri) => <tr key={ri}>{r.map((c, k) => <td key={k} className="border-b border-border/50 px-2 py-1 align-top">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      )
      continue
    }
    if (/^#{1,3} /.test(l)) {
      const level = l.match(/^#+/)![0].length
      const t = l.replace(/^#+ /, "")
      out.push(level === 1 ? <h1 key={i} className="mb-2 text-lg font-semibold">{t}</h1> : level === 2 ? <h2 key={i} className="mb-1 mt-4 text-base font-semibold">{t}</h2> : <h3 key={i} className="mb-1 mt-3 text-sm font-semibold">{t}</h3>)
    } else if (/^\s*(\d+\.|-) /.test(l)) {
      const indent = l.match(/^\s*/)![0].length
      const body = l.replace(/^\s*(\d+\.|-) /, "")
      const num = l.match(/^\s*(\d+)\./)?.[1]
      out.push(
        <div key={i} className="flex gap-2 text-sm leading-relaxed" style={{ paddingLeft: indent * 6 }}>
          <span className="shrink-0 text-muted-foreground">{num ? `${num}.` : "•"}</span>
          <span>{inline(body.replace(/^\[ \] /, "☐ "))}</span>
        </div>,
      )
    } else if (l.trim() === "---") out.push(<hr key={i} className="my-3 border-border" />)
    else if (l.trim()) out.push(<p key={i} className="my-1 text-sm leading-relaxed">{inline(l)}</p>)
    i++
  }
  return <div>{out}</div>
}
