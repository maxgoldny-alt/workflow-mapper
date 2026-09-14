"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, ArrowUp, ArrowDown, Plus, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  NODE_TYPE_META,
  EDGE_TYPE_META,
  MECHANISM_META,
  NODE_TYPES,
  EDGE_TYPES,
  MECHANISMS,
  LANE_COLORS,
  isHandoff,
  laneById,
  nodeById,
  type Doc,
  type Node,
  type Connection,
  type Lane,
} from "@/lib/model"
import type { Template } from "@/lib/templates"
import { nodeIcons, mechanismIcons } from "./toolbar"

export type Selection = { kind: "node"; id: string } | { kind: "edge"; id: string } | { kind: "lane"; id: string } | null

interface InspectorProps {
  selection: Selection
  doc: Doc
  workflowName: string
  templates: Template[]
  onRenameWorkflow: (name: string) => void
  onDeleteWorkflow: () => void
  onLoadTemplate: (templateId: string) => void
  onAddLane: () => void
  onUpdateNode: (id: string, updates: Partial<Node>) => void
  onDeleteNode: (id: string) => void
  onUpdateConnection: (id: string, updates: Partial<Connection>) => void
  onDeleteConnection: (id: string) => void
  onUpdateLane: (id: string, updates: Partial<Lane>) => void
  onDeleteLane: (id: string) => void
  onMoveLane: (id: string, direction: -1 | 1) => void
}

const textareaClass =
  "w-full min-h-[64px] rounded-md border border-input bg-transparent px-2 py-1.5 text-xs shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"

export function Inspector({
  selection,
  doc,
  workflowName,
  templates,
  onRenameWorkflow,
  onDeleteWorkflow,
  onLoadTemplate,
  onAddLane,
  onUpdateNode,
  onDeleteNode,
  onUpdateConnection,
  onDeleteConnection,
  onUpdateLane,
  onDeleteLane,
  onMoveLane,
}: InspectorProps) {
  const node = selection?.kind === "node" ? nodeById(doc, selection.id) : undefined
  const edge = selection?.kind === "edge" ? doc.connections.find((c) => c.id === selection.id) : undefined
  const lane = selection?.kind === "lane" ? laneById(doc, selection.id) : undefined

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{node ? "Node" : edge ? "Edge" : lane ? "Actor lane" : "Workflow"}</h2>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        {!node && !edge && !lane && (
          <>
            <Field label="Name">
              <Input value={workflowName} onChange={(e) => onRenameWorkflow(e.target.value)} className="h-8 text-sm" />
            </Field>

            <Field label="Actors">
              <div className="space-y-1">
                {doc.lanes.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                    <span className="truncate">{l.actor}</span>
                    <span className="ml-auto text-muted-foreground">{doc.nodes.filter((n) => n.lane === l.id).length}</span>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={onAddLane}>
                <Plus className="mr-1.5 h-3 w-3" />
                Add actor lane
              </Button>
            </Field>

            <Field label="Start from a template" hint="Replaces everything on this canvas.">
              <Select value="" onValueChange={onLoadTemplate}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Replace contents…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
              Each lane is one actor. Drag a step into another lane to make the edge a handoff, then set how that
              handoff happens today. Double-click anything to rename it in place.
            </p>

            <Button variant="destructive" size="sm" className="w-full" onClick={onDeleteWorkflow}>
              <Trash2 className="mr-2 h-3 w-3" />
              Delete this workflow
            </Button>
          </>
        )}

        {node && (
          <>
            <Field label="Label">
              <Input value={node.label} onChange={(e) => onUpdateNode(node.id, { label: e.target.value })} className="h-8 text-sm" />
            </Field>

            <Field label={node.type === "note" ? "Body" : "Sublabel"}>
              <Input
                value={node.sublabel || ""}
                placeholder={node.type === "tool" || node.type === "system" ? "e.g. HubSpot" : "Optional"}
                onChange={(e) => onUpdateNode(node.id, { sublabel: e.target.value || undefined })}
                className="h-8 text-sm"
              />
            </Field>

            <Field label="Type">
              <div className="grid grid-cols-5 gap-1">
                {NODE_TYPES.map((t) => {
                  const Icon = nodeIcons[t]
                  const active = node.type === t
                  const color = NODE_TYPE_META[t].color
                  return (
                    <button
                      key={t}
                      type="button"
                      title={NODE_TYPE_META[t].label}
                      onClick={() => onUpdateNode(node.id, { type: t })}
                      className={cn(
                        "flex h-9 items-center justify-center rounded-md border transition-colors",
                        active ? "border-current" : "border-border text-muted-foreground hover:bg-muted",
                      )}
                      style={active ? { color, backgroundColor: `${color}1a`, borderColor: color } : undefined}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  )
                })}
              </div>
            </Field>

            <Field label="Actor">
              <p className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                {laneById(doc, node.lane)?.actor || "Drag it into a lane"}
              </p>
            </Field>

            <Field label="Notes">
              <textarea
                value={node.notes || ""}
                placeholder="What matters about this step, exceptions, who to ask…"
                onChange={(e) => onUpdateNode(node.id, { notes: e.target.value || undefined })}
                className={textareaClass}
              />
            </Field>

            <Button variant="destructive" size="sm" className="w-full" onClick={() => onDeleteNode(node.id)}>
              <Trash2 className="mr-2 h-3 w-3" />
              Delete node
            </Button>
          </>
        )}

        {edge && <EdgeFields doc={doc} edge={edge} onUpdate={onUpdateConnection} onDelete={onDeleteConnection} />}

        {lane && (
          <>
            <Field label="Actor">
              <Input value={lane.actor} onChange={(e) => onUpdateLane(lane.id, { actor: e.target.value })} className="h-8 text-sm" />
            </Field>

            <Field label="Colour">
              <div className="flex flex-wrap gap-1.5">
                {LANE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onUpdateLane(lane.id, { color: c })}
                    className={cn("h-6 w-6 rounded-full border-2", lane.color === c ? "border-foreground" : "border-transparent")}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </Field>

            <Field label="Order">
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => onMoveLane(lane.id, -1)} disabled={doc.lanes[0]?.id === lane.id}>
                  <ArrowUp className="mr-1 h-3 w-3" /> Up
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => onMoveLane(lane.id, 1)} disabled={doc.lanes[doc.lanes.length - 1]?.id === lane.id}>
                  <ArrowDown className="mr-1 h-3 w-3" /> Down
                </Button>
              </div>
            </Field>

            <p className="text-xs text-muted-foreground">
              {doc.nodes.filter((n) => n.lane === lane.id).length} node(s) in this lane. Deleting the lane moves them to the
              lane above.
            </p>

            <Button variant="destructive" size="sm" className="w-full" onClick={() => onDeleteLane(lane.id)} disabled={doc.lanes.length <= 1}>
              <Trash2 className="mr-2 h-3 w-3" />
              Delete lane
            </Button>
          </>
        )}
      </div>
    </aside>
  )
}

function EdgeFields({
  doc,
  edge,
  onUpdate,
  onDelete,
}: {
  doc: Doc
  edge: Connection
  onUpdate: (id: string, updates: Partial<Connection>) => void
  onDelete: (id: string) => void
}) {
  const from = nodeById(doc, edge.from)
  const to = nodeById(doc, edge.to)
  const handoff = isHandoff(doc, edge)
  const fromLane = from && laneById(doc, from.lane)
  const toLane = to && laneById(doc, to.lane)

  return (
    <>
      <div className="space-y-1 text-xs">
        <p className="flex items-center gap-1 text-muted-foreground">
          <span className="truncate">{from?.label}</span>
          <ArrowRight className="h-3 w-3 shrink-0" />
          <span className="truncate">{to?.label}</span>
        </p>
        {handoff && fromLane && toLane && (
          <p className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-medium">
            Handoff: <span style={{ color: fromLane.color }}>{fromLane.actor}</span>
            <ArrowRight className="h-3 w-3" />
            <span style={{ color: toLane.color }}>{toLane.actor}</span>
          </p>
        )}
      </div>

      <Field label="How it happens today">
        <div className="grid grid-cols-2 gap-1">
          {MECHANISMS.map((m) => {
            const meta = MECHANISM_META[m]
            const Icon = mechanismIcons[m]
            const active = edge.mechanism === m
            return (
              <button
                key={m}
                type="button"
                title={meta.hint}
                onClick={() => onUpdate(edge.id, { mechanism: m })}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                  active ? "border-current font-medium" : "border-border text-muted-foreground hover:bg-muted",
                )}
                style={active ? { color: meta.color, backgroundColor: `${meta.color}14`, borderColor: meta.color } : undefined}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{meta.label}</span>
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">{MECHANISM_META[edge.mechanism].hint}</p>
      </Field>

      <Field label="What moves">
        <Input
          value={edge.payload || ""}
          placeholder="e.g. PO number, invoice PDF, customer record"
          onChange={(e) => onUpdate(edge.id, { payload: e.target.value || undefined })}
          className="h-8 text-sm"
        />
      </Field>

      <Field label="Label">
        <Input
          value={edge.label || ""}
          placeholder="Optional"
          onChange={(e) => onUpdate(edge.id, { label: e.target.value || undefined })}
          className="h-8 text-sm"
        />
      </Field>

      <Field label="Type">
        <div className="grid grid-cols-5 gap-1">
          {EDGE_TYPES.map((t) => {
            const active = edge.type === t
            return (
              <button
                key={t}
                type="button"
                title={EDGE_TYPE_META[t].label}
                onClick={() => onUpdate(edge.id, { type: t })}
                className={cn(
                  "flex h-8 flex-col items-center justify-center gap-1 rounded-md border text-[10px] transition-colors",
                  active ? "border-current text-foreground" : "border-border text-muted-foreground hover:bg-muted",
                )}
                style={active ? { borderColor: EDGE_TYPE_META[t].color } : undefined}
              >
                <span className="h-0.5 w-4 rounded" style={{ backgroundColor: EDGE_TYPE_META[t].color }} />
                {EDGE_TYPE_META[t].label}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Notes">
        <textarea
          value={edge.notes || ""}
          placeholder="Who does it, how often, what breaks…"
          onChange={(e) => onUpdate(edge.id, { notes: e.target.value || undefined })}
          className={textareaClass}
        />
      </Field>

      <Button variant="destructive" size="sm" className="w-full" onClick={() => onDelete(edge.id)}>
        <Trash2 className="mr-2 h-3 w-3" />
        Delete edge
      </Button>
    </>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
