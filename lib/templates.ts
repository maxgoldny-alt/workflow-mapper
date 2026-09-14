import { LANE_COLORS, type Doc } from "./model"

export interface Template {
  id: string
  name: string
  description: string
  doc: Doc
}

// Lane tops for the Operational Core template: 0, 160, 360, 520 (heights 160, 200, 160, 180)
const operationalCore: Template = {
  id: "operational-core",
  name: "Operational Core",
  description: "Order intake, review, fulfilment, and the systems underneath",
  doc: {
    lanes: [
      { id: "customer", actor: "Customer", height: 160, color: LANE_COLORS[0] },
      { id: "ops", actor: "Ops Manager", height: 200, color: LANE_COLORS[1] },
      { id: "warehouse", actor: "Warehouse", height: 160, color: LANE_COLORS[2] },
      { id: "systems", actor: "Systems", height: 180, color: LANE_COLORS[7] },
    ],
    nodes: [
      { id: "place_order", label: "Place Order", type: "step", x: 200, y: 36, lane: "customer" },

      { id: "validate", label: "Order Valid?", type: "decision", x: 380, y: 216, lane: "ops" },
      { id: "review", label: "Review Order", type: "step", x: 560, y: 216, lane: "ops" },
      { id: "approve", label: "Approved?", type: "decision", x: 740, y: 216, lane: "ops" },
      { id: "schedule", label: "Schedule Job", type: "step", x: 920, y: 216, lane: "ops" },
      { id: "notify", label: "Notify Customer", type: "step", x: 1100, y: 216, lane: "ops" },

      { id: "pack", label: "Pack & Ship", type: "step", x: 920, y: 396, lane: "warehouse" },

      { id: "crm", label: "CRM", sublabel: "HubSpot", type: "tool", x: 200, y: 566, lane: "systems" },
      { id: "erp", label: "ERP", sublabel: "NetSuite", type: "system", x: 560, y: 566, lane: "systems" },
      { id: "courier", label: "Courier API", type: "tool", x: 920, y: 566, lane: "systems" },
      { id: "email_sys", label: "Email", sublabel: "SendGrid", type: "system", x: 1100, y: 566, lane: "systems" },
    ],
    connections: [
      { id: "e1", from: "place_order", to: "validate", type: "sequence", mechanism: "email", payload: "Order form PDF" },
      { id: "e2", from: "place_order", to: "crm", type: "data", label: "logged to", mechanism: "manual", payload: "Customer + order" },
      { id: "e3", from: "validate", to: "review", type: "yes", mechanism: "automated" },
      { id: "e4", from: "validate", to: "notify", type: "no", label: "reject", mechanism: "manual" },
      { id: "e5", from: "review", to: "erp", type: "data", label: "reads stock", mechanism: "api-available", payload: "SKU levels" },
      { id: "e6", from: "review", to: "approve", type: "sequence", mechanism: "automated" },
      { id: "e7", from: "approve", to: "schedule", type: "yes", mechanism: "automated" },
      { id: "e8", from: "approve", to: "notify", type: "no", mechanism: "manual" },
      { id: "e9", from: "schedule", to: "pack", type: "sequence", mechanism: "chat", payload: "Job sheet" },
      { id: "e10", from: "pack", to: "courier", type: "uses", label: "books", mechanism: "api-wired", payload: "Shipment" },
      { id: "e11", from: "pack", to: "notify", type: "sequence", mechanism: "spreadsheet", payload: "Tracking number" },
      { id: "e12", from: "notify", to: "email_sys", type: "uses", label: "sends via", mechanism: "api-wired" },
      { id: "e13", from: "erp", to: "email_sys", type: "data", label: "order data", mechanism: "api-wired" },
    ],
  },
}

// Lane tops: 0, 180, 360
const approvalFlow: Template = {
  id: "approval-flow",
  name: "Approval Flow",
  description: "Request, review, approve, record",
  doc: {
    lanes: [
      { id: "requester", actor: "Requester", height: 180, color: LANE_COLORS[0] },
      { id: "manager", actor: "Manager", height: 180, color: LANE_COLORS[1] },
      { id: "systems", actor: "Systems", height: 180, color: LANE_COLORS[7] },
    ],
    nodes: [
      { id: "submit", label: "Submit Request", type: "step", x: 200, y: 46, lane: "requester" },
      { id: "review_req", label: "Review", type: "step", x: 420, y: 226, lane: "manager" },
      { id: "decision", label: "Approve?", type: "decision", x: 620, y: 226, lane: "manager" },
      { id: "form_tool", label: "Form Tool", sublabel: "Typeform", type: "tool", x: 200, y: 406, lane: "systems" },
      { id: "record", label: "Record System", type: "system", x: 820, y: 406, lane: "systems" },
      { id: "notify_ok", label: "Notify Approved", type: "step", x: 1020, y: 406, lane: "systems" },
    ],
    connections: [
      { id: "e1", from: "submit", to: "form_tool", type: "uses", label: "via", mechanism: "api-wired" },
      { id: "e2", from: "submit", to: "review_req", type: "sequence", mechanism: "email", payload: "Request form" },
      { id: "e3", from: "review_req", to: "decision", type: "sequence", mechanism: "automated" },
      { id: "e4", from: "decision", to: "record", type: "yes", mechanism: "manual", payload: "Approval + amount" },
      { id: "e5", from: "decision", to: "submit", type: "no", label: "revise", mechanism: "chat" },
      { id: "e6", from: "record", to: "notify_ok", type: "data", label: "triggers", mechanism: "api-wired" },
    ],
  },
}

const empty: Template = {
  id: "empty",
  name: "Empty",
  description: "Start from scratch",
  doc: {
    lanes: [{ id: "lane_1", actor: "Actor 1", height: 220, color: LANE_COLORS[0] }],
    nodes: [],
    connections: [],
  },
}

export const templates: Template[] = [operationalCore, approvalFlow, empty]
export const defaultTemplate = operationalCore
export const getTemplateById = (id: string) => templates.find((t) => t.id === id)

/** Deep-enough copy so edits never leak back into the template. */
export const docFromTemplate = (t: Template = defaultTemplate): Doc => ({
  lanes: t.doc.lanes.map((l) => ({ ...l })),
  nodes: t.doc.nodes.map((n) => ({ ...n })),
  connections: t.doc.connections.map((c) => ({ ...c })),
})
