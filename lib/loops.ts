import { AREA_COLORS, blankModel, newId, type Model, type ProcessArea } from "./model"

/**
 * Business loop starters. A loop is the full operating cycle of a business at
 * a glance: one ProcessArea per stage, linked in order. Detail lives under each
 * stage; the loop itself stays shallow on purpose.
 */

export type BusinessType = "retail" | "restaurant" | "service" | "manufacturing" | "ecommerce" | "custom"

export const BUSINESS_TYPES: { id: BusinessType; label: string; hint: string; stages: string[] }[] = [
  { id: "retail", label: "Retail / Storefront", hint: "Walk-in customers, POS, inventory", stages: ["Foot Traffic / Ads", "Product Selection", "POS Sale", "Inventory Update", "Returns", "Reorder / Purchasing", "Reporting"] },
  { id: "restaurant", label: "Restaurant / Food", hint: "Orders, kitchen, service, payment", stages: ["Customer Source", "Order Intake", "Kitchen / Prep", "Serve / Deliver", "Payment", "Inventory / Labor", "Return Visit"] },
  { id: "service", label: "Service Business", hint: "Leads, quotes, jobs, invoices", stages: ["Lead Source", "Inquiry", "Estimate / Quote", "Approval", "Scheduling", "Work Performed", "Invoice / Payment", "Review / Repeat"] },
  { id: "manufacturing", label: "Manufacturing / Distribution", hint: "Orders, planning, production, shipping", stages: ["Customer Orders", "Order Entry", "Planning", "Production / Picking", "Shipping / Delivery", "Invoicing", "Inventory Visibility"] },
  { id: "ecommerce", label: "Ecommerce", hint: "Traffic, checkout, fulfilment, returns", stages: ["Traffic", "Product Page", "Checkout", "Fulfillment", "Shipping", "Support / Returns", "Retention"] },
  { id: "custom", label: "Custom", hint: "Generic loop you rename", stages: ["Customer Source", "Intake", "Sales / Approval", "Work / Fulfillment", "Exceptions", "Payment / Closeout", "Records / Reporting", "Follow-up / Repeat"] },
]

export const businessType = (id: string) => BUSINESS_TYPES.find((b) => b.id === id) ?? BUSINESS_TYPES[BUSINESS_TYPES.length - 1]

/** Stage areas in order, linked start to end. */
export function loopAreas(stages: string[]): { areas: ProcessArea[]; links: Model["areaLinks"] } {
  const areas: ProcessArea[] = stages.map((name, i) => ({ id: newId("area"), name, order: i, color: AREA_COLORS[i % AREA_COLORS.length] }))
  const links: Model["areaLinks"] = areas.slice(1).map((a, i) => ({ id: newId("al"), from: areas[i].id, to: a.id, verification: "unknown" }))
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
