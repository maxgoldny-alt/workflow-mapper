export type NodeType = "actor" | "step" | "decision" | "tool" | "system"
export type EdgeType = "sequence" | "yes" | "no" | "data" | "uses" | "handoff"

export interface Node {
  id: string
  label: string
  sublabel?: string
  type: NodeType
  x: number
  y: number
  screen: string // id of the Screen (container) that houses this node
}

export interface Connection {
  from: string
  to: string
  label?: string
  type: EdgeType
  lineStyle?: "solid" | "dotted" | "thick"
}

export interface Screen {
  id: string
  title: string
  x: number
  y: number
  width: number
  height: number
}

export interface DiagramTemplate {
  id: string
  name: string
  description: string
  nodes: Node[]
  connections: Connection[]
  screens: Screen[]
}

// Fixed node geometry — shared by rendering, hit-testing, edge anchoring, and export
export const NODE_W = 132
export const NODE_H = 88

// Single source of truth for node type metadata. Colors are mid-tone on purpose:
// saturated enough to read on a light canvas, bright enough to read on a dark one.
export const NODE_TYPE_META: Record<NodeType, { label: string; color: string; shortcut: string }> = {
  actor: { label: "Actor", color: "#0891b2", shortcut: "1" },
  step: { label: "Step", color: "#4f46e5", shortcut: "2" },
  decision: { label: "Decision", color: "#d97706", shortcut: "3" },
  tool: { label: "Tool", color: "#059669", shortcut: "4" },
  system: { label: "System", color: "#7c3aed", shortcut: "5" },
}

// Single source of truth for edge type metadata
export const EDGE_TYPE_META: Record<EdgeType, { label: string; color: string; dash?: string }> = {
  sequence: { label: "Sequence", color: "#2563eb" },
  yes: { label: "Yes", color: "#059669" },
  no: { label: "No", color: "#dc2626" },
  data: { label: "Data", color: "#0891b2", dash: "8 4" },
  uses: { label: "Uses", color: "#7c3aed", dash: "2 4" },
  handoff: { label: "Handoff", color: "#d97706" },
}

export const NODE_TYPES = Object.keys(NODE_TYPE_META) as NodeType[]
export const EDGE_TYPES = Object.keys(EDGE_TYPE_META) as EdgeType[]

// Template 1: Operational Core Workflow (default)
const operationalCore: DiagramTemplate = {
  id: "operational-core",
  name: "Operational Core",
  description: "Order intake, core operations, and delivery with actors, tools, systems, and decisions",
  nodes: [
    { id: "customer", label: "Customer", type: "actor", x: 60, y: 120, screen: "intake" },
    { id: "place_order", label: "Place Order", type: "step", x: 220, y: 120, screen: "intake" },
    { id: "crm", label: "CRM", sublabel: "HubSpot", type: "tool", x: 220, y: 250, screen: "intake" },
    { id: "validate", label: "Order Valid?", type: "decision", x: 390, y: 120, screen: "intake" },

    { id: "ops_manager", label: "Ops Manager", type: "actor", x: 620, y: 60, screen: "core" },
    { id: "review", label: "Review Order", type: "step", x: 620, y: 180, screen: "core" },
    { id: "approve", label: "Approved?", type: "decision", x: 800, y: 180, screen: "core" },
    { id: "erp", label: "ERP", sublabel: "NetSuite", type: "system", x: 620, y: 320, screen: "core" },
    { id: "schedule", label: "Schedule Job", type: "step", x: 980, y: 120, screen: "core" },
    { id: "warehouse", label: "Warehouse Team", type: "actor", x: 980, y: 280, screen: "core" },

    { id: "pack", label: "Pack & Ship", type: "step", x: 1220, y: 120, screen: "delivery" },
    { id: "courier", label: "Courier API", type: "tool", x: 1220, y: 260, screen: "delivery" },
    { id: "notify", label: "Notify Customer", type: "step", x: 1400, y: 120, screen: "delivery" },
    { id: "email_sys", label: "Email System", sublabel: "SendGrid", type: "system", x: 1400, y: 260, screen: "delivery" },
  ],
  connections: [
    { from: "customer", to: "place_order", label: "submits", type: "sequence" },
    { from: "place_order", to: "crm", label: "logs to", type: "data" },
    { from: "place_order", to: "validate", type: "sequence" },
    { from: "validate", to: "review", label: "Yes", type: "yes" },
    { from: "validate", to: "notify", label: "No / reject", type: "no" },
    { from: "ops_manager", to: "review", label: "owns", type: "uses" },
    { from: "review", to: "approve", type: "sequence" },
    { from: "review", to: "erp", label: "reads stock", type: "data" },
    { from: "approve", to: "schedule", label: "Yes", type: "yes" },
    { from: "approve", to: "notify", label: "No", type: "no" },
    { from: "schedule", to: "warehouse", label: "handoff", type: "handoff" },
    { from: "warehouse", to: "pack", type: "sequence" },
    { from: "pack", to: "courier", label: "books", type: "uses" },
    { from: "pack", to: "notify", type: "sequence" },
    { from: "notify", to: "email_sys", label: "sends via", type: "uses" },
    { from: "erp", to: "email_sys", label: "order data", type: "data" },
  ],
  screens: [
    { id: "intake", title: "Order Intake", x: 30, y: 50, width: 500, height: 320 },
    { id: "core", title: "Operations Core", x: 570, y: 30, width: 540, height: 380 },
    { id: "delivery", title: "Delivery", x: 1180, y: 50, width: 360, height: 320 },
  ],
}

// Template 2: Simple Approval Flow
const approvalFlow: DiagramTemplate = {
  id: "approval-flow",
  name: "Approval Flow",
  description: "Basic request-review-approve workflow",
  nodes: [
    { id: "requester", label: "Requester", type: "actor", x: 80, y: 180, screen: "request" },
    { id: "submit", label: "Submit Request", type: "step", x: 260, y: 180, screen: "request" },
    { id: "form_tool", label: "Form Tool", sublabel: "Typeform", type: "tool", x: 260, y: 320, screen: "request" },
    { id: "manager", label: "Manager", type: "actor", x: 500, y: 80, screen: "review" },
    { id: "review_req", label: "Review", type: "step", x: 500, y: 200, screen: "review" },
    { id: "decision", label: "Approve?", type: "decision", x: 680, y: 200, screen: "review" },
    { id: "record", label: "Record System", type: "system", x: 880, y: 120, screen: "review" },
    { id: "notify_ok", label: "Notify Approved", type: "step", x: 880, y: 280, screen: "review" },
  ],
  connections: [
    { from: "requester", to: "submit", type: "sequence" },
    { from: "submit", to: "form_tool", label: "via", type: "uses" },
    { from: "submit", to: "review_req", label: "handoff", type: "handoff" },
    { from: "manager", to: "review_req", label: "owns", type: "uses" },
    { from: "review_req", to: "decision", type: "sequence" },
    { from: "decision", to: "record", label: "Yes", type: "yes" },
    { from: "decision", to: "submit", label: "No / revise", type: "no" },
    { from: "record", to: "notify_ok", label: "triggers", type: "data" },
  ],
  screens: [
    { id: "request", title: "Request", x: 40, y: 60, width: 400, height: 380 },
    { id: "review", title: "Review & Decide", x: 470, y: 40, width: 560, height: 340 },
  ],
}

// Template 3: Empty
const emptyTemplate: DiagramTemplate = {
  id: "empty",
  name: "Empty",
  description: "Start from scratch",
  nodes: [],
  connections: [],
  screens: [{ id: "screen_1", title: "Screen 1", x: 60, y: 80, width: 500, height: 340 }],
}

export const diagramTemplates: DiagramTemplate[] = [operationalCore, approvalFlow, emptyTemplate]

export const getTemplateById = (id: string): DiagramTemplate | undefined => {
  return diagramTemplates.find((t) => t.id === id)
}

export const defaultTemplate = operationalCore
