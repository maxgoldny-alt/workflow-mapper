import { AREA_COLORS, blankModel, newId, type Model, type ProcessArea, type SketchNode } from "./model"

/**
 * Business loop starters. A loop is the full operating cycle of a business at
 * a glance: one ProcessArea per stage, linked in order. Each stage carries a
 * sketch of its key nodes so the map reads as a flow before anything is
 * mapped in detail; a mapped workflow replaces the sketch.
 */

export type BusinessType = "retail" | "restaurant" | "service" | "manufacturing" | "ecommerce" | "custom"

export interface StageStarter {
  name: string
  /** Stages that sit off the main flow as a side branch (exceptions, returns). */
  side?: boolean
  nodes: SketchNode[]
}

const s = (label: string): SketchNode => ({ label, kind: "step" })
const d = (label: string): SketchNode => ({ label, kind: "decision" })
const src = (label: string): SketchNode => ({ label, kind: "source" })
const x = (label: string): SketchNode => ({ label, kind: "exception" })

export const BUSINESS_TYPES: { id: BusinessType; label: string; hint: string; stages: StageStarter[] }[] = [
  {
    id: "retail",
    label: "Retail / Storefront",
    hint: "Walk-in customers, POS, inventory",
    stages: [
      { name: "Foot Traffic / Ads", nodes: [src("Walk-in"), src("Local ads"), src("Repeat customer")] },
      { name: "Product Selection", nodes: [s("Browse / ask staff"), d("In stock?")] },
      { name: "POS Sale", nodes: [s("Ring up at POS"), s("Payment taken")] },
      { name: "Inventory Update", nodes: [s("Stock count adjusts"), d("Below reorder point?")] },
      { name: "Returns", side: true, nodes: [x("Return / exchange"), s("Refund at POS")] },
      { name: "Reorder / Purchasing", nodes: [s("Order from supplier"), s("Receive delivery")] },
      { name: "Reporting", nodes: [s("Daily sales report"), s("Books updated")] },
    ],
  },
  {
    id: "restaurant",
    label: "Restaurant / Food",
    hint: "Orders, kitchen, service, payment",
    stages: [
      { name: "Customer Source", nodes: [src("Walk-in"), src("Online order"), src("Phone")] },
      { name: "Order Intake", nodes: [s("Server / app takes order"), s("Ticket to kitchen")] },
      { name: "Kitchen / Prep", nodes: [s("Cook"), d("Order correct?")] },
      { name: "Serve / Deliver", nodes: [s("Serve table"), s("Hand to driver")] },
      { name: "Payment", nodes: [s("Check / online payment"), s("Tip out")] },
      { name: "Inventory / Labor", nodes: [s("Count stock"), s("Schedule staff")] },
      { name: "Return Visit", nodes: [s("Loyalty / review"), s("Reservation")] },
    ],
  },
  {
    id: "service",
    label: "Service Business",
    hint: "Leads, quotes, jobs, invoices",
    stages: [
      { name: "Lead Source", nodes: [src("Referral"), src("Website"), src("Repeat customer")] },
      { name: "Inquiry", nodes: [s("Phone / email / form"), s("Admin captures request"), d("Missing info?")] },
      { name: "Estimate / Quote", nodes: [s("Site visit"), s("Write quote"), s("Send quote")] },
      { name: "Approval", nodes: [d("Customer approves?"), s("Deposit")] },
      { name: "Scheduling", nodes: [s("Book crew / slot"), s("Confirm with customer")] },
      { name: "Work Performed", nodes: [s("Do the job"), d("Work complete?")] },
      { name: "Exceptions", side: true, nodes: [x("Change order"), x("Callback / rework")] },
      { name: "Invoice / Payment", nodes: [s("Invoice"), s("Payment received"), s("Close job")] },
      { name: "Review / Repeat", nodes: [s("Review request"), s("Reminder / follow-up")] },
    ],
  },
  {
    id: "manufacturing",
    label: "Manufacturing / Distribution",
    hint: "Orders, planning, production, shipping",
    stages: [
      { name: "Customer Orders", nodes: [src("Email / EDI"), src("Sales rep"), src("Portal")] },
      { name: "Order Entry", nodes: [s("Enter order in ERP"), d("Credit / stock OK?")] },
      { name: "Planning", nodes: [s("Schedule production / pick"), s("Materials pulled")] },
      { name: "Production / Picking", nodes: [s("Build / pick"), d("QC pass?")] },
      { name: "Exceptions", side: true, nodes: [x("Shortage / backorder"), x("Rework")] },
      { name: "Shipping / Delivery", nodes: [s("Pack & label"), s("Carrier pickup")] },
      { name: "Invoicing", nodes: [s("Invoice"), s("Payment received")] },
      { name: "Inventory Visibility", nodes: [s("Stock updated"), s("Reorder")] },
    ],
  },
  {
    id: "ecommerce",
    label: "Ecommerce",
    hint: "Traffic, checkout, fulfilment, returns",
    stages: [
      { name: "Traffic", nodes: [src("Ads"), src("Search"), src("Email list")] },
      { name: "Product Page", nodes: [s("Browse"), d("Add to cart?")] },
      { name: "Checkout", nodes: [s("Pay"), s("Order confirmation")] },
      { name: "Fulfillment", nodes: [s("Pick & pack"), d("In stock?")] },
      { name: "Shipping", nodes: [s("Label"), s("Carrier pickup"), s("Tracking sent")] },
      { name: "Support / Returns", side: true, nodes: [x("Where is my order?"), x("Return / refund")] },
      { name: "Retention", nodes: [s("Review request"), s("Repeat purchase")] },
    ],
  },
  {
    id: "custom",
    label: "Custom",
    hint: "Generic loop you rename",
    stages: [
      { name: "Demand / Customer Source", nodes: [src("Referral"), src("Website"), src("Repeat customer")] },
      { name: "Intake", nodes: [s("Phone / email / form"), s("Admin captures request"), d("Missing info?")] },
      { name: "Sales / Approval", nodes: [s("Quote / proposal"), d("Approved?")] },
      { name: "Work / Fulfillment", nodes: [s("Schedule / produce / perform"), d("Work complete?")] },
      { name: "Exceptions", side: true, nodes: [x("Rework / change"), x("Complaint")] },
      { name: "Payment / Closeout", nodes: [s("Invoice"), s("Payment received"), s("Close job / order")] },
      { name: "Records / Reporting", nodes: [s("Books updated"), s("Reports")] },
      { name: "Follow-up / Repeat", nodes: [s("Review / thank-you"), s("Reminder")] },
    ],
  },
]

export const businessType = (id: string) => BUSINESS_TYPES.find((b) => b.id === id) ?? BUSINESS_TYPES[BUSINESS_TYPES.length - 1]

/** Stage areas in order, linked start to end along the main flow (side stages excluded from the chain). */
export function loopAreas(stages: StageStarter[]): { areas: ProcessArea[]; links: Model["areaLinks"] } {
  const areas: ProcessArea[] = stages.map((st, i) => ({ id: newId("area"), name: st.name, order: i, color: AREA_COLORS[i % AREA_COLORS.length], side: st.side, sketch: st.nodes }))
  const main = areas.filter((a) => !a.side)
  const links: Model["areaLinks"] = main.slice(1).map((a, i) => ({ id: newId("al"), from: main[i].id, to: a.id, verification: "unknown" }))
  return { areas, links }
}

/** A fresh company with a shallow loop and nothing mapped yet. */
export function loopModel(type: BusinessType, companyName = "New company"): Model {
  const m = blankModel(companyName)
  const bt = businessType(type)
  m.company.industry = bt.id === "custom" ? undefined : bt.label
  const { areas, links } = loopAreas(bt.stages)
  m.areas = areas
  m.areaLinks = links
  return m
}

/** Keyword hints per business type, checked in this order before the type ids and labels. */
const TYPE_KEYWORDS: [BusinessType, string[]][] = [
  ["ecommerce", ["ecommerce", "e-commerce", "online", "shop", "webstore", "web store", "dtc"]],
  ["manufacturing", ["manufactur", "distribut", "warehouse", "wholesale", "fabricat", "factory"]],
  ["restaurant", ["restaurant", "food", "cafe", "café", "bakery", "catering"]],
  ["retail", ["retail", "store", "boutique"]],
  ["service", ["service", "contractor", "plumb", "hvac", "landscap", "cleaning", "repair", "agency", "consult"]],
]

/** The business type a free-text industry label most likely means; "custom" when nothing fits. */
export function businessTypeFor(industry?: string) {
  const t = (industry ?? "").trim().toLowerCase()
  const custom = businessType("custom")
  if (!t) return custom
  for (const [id, words] of TYPE_KEYWORDS) if (words.some((w) => t.includes(w))) return businessType(id)
  const hit = BUSINESS_TYPES.find((b) => b.id !== "custom" && (t.includes(b.id) || b.label.toLowerCase().includes(t) || t.includes(b.label.toLowerCase())))
  return hit ?? custom
}

/** Typical stage names for a business, from its free-text industry label. */
export function stageVocabularyFor(industry?: string): string[] {
  return businessTypeFor(industry).stages.map((st) => st.name)
}

/** The stage starter (any business type) whose name matches, case-insensitively. */
export function stageStarterByName(name: string): StageStarter | undefined {
  const t = name.trim().toLowerCase()
  for (const b of BUSINESS_TYPES) {
    const hit = b.stages.find((st) => st.name.toLowerCase() === t)
    if (hit) return hit
  }
  return undefined
}

/** Every known stage starter across business types, deduped by name, for the "add a stage" picker. */
export function allStageStarters(): StageStarter[] {
  const seen = new Map<string, StageStarter>()
  for (const b of BUSINESS_TYPES) for (const st of b.stages) if (!seen.has(st.name.toLowerCase())) seen.set(st.name.toLowerCase(), st)
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}
