"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Download, Copy, Check, ImageIcon, FileCode } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  NODE_TYPE_META,
  EDGE_TYPE_META,
  NODE_W,
  NODE_H,
  type Node,
  type Connection,
  type Screen,
} from "@/lib/diagram-templates"

interface ExportDialogProps {
  nodes: Node[]
  connections: Connection[]
  screens: Screen[]
}

const getIconPaths = (type: string, color: string): string => {
  const sw = "stroke-width"
  const slc = "stroke-linecap"
  switch (type) {
    case "actor":
      return `
        <circle cx="12" cy="8" r="4" stroke="${color}" ${sw}="2" fill="none"/>
        <path d="M4 21v-1a7 7 0 0 1 14 0v1" stroke="${color}" ${sw}="2" fill="none" ${slc}="round"/>
      `
    case "step":
      return `
        <rect x="3" y="4" width="18" height="16" rx="2" stroke="${color}" ${sw}="2" fill="none"/>
        <line x1="7" y1="9" x2="17" y2="9" stroke="${color}" ${sw}="2" ${slc}="round"/>
        <line x1="7" y1="14" x2="14" y2="14" stroke="${color}" ${sw}="2" ${slc}="round"/>
      `
    case "decision":
      return `
        <path d="M12 3 L21 12 L12 21 L3 12 Z" stroke="${color}" ${sw}="2" fill="none"/>
      `
    case "tool":
      return `
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="${color}" ${sw}="2" fill="none"/>
      `
    case "system":
      return `
        <rect x="2" y="4" width="20" height="7" rx="2" stroke="${color}" ${sw}="2" fill="none"/>
        <rect x="2" y="13" width="20" height="7" rx="2" stroke="${color}" ${sw}="2" fill="none"/>
        <circle cx="6" cy="7.5" r="1" fill="${color}"/>
        <circle cx="6" cy="16.5" r="1" fill="${color}"/>
      `
    default:
      return `<rect x="4" y="4" width="16" height="16" rx="2" stroke="${color}" ${sw}="2" fill="none"/>`
  }
}

function generateMermaid(nodes: Node[], connections: Connection[], screens: Screen[]): string {
  const lines: string[] = ["graph LR"]

  const formatNodeLabel = (node: Node) => {
    const text = node.sublabel ? `${node.label}<br>${node.sublabel}` : node.label
    if (node.type === "decision") return `${node.id}{"${text}"}`
    return `${node.id}["${text}"]`
  }

  const grouped = new Set<string>()
  screens.forEach((screen) => {
    const screenNodes = nodes.filter((n) => n.screen === screen.id)
    if (screenNodes.length === 0) return
    lines.push(`  subgraph ${screen.id}["${screen.title}"]`)
    lines.push("    direction TB")
    screenNodes.forEach((node) => {
      lines.push(`    ${formatNodeLabel(node)}`)
      grouped.add(node.id)
    })
    lines.push("  end")
    lines.push("")
  })

  nodes
    .filter((n) => !grouped.has(n.id))
    .forEach((node) => {
      lines.push(`  ${formatNodeLabel(node)}`)
    })

  lines.push("")

  connections.forEach((conn) => {
    const arrow = conn.type === "data" || conn.type === "uses" ? "-.->" : "-->"
    const label = conn.label || (conn.type === "yes" ? "Yes" : conn.type === "no" ? "No" : undefined)
    if (label) {
      lines.push(`  ${conn.from} ${arrow}|"${label}"| ${conn.to}`)
    } else {
      lines.push(`  ${conn.from} ${arrow} ${conn.to}`)
    }
  })

  return lines.join("\n")
}

function generateJSON(nodes: Node[], connections: Connection[], screens: Screen[]): string {
  return JSON.stringify({ nodes, connections, screens }, null, 2)
}

function generateSVG(nodes: Node[], connections: Connection[], screens: Screen[]): string {
  const NODE_WIDTH = NODE_W
  const NODE_HEIGHT = NODE_H
  const PADDING = 50

  // SVG attribute names (using variables to prevent auto-fix from converting to camelCase)
  const ta = "text-anchor"
  const fs = "font-size"
  const ff = "font-family"
  const fw = "font-weight"
  const sw = "stroke-width"
  const sda = "stroke-dasharray"

  if (nodes.length === 0 && screens.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#0a0a0a"/><text x="200" y="100" fill="#888" ${ta}="middle" ${ff}="system-ui, sans-serif">Empty workflow</text></svg>`
  }

  const minX = Math.min(...nodes.map((n) => n.x), ...screens.map((s) => s.x), 0) - PADDING
  const minY = Math.min(...nodes.map((n) => n.y), ...screens.map((s) => s.y), 0) - PADDING
  const maxX = Math.max(...nodes.map((n) => n.x + NODE_WIDTH), ...screens.map((s) => s.x + s.width), 400) + PADDING
  const maxY = Math.max(...nodes.map((n) => n.y + NODE_HEIGHT), ...screens.map((s) => s.y + s.height), 300) + PADDING

  const width = maxX - minX
  const height = maxY - minY

  const svgParts: string[] = []

  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">`,
  )

  // Background
  svgParts.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#0a0a0a"/>`)

  // Grid pattern
  svgParts.push(`<defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#333" ${sw}="0.5"/>
  </pattern>`)

  // Arrowhead markers per edge type
  Object.entries(EDGE_TYPE_META).forEach(([type, meta]) => {
    svgParts.push(`<marker id="arrow-${type}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${meta.color}"/>
    </marker>`)
  })
  svgParts.push(`</defs>`)
  svgParts.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#grid)" opacity="0.3"/>`)

  // Screens
  screens.forEach((sg) => {
    svgParts.push(`<rect x="${sg.x}" y="${sg.y}" width="${sg.width}" height="${sg.height}"
      fill="none" stroke="#6366f1" ${sw}="1" ${sda}="4 4" rx="8" opacity="0.5"/>`)
    svgParts.push(
      `<text x="${sg.x + 10}" y="${sg.y + 20}" fill="#6366f1" ${fs}="14" ${ff}="system-ui, sans-serif">${escapeXml(sg.title)}</text>`,
    )
  })

  // Connections
  connections.forEach((conn) => {
    const fromNode = nodes.find((n) => n.id === conn.from)
    const toNode = nodes.find((n) => n.id === conn.to)
    if (!fromNode || !toNode) return

    const fromX = fromNode.x + NODE_WIDTH / 2
    const fromY = fromNode.y + NODE_HEIGHT / 2
    const toX = toNode.x + NODE_WIDTH / 2
    const toY = toNode.y + NODE_HEIGHT / 2

    const meta = EDGE_TYPE_META[conn.type]
    const color = meta?.color || "#888"
    const dash = meta?.dash

    const midX = (fromX + toX) / 2
    const midY = (fromY + toY) / 2
    const dx = toX - fromX
    const dy = toY - fromY
    const dist = Math.sqrt(dx * dx + dy * dy)
    const offset = Math.min(50, dist / 4)
    const perpX = dist > 0 ? (-dy / dist) * offset : 0
    const perpY = dist > 0 ? (dx / dist) * offset : 0

    svgParts.push(`<path d="M ${fromX} ${fromY} Q ${midX + perpX} ${midY + perpY} ${toX} ${toY}"
      fill="none" stroke="${color}" ${sw}="2" ${dash ? `${sda}="${dash}"` : ""} marker-end="url(#arrow-${conn.type})"/>`)

    if (conn.label) {
      svgParts.push(
        `<text x="${midX + perpX / 2}" y="${midY + perpY / 2 - 5}" fill="#888" ${fs}="10" ${ff}="system-ui, sans-serif" ${ta}="middle">${escapeXml(conn.label)}</text>`,
      )
    }
  })

  // Nodes
  nodes.forEach((node) => {
    const color = NODE_TYPE_META[node.type]?.color || "#888"
    const iconScale = 1.5
    const iconSize = 24 * iconScale
    const iconX = node.x + NODE_WIDTH / 2 - iconSize / 2
    const iconY = node.y + 6

    // Node background
    svgParts.push(`<rect x="${node.x}" y="${node.y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}"
      fill="#1a1a1a" stroke="${color}" ${sw}="2" rx="8" ${node.type === "decision" ? `${sda}="6 4"` : ""}/>`)

    // Icon - centered horizontally
    svgParts.push(
      `<g transform="translate(${iconX}, ${iconY}) scale(${iconScale})">${getIconPaths(node.type, color)}</g>`,
    )

    // Labels - centered using text-anchor middle
    const labelY = node.y + (node.sublabel ? 52 : 56)
    svgParts.push(`<text x="${node.x + NODE_WIDTH / 2}" y="${labelY}"
      fill="#fff" ${fs}="11" ${ff}="system-ui, sans-serif" ${ta}="middle" ${fw}="bold">${escapeXml(node.label)}</text>`)
    if (node.sublabel) {
      svgParts.push(`<text x="${node.x + NODE_WIDTH / 2}" y="${node.y + 64}"
        fill="#888" ${fs}="9" ${ff}="system-ui, sans-serif" ${ta}="middle">${escapeXml(node.sublabel)}</text>`)
    }
  })

  svgParts.push("</svg>")
  return svgParts.join("\n")
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export function ExportDialog({ nodes, connections, screens }: ExportDialogProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const mermaidCode = generateMermaid(nodes, connections, screens)
  const jsonCode = generateJSON(nodes, connections, screens)

  const handleCopy = async (content: string, type: string) => {
    await navigator.clipboard.writeText(content)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleDownload = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleExportPNG = async () => {
    setIsExporting(true)
    try {
      const svgContent = generateSVG(nodes, connections, screens)

      const parser = new DOMParser()
      const svgDoc = parser.parseFromString(svgContent, "image/svg+xml")
      const svgEl = svgDoc.querySelector("svg")

      if (!svgEl) throw new Error("Invalid SVG")

      const svgWidth = Number.parseInt(svgEl.getAttribute("width") || "800")
      const svgHeight = Number.parseInt(svgEl.getAttribute("height") || "600")

      const canvas = document.createElement("canvas")
      const scale = 2
      canvas.width = svgWidth * scale
      canvas.height = svgHeight * scale
      const ctx = canvas.getContext("2d")

      if (!ctx) throw new Error("Failed to get canvas context")

      const base64 = btoa(unescape(encodeURIComponent(svgContent)))
      const dataUrl = `data:image/svg+xml;base64,${base64}`

      const img = new Image()
      img.crossOrigin = "anonymous"

      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          ctx.scale(scale, scale)
          ctx.drawImage(img, 0, 0, svgWidth, svgHeight)
          resolve()
        }
        img.onerror = () => {
          reject(new Error("Failed to load SVG image"))
        }
        img.src = dataUrl
      })

      canvas.toBlob((blob) => {
        if (blob) {
          const pngUrl = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = pngUrl
          a.download = "workflow-map.png"
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(pngUrl)
        }
      }, "image/png")
    } catch (error) {
      console.error("Failed to export PNG:", error)
      alert("Failed to export PNG. Please try SVG export instead.")
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportSVG = () => {
    const svgContent = generateSVG(nodes, connections, screens)
    handleDownload(svgContent, "workflow-map.svg", "image/svg+xml")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-transparent">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Export Workflow</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="image" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="image" className="gap-2">
              <ImageIcon className="w-4 h-4" />
              Image
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-2">
              <FileCode className="w-4 h-4" />
              Code
            </TabsTrigger>
          </TabsList>

          <TabsContent value="image" className="flex-1 overflow-auto space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-border/50 bg-muted/30 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded bg-primary/20 flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">PNG Image</h4>
                    <p className="text-xs text-muted-foreground">High-resolution raster image</p>
                  </div>
                </div>
                <Button className="w-full" onClick={handleExportPNG} disabled={isExporting}>
                  <Download className="w-4 h-4 mr-2" />
                  {isExporting ? "Exporting..." : "Download PNG"}
                </Button>
              </div>

              <div className="p-4 rounded-lg border border-border/50 bg-muted/30 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded bg-accent/20 flex items-center justify-center">
                    <FileCode className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h4 className="font-medium">SVG Vector</h4>
                    <p className="text-xs text-muted-foreground">Scalable vector graphics</p>
                  </div>
                </div>
                <Button className="w-full" variant="secondary" onClick={handleExportSVG}>
                  <Download className="w-4 h-4 mr-2" />
                  Download SVG
                </Button>
              </div>
            </div>

            <div className="p-4 rounded-lg border border-border/50 bg-muted/20">
              <h4 className="text-sm font-medium mb-2">Preview</h4>
              <div
                className="bg-background rounded overflow-auto max-h-64"
                dangerouslySetInnerHTML={{ __html: generateSVG(nodes, connections, screens) }}
              />
            </div>
          </TabsContent>

          <TabsContent value="code" className="flex-1 overflow-auto space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Mermaid Format</h4>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleCopy(mermaidCode, "mermaid")}>
                    {copied === "mermaid" ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                    {copied === "mermaid" ? "Copied!" : "Copy"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(mermaidCode, "workflow.mmd", "text/plain")}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
              <pre className="p-3 rounded bg-muted text-xs overflow-auto max-h-48 font-mono">{mermaidCode}</pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">JSON Format</h4>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleCopy(jsonCode, "json")}>
                    {copied === "json" ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                    {copied === "json" ? "Copied!" : "Copy"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(jsonCode, "workflow.json", "application/json")}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
              <pre className="p-3 rounded bg-muted text-xs overflow-auto max-h-48 font-mono">{jsonCode}</pre>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
