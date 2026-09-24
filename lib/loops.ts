import { AREA_COLORS, blankModel, newId, type Model, type ProcessArea, type SketchNode } from "./model"

/**
 * Overview starters: the typical workflow stages of a kind of business, in the order work flows. The overview is the full operating chain of a business at
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
      { name: "Bring customers in", nodes: [src("Walk-in"), src("Local ads"), src("Repeat customer")] },
      { name: "Sell", nodes: [s("Browse / ask staff"), d("In stock?"), s("Ring up at POS")] },
      { name: "Returns", side: true, nodes: [x("Return / exchange"), s("Refund at POS")] },
      { name: "Buy stock", nodes: [d("Below reorder point?"), s("Order from supplier")] },
      { name: "Receive & shelve", nodes: [s("Check the delivery"), s("Update stock count")] },
      { name: "Close the day", nodes: [s("Count the till"), s("Sales to the books")] },
    ],
  },
  {
    id: "restaurant",
    label: "Restaurant / Food",
    hint: "Orders, kitchen, service, payment",
    stages: [
      { name: "Take orders", nodes: [src("Walk-in"), src("Online order"), src("Phone"), s("Ticket to kitchen")] },
      { name: "Cook", nodes: [s("Prep and cook"), d("Order correct?")] },
      { name: "Serve / deliver", nodes: [s("Serve the table"), s("Hand to driver")] },
      { name: "Complaints & refunds", side: true, nodes: [x("Wrong or late order"), s("Comp or refund")] },
      { name: "Get paid", nodes: [s("Check / online payment"), s("Tip out")] },
      { name: "Buy supplies", nodes: [s("Count stock"), s("Order from suppliers")] },
      { name: "Close the day", nodes: [s("Cash out"), s("Sales to the books")] },
    ],
  },
  {
    id: "service",
    label: "Service Business",
    hint: "Leads, quotes, jobs, invoices",
    stages: [
      { name: "Get leads", nodes: [src("Referral"), src("Website"), src("Repeat customer")] },
      { name: "Take inquiries", nodes: [s("Phone / email / form"), s("Admin captures request"), d("Missing info?")] },
      { name: "Quote", nodes: [s("Site visit"), s("Write quote"), s("Send quote")] },
      { name: "Get approval", nodes: [d("Customer approves?"), s("Deposit")] },
      { name: "Schedule", nodes: [s("Book crew / slot"), s("Confirm with customer")] },
      { name: "Do the work", nodes: [s("Do the job"), d("Work complete?")] },
      { name: "Changes & callbacks", side: true, nodes: [x("Change order"), x("Callback / rework")] },
      { name: "Invoice & get paid", nodes: [s("Invoice"), s("Payment received"), s("Close job")] },
      { name: "Follow up", nodes: [s("Review request"), s("Reminder / follow-up")] },
    ],
  },
  {
    id: "manufacturing",
    label: "Manufacturing / Distribution",
    hint: "Orders, planning, production, shipping",
    stages: [
      { name: "Take orders", nodes: [src("Email / EDI"), src("Sales rep"), src("Portal"), d("Credit / stock OK?")] },
      { name: "Plan", nodes: [s("Schedule production / pick"), s("Check materials")] },
      { name: "Buy materials", nodes: [s("Raise PO"), s("Receive materials")] },
      { name: "Produce / pick", nodes: [s("Build / pick"), d("QC pass?")] },
      { name: "Rework & shortages", side: true, nodes: [x("Shortage / backorder"), x("Rework")] },
      { name: "Ship", nodes: [s("Pack & label"), s("Carrier pickup")] },
      { name: "Invoice", nodes: [s("Invoice"), s("Send to customer")] },
      { name: "Get paid", nodes: [s("Payment received"), s("Chase overdue")] },
    ],
  },
  {
    id: "ecommerce",
    label: "Ecommerce",
    hint: "Traffic, checkout, fulfilment, returns",
    stages: [
      { name: "Bring traffic in", nodes: [src("Ads"), src("Search"), src("Email list")] },
      { name: "Sell online", nodes: [s("Checkout"), s("Order confirmation")] },
      { name: "Pick & pack", nodes: [d("In stock?"), s("Pick & pack")] },
      { name: "Ship", nodes: [s("Label"), s("Carrier pickup"), s("Tracking sent")] },
      { name: "Returns & support", side: true, nodes: [x("Where is my order?"), x("Return / refund")] },
      { name: "Restock", nodes: [s("Reorder from supplier"), s("Receive stock")] },
      { name: "Reconcile payouts", nodes: [s("Payouts to bank"), s("Sales to the books")] },
    ],
  },
  {
    id: "custom",
    label: "Custom",
    hint: "Generic stages you rename",
    stages: [
      { name: "Win work", nodes: [src("Referral"), src("Website"), src("Repeat customer")] },
      { name: "Take the order", nodes: [s("Phone / email / form"), s("Capture the request"), d("Missing info?")] },
      { name: "Do the work", nodes: [s("Schedule / produce / perform"), d("Done right?")] },
      { name: "Exceptions", side: true, nodes: [x("Rework / change"), x("Complaint")] },
      { name: "Invoice", nodes: [s("Invoice"), s("Send to customer")] },
      { name: "Get paid", nodes: [s("Payment received"), s("Books updated")] },
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

/** A fresh company with a shallow overview and nothing mapped yet. */
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
