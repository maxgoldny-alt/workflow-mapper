"use client"

import { useState } from "react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Download, Copy, Check, ImageIcon, FileCode } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  NODE_TYPE_META,
  EDGE_TYPE_META,
  EXECUTION_META,
  CHANNEL_META,
  NODE_W,
  NODE_H,
  LANE_HEADER_W,
  isHandoff,
  type Doc,
  type Model,
  type Node,
  type Process,
} from "@/lib/model"
import { laneBoxes, lanesWidth, lanesHeight } from "@/lib/geometry"

interface ExportDialogProps {
  model: Model
  process?: Process
  workspaceName: string
}

const getIconPaths = (type: string, color: string): string => {
  const sw = "stroke-width"
  const slc = "stroke-linecap"
  switch (type) {
    case "step":
      return `<rect x="3" y="4" width="18" height="16" rx="2" stroke="${color}" ${sw}="2" fill="none"/><line x1="7" y1="9" x2="17" y2="9" stroke="${color}" ${sw}="2" ${slc}="round"/><line x1="7" y1="14" x2="14" y2="14" stroke="${color}" ${sw}="2" ${slc}="round"/>`
    case "decision":
      return `<path d="M12 3 L21 12 L12 21 L3 12 Z" stroke="${color}" ${sw}="2" fill="none"/>`
    case "trigger":
      return `<path d="M13 2 L3 14 L12 14 L11 22 L21 10 L12 10 Z" stroke="${color}" ${sw}="2" fill="none"/>`
    case "tool":
      return `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="${color}" ${sw}="2" fill="none"/>`
    case "system":
      return `<rect x="2" y="4" width="20" height="7" rx="2" stroke="${color}" ${sw}="2" fill="none"/><rect x="2" y="13" width="20" height="7" rx="2" stroke="${color}" ${sw}="2" fill="none"/><circle cx="6" cy="7.5" r="1" fill="${color}"/><circle cx="6" cy="16.5" r="1" fill="${color}"/>`
    default:
      return ""
  }
}

const escapeXml = (str: string) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, "_")

export function generateMermaid(doc: Doc): string {
  const lines: string[] = ["flowchart LR"]
  const fmt = (n: Node) => {
    const text = n.sublabel ? `${n.label}<br>${n.sublabel}` : n.label
    if (n.type === "decision") return `${safeId(n.id)}{"${text}"}`
    if (n.type === "trigger") return `${safeId(n.id)}(["${text}"])`
    if (n.type === "note") return `${safeId(n.id)}>"${text}"]`
    return `${safeId(n.id)}["${text}"]`
  }
  doc.lanes.forEach((lane) => {
    const inLane = doc.nodes.filter((n) => n.lane === lane.id)
    if (!inLane.length) return
    lines.push(`  subgraph ${safeId(lane.id)}["${lane.actor}"]`, "    direction LR")
    inLane.forEach((n) => lines.push(`    ${fmt(n)}`))
    lines.push("  end")
  })
  lines.push("")
  doc.connections.forEach((c) => {
    const dashed = c.type === "data" || c.type === "uses" || !!EXECUTION_META[c.execution].dash
    const arrow = dashed ? "-.->" : "-->"
    const parts = [c.label, c.type === "yes" && !c.label ? "Yes" : c.type === "no" && !c.label ? "No" : undefined]
    if (isHandoff(doc, c)) parts.push(`[${CHANNEL_META[c.channel].label} · ${EXECUTION_META[c.execution].label}${c.payload ? `: ${c.payload}` : ""}]`)
    const label = parts.filter(Boolean).join(" ")
    lines.push(label ? `  ${safeId(c.from)} ${arrow}|"${label}"| ${safeId(c.to)}` : `  ${safeId(c.from)} ${arrow} ${safeId(c.to)}`)
  })
  return lines.join("\n")
}

/** Company overview as Mermaid: areas and the links between them. */
export function generateOverviewMermaid(model: Model): string {
  const lines = ["flowchart LR"]
  for (const a of [...model.areas].sort((x, y) => x.order - y.order)) lines.push(`  ${safeId(a.id)}["${a.name}"]`)
  for (const l of model.areaLinks) lines.push(l.label || l.payload ? `  ${safeId(l.from)} -->|"${l.label || l.payload}"| ${safeId(l.to)}` : `  ${safeId(l.from)} --> ${safeId(l.to)}`)
  return lines.join("\n")
}

export const generateJSON = (model: Model, name: string) => JSON.stringify({ version: 5, name, model }, null, 2)

interface Palette { bg: string; card: string; text: string; muted: string; laneLine: string }
const LIGHT: Palette = { bg: "#fafafa", card: "#ffffff", text: "#171717", muted: "#737373", laneLine: "#d4d4d4" }
const DARK: Palette = { bg: "#0a0a0a", card: "#171717", text: "#fafafa", muted: "#a3a3a3", laneLine: "#333333" }

export function generateSVG(doc: Doc, dark: boolean): string {
  const p = dark ? DARK : LIGHT
  const PAD = 24
  const ta = "text-anchor", fs = "font-size", fw = "font-weight", sw = "stroke-width", sda = "stroke-dasharray"
  const font = `font-family="system-ui, sans-serif"`
  const boxes = laneBoxes(doc.lanes)
  const width = Math.max(600, lanesWidth(doc)) + PAD * 2
  const height = Math.max(200, lanesHeight(doc.lanes)) + PAD * 2
  const out: string[] = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-PAD} ${-PAD} ${width} ${height}" width="${width}" height="${height}">`)
  out.push(`<rect x="${-PAD}" y="${-PAD}" width="${width}" height="${height}" fill="${p.bg}"/>`)
  out.push(`<defs>`)
  Object.entries(EDGE_TYPE_META).forEach(([type, meta]) => out.push(`<marker id="arrow-${type}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${meta.color}"/></marker>`))
  out.push(`</defs>`)
  const laneW = width - PAD * 2
  boxes.forEach((l) => {
    const color = l.color ?? "#64748b"
    out.push(`<rect x="0" y="${l.top}" width="${laneW}" height="${l.height}" fill="${color}" fill-opacity="0.06" stroke="${p.laneLine}" ${sw}="1"/>`)
    out.push(`<rect x="0" y="${l.top}" width="${LANE_HEADER_W}" height="${l.height}" fill="${p.card}" stroke="${p.laneLine}" ${sw}="1"/>`)
    out.push(`<rect x="0" y="${l.top}" width="5" height="${l.height}" fill="${color}"/>`)
    out.push(`<text x="16" y="${l.top + l.height / 2 + 4}" fill="${p.text}" ${fs}="12" ${fw}="600" ${font}>${escapeXml(l.actor)}</text>`)
  })
  doc.connections.forEach((c) => {
    const a = doc.nodes.find((n) => n.id === c.from)
    const b = doc.nodes.find((n) => n.id === c.to)
    if (!a || !b) return
    const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H / 2, x2 = b.x + NODE_W / 2, y2 = b.y + NODE_H / 2
    const bend = Math.max(Math.abs(x2 - x1) * 0.4, Math.abs(y2 - y1) > Math.abs(x2 - x1) ? 0 : 24)
    const meta = EDGE_TYPE_META[c.type]
    const exec = EXECUTION_META[c.execution]
    out.push(`<path d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}" fill="none" stroke="${meta.color}" ${sw}="2" ${exec.dash ? `${sda}="${exec.dash}"` : ""} marker-end="url(#arrow-${c.type})"/>`)
    const handoff = isHandoff(doc, c)
    const text = c.label || (handoff ? CHANNEL_META[c.channel].label.toLowerCase() : "")
    if (text) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
      const w = text.length * 6 + 16
      out.push(`<rect x="${mx - w / 2}" y="${my - 9}" width="${w}" height="18" rx="9" fill="${p.card}" stroke="${handoff ? exec.color : meta.color}" ${sw}="1"/>`)
      out.push(`<text x="${mx}" y="${my + 4}" fill="${p.text}" ${fs}="10" ${ta}="middle" ${font}>${escapeXml(text)}</text>`)
    }
  })
  doc.nodes.forEach((n) => {
    const color = NODE_TYPE_META[n.type].color
    const cx = n.x + NODE_W / 2
    if (n.type === "note") {
      out.push(`<rect x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="2" fill="#fef3c7"/>`)
      out.push(`<text x="${cx}" y="${n.y + 40}" fill="#713f12" ${fs}="11" ${fw}="600" ${ta}="middle" ${font}>${escapeXml(n.label)}</text>`)
      if (n.sublabel) out.push(`<text x="${cx}" y="${n.y + 56}" fill="#713f12" ${fs}="9" ${ta}="middle" ${font}>${escapeXml(n.sublabel)}</text>`)
      return
    }
    out.push(`<rect x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="${n.type === "trigger" ? 44 : 10}" fill="${p.card}" stroke="${color}" ${sw}="2" ${n.type === "decision" ? `${sda}="6 4"` : ""}/>`)
    out.push(`<g transform="translate(${cx - 12}, ${n.y + 10})">${getIconPaths(n.type, color)}</g>`)
    out.push(`<text x="${cx}" y="${n.y + (n.sublabel ? 54 : 58)}" fill="${p.text}" ${fs}="11" ${fw}="600" ${ta}="middle" ${font}>${escapeXml(n.label)}</text>`)
    if (n.sublabel) out.push(`<text x="${cx}" y="${n.y + 68}" fill="${p.muted}" ${fs}="9" ${ta}="middle" ${font}>${escapeXml(n.sublabel)}</text>`)
  })
  out.push("</svg>")
  return out.join("\n")
}

function download(content: Blob | string, filename: string, mimeType = "text/plain") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function ExportDialog({ model, process, workspaceName }: ExportDialogProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  const slug = (process?.name ?? workspaceName).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workflow"

  const mermaid = process ? generateMermaid(process.doc) : generateOverviewMermaid(model)
  const json = generateJSON(model, workspaceName)
  const svg = open && process ? generateSVG(process.doc, dark) : ""

  const copy = async (content: string, key: string) => {
    await navigator.clipboard.writeText(content)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const exportPNG = async () => {
    setBusy(true)
    try {
      const parsed = new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("svg")
      if (!parsed) throw new Error("Invalid SVG")
      const w = Number(parsed.getAttribute("width") || 800)
      const h = Number(parsed.getAttribute("height") || 600)
      const canvas = document.createElement("canvas")
      const scale = 2
      canvas.width = w * scale
      canvas.height = h * scale
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("No canvas context")
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => { ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, w, h); resolve() }
        img.onerror = () => reject(new Error("SVG failed to load"))
        img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
      })
      canvas.toBlob((blob) => blob && download(blob, `${slug}.png`), "image/png")
    } catch (err) {
      console.error(err)
      alert("PNG export failed. Try SVG instead.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-transparent">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Export {process ? process.name : workspaceName}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue={process ? "image" : "code"} className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="image" className="gap-2" disabled={!process}><ImageIcon className="h-4 w-4" />Image</TabsTrigger>
            <TabsTrigger value="code" className="gap-2"><FileCode className="h-4 w-4" />Code</TabsTrigger>
          </TabsList>
          <TabsContent value="image" className="mt-4 flex-1 space-y-4 overflow-auto">
            {process ? (
              <>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={exportPNG} disabled={busy}><Download className="mr-2 h-4 w-4" />{busy ? "Exporting…" : "Download PNG"}</Button>
                  <Button className="flex-1" variant="secondary" onClick={() => download(svg, `${slug}.svg`, "image/svg+xml")}><Download className="mr-2 h-4 w-4" />Download SVG</Button>
                </div>
                <div className="max-h-72 overflow-auto rounded border border-border" dangerouslySetInnerHTML={{ __html: svg }} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Open a process to export it as an image.</p>
            )}
          </TabsContent>
          <TabsContent value="code" className="mt-4 flex-1 space-y-4 overflow-auto">
            <CodeBlock title={process ? "Mermaid (this process)" : "Mermaid (overview)"} code={mermaid} copied={copied === "mermaid"} onCopy={() => copy(mermaid, "mermaid")} onDownload={() => download(mermaid, `${slug}.mmd`)} />
            <CodeBlock title="JSON (whole company)" code={json} copied={copied === "json"} onCopy={() => copy(json, "json")} onDownload={() => download(json, `${workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`, "application/json")} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function CodeBlock({ title, code, copied, onCopy, onDownload }: { title: string; code: string; copied: boolean; onCopy: () => void; onDownload: () => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{title}</h4>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCopy}>{copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}{copied ? "Copied" : "Copy"}</Button>
          <Button variant="outline" size="sm" onClick={onDownload}><Download className="mr-1 h-3 w-3" />Download</Button>
        </div>
      </div>
      <pre className="max-h-48 overflow-auto rounded bg-muted p-3 font-mono text-xs">{code}</pre>
    </div>
  )
}
