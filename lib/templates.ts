import {
  AREA_COLORS,
  LANE_COLORS,
  blankModel,
  newId,
  type Connection,
  type Doc,
  type Model,
  type Workspace,
} from "./model"
import { BUSINESS_TYPES, loopAreas, loopModel } from "./loops"

export interface Template {
  id: string
  name: string
  description: string
  build: () => Model
}

type EdgeOpts = Partial<Omit<Connection, "id" | "from" | "to">>
const e = (id: string, from: string, to: string, o: EdgeOpts = {}): Connection => ({
  id,
  from,
  to,
  type: "sequence",
  channel: "unknown",
  execution: "unknown",
  integration: "unknown",
  verification: "reported",
  ...o,
})

/* ------------------------------------------------------ Order to Cash */

// Lane tops: 0, 160, 360
const emailIntake: Doc = {
  lanes: [
    { id: "customer", actor: "Customer", actorId: "act_customer", height: 160, color: LANE_COLORS[0] },
    { id: "veronica", actor: "Veronica", actorId: "act_veronica", height: 200, color: LANE_COLORS[1] },
    { id: "systems", actor: "Systems", actorId: "act_systems", height: 180, color: LANE_COLORS[7] },
  ],
  nodes: [
    { id: "send_order", label: "Emails order", sublabel: "PDF attached", type: "trigger", x: 200, y: 36, lane: "customer", dataOut: ["do_order_pdf"] },
    { id: "check_mailbox", label: "Checks orders mailbox", type: "step", x: 380, y: 216, lane: "veronica", systemId: "sys_orders_mailbox" },
    { id: "open_pdf", label: "Opens PDF", type: "step", x: 560, y: 216, lane: "veronica", dataIn: ["do_order_pdf"] },
    { id: "complete", label: "Order complete?", type: "decision", x: 740, y: 216, lane: "veronica" },
    { id: "enter_qb", label: "Enters order in QuickBooks", type: "step", x: 920, y: 216, lane: "veronica", systemId: "sys_quickbooks", dataOut: ["do_order_record"] },
    { id: "mailbox", label: "Orders mailbox", sublabel: "Microsoft 365", type: "system", x: 380, y: 396, lane: "systems", systemId: "sys_orders_mailbox" },
    { id: "quickbooks", label: "QuickBooks", type: "system", x: 920, y: 396, lane: "systems", systemId: "sys_quickbooks" },
  ],
  connections: [
    e("e1", "send_order", "check_mailbox", { channel: "email", execution: "human", integration: "none", triggerKind: "human-check", trigger: "Veronica checks the mailbox during the day", payload: "Order PDF", dataObjectIds: ["do_order_pdf"] }),
    e("e2", "check_mailbox", "mailbox", { type: "uses", channel: "system", execution: "human", integration: "none" }),
    e("e3", "check_mailbox", "open_pdf", { channel: "system", execution: "human", integration: "none" }),
    e("e4", "open_pdf", "complete", { channel: "system", execution: "human", integration: "none" }),
    e("e5", "complete", "enter_qb", { type: "yes", channel: "system", execution: "human", integration: "none", payload: "Order details typed by hand", dataObjectIds: ["do_order_pdf", "do_order_record"] }),
    e("e6", "enter_qb", "quickbooks", { type: "uses", channel: "system", execution: "human", integration: "none" }),
  ],
}

// Lane tops: 0, 180
const fulfilment: Doc = {
  lanes: [
    { id: "ops", actor: "Ops Manager", actorId: "act_ops", height: 180, color: LANE_COLORS[1] },
    { id: "warehouse", actor: "Warehouse", actorId: "act_warehouse", height: 180, color: LANE_COLORS[2] },
  ],
  nodes: [
    { id: "schedule", label: "Schedules job", type: "step", x: 200, y: 46, lane: "ops" },
    { id: "pack", label: "Pack & ship", type: "step", x: 420, y: 226, lane: "warehouse" },
    { id: "book_courier", label: "Books courier", type: "step", x: 620, y: 226, lane: "warehouse", systemId: "sys_courier" },
  ],
  connections: [
    e("f1", "schedule", "pack", { channel: "chat", execution: "human", integration: "none", payload: "Job sheet", triggerKind: "human-check", trigger: "Warehouse reads the chat channel" }),
    e("f2", "pack", "book_courier", { channel: "system", execution: "human", integration: "none" }),
  ],
}

// Lane tops: 0, 180
const billing: Doc = {
  lanes: [
    { id: "finance", actor: "Finance", actorId: "act_finance", height: 180, color: LANE_COLORS[5] },
    { id: "customer", actor: "Customer", actorId: "act_customer", height: 180, color: LANE_COLORS[0] },
  ],
  nodes: [
    { id: "invoice", label: "Creates invoice", type: "step", x: 200, y: 46, lane: "finance", systemId: "sys_quickbooks", dataOut: ["do_invoice"] },
    { id: "send_invoice", label: "Emails invoice", type: "step", x: 420, y: 46, lane: "finance" },
    { id: "pay", label: "Pays", type: "step", x: 620, y: 226, lane: "customer" },
  ],
  connections: [
    e("b1", "invoice", "send_invoice", { channel: "system", execution: "human", integration: "none" }),
    e("b2", "send_invoice", "pay", { channel: "email", execution: "human", integration: "none", payload: "Invoice PDF", dataObjectIds: ["do_invoice"] }),
  ],
}

function orderToCash(): Model {
  const m = blankModel("Sample Co")
  m.areas = [
    { id: "area_intake", name: "Order Intake", purpose: "Orders arrive and are captured", order: 0, color: AREA_COLORS[0], inputs: "Customer orders", outputs: "Order in QuickBooks" },
    { id: "area_fulfil", name: "Fulfillment", purpose: "Job is scheduled, packed and shipped", order: 1, color: AREA_COLORS[2], inputs: "Order in QuickBooks", outputs: "Shipped order" },
    { id: "area_billing", name: "Billing & Payment", purpose: "Invoice and collect", order: 2, color: AREA_COLORS[5], inputs: "Shipped order", outputs: "Payment" },
  ]
  m.areaLinks = [
    { id: "al1", from: "area_intake", to: "area_fulfil", label: "Order ready", payload: "Order record", channel: "system", execution: "human", verification: "reported" },
    { id: "al2", from: "area_fulfil", to: "area_billing", label: "Shipped", payload: "Tracking number", channel: "spreadsheet", execution: "human", verification: "reported" },
  ]
  m.processes = [
    { id: "proc_email_intake", areaId: "area_intake", name: "Email order intake", purpose: "How an emailed order becomes a QuickBooks order", doc: emailIntake },
    { id: "proc_fulfil", areaId: "area_fulfil", name: "Pick, pack, ship", doc: fulfilment },
    { id: "proc_billing", areaId: "area_billing", name: "Invoice and collect", doc: billing },
  ]
  m.actors = [
    { id: "act_customer", name: "Customer", kind: "customer" },
    { id: "act_veronica", name: "Veronica", kind: "person", notes: "Monitors the orders mailbox" },
    { id: "act_ops", name: "Ops Manager", kind: "role" },
    { id: "act_warehouse", name: "Warehouse", kind: "team" },
    { id: "act_finance", name: "Finance", kind: "team" },
    { id: "act_systems", name: "Systems", kind: "unknown" },
  ]
  m.platforms = [
    { id: "plat_m365", name: "Microsoft 365", vendor: "Microsoft", category: "Email & collaboration" },
    { id: "plat_qbo", name: "QuickBooks Online", vendor: "Intuit", category: "Accounting" },
  ]
  m.systems = [
    { id: "sys_orders_mailbox", name: "Orders shared mailbox", platformId: "plat_m365", kind: "mailbox", accountType: "shared", ownerActorId: "act_veronica", purpose: "Receives customer orders", dataIn: "Order emails with PDF", integration: "none", verification: "reported" },
    { id: "sys_quickbooks", name: "QuickBooks", platformId: "plat_qbo", kind: "app", accountType: "company", purpose: "Orders and invoicing", integration: "unknown", verification: "reported" },
    { id: "sys_courier", name: "Courier portal", kind: "website", integration: "none", verification: "reported" },
  ]
  m.dataObjects = [
    { id: "do_order_pdf", name: "Order PDF", kind: "document", format: "PDF" },
    { id: "do_order_record", name: "Order record", kind: "record" },
    { id: "do_invoice", name: "Invoice", kind: "document", format: "PDF" },
  ]
  m.questions = [
    { id: "q1", text: "Do website, phone and text orders also end up in the orders mailbox, or somewhere else?", ref: { areaId: "area_intake" }, status: "open", source: "ai", createdAt: Date.now() },
    { id: "q2", text: "What happens when an order is incomplete?", ref: { processId: "proc_email_intake", nodeId: "complete" }, status: "open", source: "ai", createdAt: Date.now() },
    { id: "q3", text: "How does Fulfillment know a new order is in QuickBooks?", ref: { areaId: "area_fulfil" }, status: "open", source: "ai", createdAt: Date.now() },
  ]
  return m
}

/* ------------------------------------------------- Operational Core */

// Lane tops: 0, 160, 360, 520
const operationalCoreDoc: Doc = {
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
    e("e1", "place_order", "validate", { channel: "email", execution: "human", integration: "none", payload: "Order form PDF" }),
    e("e2", "place_order", "crm", { type: "data", label: "logged to", channel: "other", execution: "human", integration: "none", payload: "Customer + order" }),
    e("e3", "validate", "review", { type: "yes", channel: "system", execution: "system", integration: "live" }),
    e("e4", "validate", "notify", { type: "no", label: "reject", channel: "other", execution: "human", integration: "none" }),
    e("e5", "review", "erp", { type: "data", label: "reads stock", channel: "api", execution: "unknown", integration: "possible", payload: "SKU levels" }),
    e("e6", "review", "approve", { channel: "system", execution: "system", integration: "live" }),
    e("e7", "approve", "schedule", { type: "yes", channel: "system", execution: "system", integration: "live" }),
    e("e8", "approve", "notify", { type: "no", channel: "other", execution: "human", integration: "none" }),
    e("e9", "schedule", "pack", { channel: "chat", execution: "human", integration: "none", payload: "Job sheet" }),
    e("e10", "pack", "courier", { type: "uses", label: "books", channel: "api", execution: "system", integration: "live", payload: "Shipment" }),
    e("e11", "pack", "notify", { channel: "spreadsheet", execution: "human", integration: "none", payload: "Tracking number" }),
    e("e12", "notify", "email_sys", { type: "uses", label: "sends via", channel: "api", execution: "system", integration: "live" }),
    e("e13", "erp", "email_sys", { type: "data", label: "order data", channel: "api", execution: "system", integration: "live" }),
  ],
}

function operationalCore(): Model {
  const m = blankModel("Sample Co")
  m.areas = [{ id: "area_ops", name: "Operations", purpose: "Order intake, review, fulfilment", order: 0, color: AREA_COLORS[1] }]
  m.processes = [{ id: "proc_ops", areaId: "area_ops", name: "Operational Core", doc: operationalCoreDoc }]
  return m
}

/* ------------------------------------------------ Service business */

// Lane tops: 0, 170, 340
const inquiryToQuote: Doc = {
  lanes: [
    { id: "customer", actor: "Customer", actorId: "act_customer", height: 170, color: LANE_COLORS[0] },
    { id: "office", actor: "Dana (office)", actorId: "act_dana", height: 170, color: LANE_COLORS[1] },
    { id: "owner", actor: "Mike (owner)", actorId: "act_mike", height: 170, color: LANE_COLORS[2] },
  ],
  nodes: [
    { id: "call", label: "Calls the office", type: "trigger", x: 180, y: 41, lane: "customer" },
    { id: "webform", label: "Submits website form", type: "trigger", x: 180, y: 41, lane: "customer" },
    { id: "log", label: "Logs inquiry in Jobber", type: "step", x: 420, y: 211, lane: "office", systemId: "sys_jobber", dataOut: ["do_inquiry"] },
    { id: "details", label: "Enough detail to quote?", type: "decision", x: 608, y: 211, lane: "office" },
    { id: "callback", label: "Calls customer for details", type: "step", x: 796, y: 211, lane: "office" },
    { id: "visit", label: "Site visit", type: "step", x: 984, y: 381, lane: "owner" },
    { id: "quote", label: "Writes quote in Jobber", type: "step", x: 1172, y: 381, lane: "owner", systemId: "sys_jobber", dataOut: ["do_quote"] },
    { id: "send", label: "Emails quote", type: "step", x: 1360, y: 211, lane: "office", dataIn: ["do_quote"] },
  ],
  connections: [
    e("i1", "call", "log", { channel: "phone", execution: "human", integration: "none", triggerKind: "human-check", trigger: "Dana answers the phone", payload: "Job details, verbally" }),
    e("i2", "webform", "log", { channel: "web-form", execution: "human", integration: "none", triggerKind: "event", trigger: "Form emails Dana", payload: "Form fields", dataObjectIds: ["do_inquiry"] }),
    e("i3", "log", "details", { channel: "system", execution: "human", integration: "none" }),
    e("i4", "details", "callback", { type: "no", channel: "phone", execution: "human", integration: "none" }),
    e("i5", "details", "visit", { type: "yes", channel: "chat", execution: "human", integration: "none", triggerKind: "human-check", trigger: "Dana texts Mike the address", payload: "Address + job notes" }),
    e("i6", "callback", "details", { channel: "system", execution: "human", integration: "none" }),
    e("i7", "visit", "quote", { channel: "system", execution: "human", integration: "none" }),
    e("i8", "quote", "send", { channel: "system", execution: "human", integration: "none", triggerKind: "human-check", trigger: "Dana sees the quote appear in Jobber", payload: "Quote PDF", dataObjectIds: ["do_quote"] }),
  ],
}

function serviceBusiness(): Model {
  const m = loopModel("service", "Northside Plumbing")
  m.company.description = "Residential plumbing and drain repair, two vans, five people"
  const stage = (name: string) => m.areas.find((a) => a.name === name)!
  stage("Lead Source").purpose = "Google, referrals, yard signs"
  stage("Inquiry").purpose = "Calls and website form"
  stage("Estimate / Quote").purpose = "Site visit, quote in Jobber"
  stage("Approval").purpose = "Customer accepts by email or phone"
  stage("Scheduling").purpose = "Dana books the van in Jobber"
  stage("Work Performed").purpose = "Tech does the job, photos in Jobber"
  stage("Invoice / Payment").purpose = "Invoice from Jobber, card or check"
  stage("Review / Repeat").purpose = "Google review request, reminders"
  m.processes = [{ id: "proc_inquiry", areaId: stage("Inquiry").id, name: "Inquiry to quote", purpose: "From the first call or form to a quote in the customer's inbox", doc: inquiryToQuote }]
  m.actors = [
    { id: "act_customer", name: "Customer", kind: "customer" },
    { id: "act_dana", name: "Dana (office)", kind: "person", notes: "Answers phones, runs Jobber and QuickBooks" },
    { id: "act_mike", name: "Mike (owner)", kind: "person", notes: "Does site visits and writes quotes" },
  ]
  m.platforms = [
    { id: "plat_jobber", name: "Jobber", vendor: "Jobber", category: "Field service" },
    { id: "plat_qbo", name: "QuickBooks Online", vendor: "Intuit", category: "Accounting" },
  ]
  m.systems = [
    { id: "sys_jobber", name: "Jobber", platformId: "plat_jobber", kind: "app", accountType: "company", ownerActorId: "act_dana", purpose: "Inquiries, quotes, scheduling, invoices", integration: "unknown", verification: "reported" },
    { id: "sys_qbo", name: "QuickBooks", platformId: "plat_qbo", kind: "app", accountType: "company", ownerActorId: "act_dana", purpose: "Books", integration: "unknown", verification: "reported" },
    { id: "sys_website", name: "Website contact form", kind: "website", purpose: "Sends inquiries by email", integration: "none", verification: "reported" },
  ]
  m.dataObjects = [
    { id: "do_inquiry", name: "Inquiry", kind: "record" },
    { id: "do_quote", name: "Quote", kind: "document", format: "PDF" },
  ]
  const now = Date.now()
  m.questions = [
    { id: "q1", text: "Does Jobber sync invoices to QuickBooks, or does Dana re-enter them?", ref: { areaId: stage("Invoice / Payment").id }, status: "open", source: "ai", createdAt: now },
    { id: "q2", text: "How does Mike know a site visit is booked: does Dana text him, or does he check Jobber?", ref: { processId: "proc_inquiry", nodeId: "visit" }, status: "open", source: "ai", createdAt: now },
    { id: "q3", text: "What happens when a customer never answers the quote email?", ref: { areaId: stage("Approval").id }, status: "open", source: "ai", createdAt: now },
  ]
  return m
}

/* ---------------------------------------------------------- registry */

export const templates: Template[] = [
  { id: "service-sample", name: "Northside Plumbing (sample)", description: "Service business loop with one mapped workflow", build: serviceBusiness },
  { id: "order-to-cash", name: "Order to Cash (sample)", description: "Three areas: intake, fulfilment, billing", build: orderToCash },
  { id: "operational-core", name: "Operational Core", description: "One area, one detailed process", build: operationalCore },
  ...BUSINESS_TYPES.map((b) => ({ id: `loop-${b.id}`, name: `${b.label} loop`, description: b.hint, build: () => loopModel(b.id) })),
  { id: "empty", name: "Empty company", description: "Start from nothing", build: () => blankModel("My company") },
]
void loopAreas
export const defaultTemplate = templates[0]
export const getTemplateById = (id: string) => templates.find((t) => t.id === id)

/** Fresh model via structuredClone so edits never leak into the template. */
export const workspaceFromTemplate = (t: Template = defaultTemplate, name?: string): Workspace => {
  const model = structuredClone(t.build())
  if (name) model.company.name = name
  return { id: newId("ws"), name: name ?? model.company.name, model }
}
