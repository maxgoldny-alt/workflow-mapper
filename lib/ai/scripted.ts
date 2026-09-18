import type { Channel } from "@/lib/model"
import type { InterviewContext, InterviewTurn, Interviewer } from "./provider"
import { OPENING_QUESTION } from "./provider"
import type { Op } from "./ops"

/**
 * Deterministic interviewer used when no AI provider is configured. It follows
 * the questions a systems analyst asks about an intake-style process and
 * extracts facts with plain keyword matching. Anything it cannot parse becomes
 * an open question rather than a guess.
 */

interface ChannelPlan {
  channel: Channel
  label: string
  done: boolean
}

interface State {
  stage: "name" | "channels" | "system" | "platform" | "monitor" | "next" | "reentry" | "ready" | "exception" | "more" | "done"
  area?: string
  process?: string
  customer: string
  channels: ChannelPlan[]
  current?: ChannelPlan
  systemName?: string
  platform?: string
  actor?: string
  lastStep?: string
  destSystem?: string
}

const CHANNEL_WORDS: [RegExp, Channel, string][] = [
  [/\be-?mails?\b|\boutlook\b|\bgmail\b|\binbox\b|\bmailbox\b/i, "email", "Email"],
  [/\bweb ?site\b|\bonline\b|\bportal\b|\bshop\b|\be-?commerce\b/i, "website", "Website"],
  [/\bweb ?form\b|\bform\b/i, "web-form", "Web form"],
  [/\bphone\b|\bcalls?\b|\btelephone\b/i, "phone", "Phone"],
  [/\btexts?\b|\bsms\b|\bmessages?\b(?! ?board)/i, "sms", "Text message"],
  [/\bwhats ?app\b/i, "whatsapp", "WhatsApp"],
  [/\bslack\b/i, "slack", "Slack"],
  [/\bteams\b/i, "teams", "Teams"],
  [/\bfax\b|\bpaper\b|\bwalk-?in\b|\bin person\b/i, "in-person", "In person / paper"],
  [/\bspreadsheet\b|\bexcel\b|\bsheet\b/i, "spreadsheet", "Spreadsheet"],
  [/\bedi\b|\bapi\b|\bintegration\b/i, "api", "API / EDI"],
]

const PLATFORMS: [RegExp, string, string][] = [
  [/microsoft ?365|office ?365|m365|o365|exchange online/i, "Microsoft 365", "Microsoft"],
  [/exchange server|on-?prem/i, "Exchange Server", "Microsoft"],
  [/outlook\.com|hotmail|live\.com/i, "Outlook.com", "Microsoft"],
  [/gmail|google workspace|g ?suite/i, "Google Workspace", "Google"],
  [/quickbooks online|qbo/i, "QuickBooks Online", "Intuit"],
  [/quickbooks desktop/i, "QuickBooks Desktop", "Intuit"],
  [/quickbooks|\bqb\b/i, "QuickBooks", "Intuit"],
  [/netsuite/i, "NetSuite", "Oracle"],
  [/hubspot/i, "HubSpot", "HubSpot"],
  [/salesforce/i, "Salesforce", "Salesforce"],
  [/xero/i, "Xero", "Xero"],
  [/shopify/i, "Shopify", "Shopify"],
  [/\bsap\b/i, "SAP", "SAP"],
  [/dynamics|business central/i, "Dynamics 365", "Microsoft"],
  [/monday\.com|monday/i, "monday.com", "monday.com"],
  [/asana/i, "Asana", "Asana"],
  [/trello/i, "Trello", "Atlassian"],
  [/jira/i, "Jira", "Atlassian"],
]

const DONT_KNOW = /\b(don'?t know|not sure|no idea|unsure|dunno|no clue|unknown)\b/i
const NEGATIVE = /^\s*(no|nope|none|nothing|not really|nah)\b/i
const POSITIVE = /^\s*(yes|yeah|yep|sure|correct|right)\b/i

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const clean = (s: string) => {
  let t = s.replace(/[.!?]+$/, "").trim()
  const lead = /^(we'?re|we are|it'?s|its|the|our|mapping|process|just|um|uh|let'?s|map|do|so)\s+/i
  while (lead.test(t)) t = t.replace(lead, "")
  return t.trim()
}

const PRODUCT_WORDS = /^(outlook|gmail|excel|quickbooks|netsuite|hubspot|salesforce|xero|shopify|sap|slack|teams|whatsapp|microsoft|google|exchange|dynamics|asana|trello|jira|monday|pdf|api|edi|crm|erp)$/i

/** "Veronica checks it" → Veronica; "the ops team" → Ops team. */
function extractActor(text: string): string | undefined {
  const named = text.match(/\b([A-Z][a-z]{2,})\b(?=\s+(checks|monitors|watches|opens|reads|looks|handles|reviews|enters|does|picks|gets|takes|processes|logs))/)
  if (named && !PRODUCT_WORDS.test(named[1])) return named[1]
  const role = text.match(/\b(the|our)\s+((?:[a-z]+\s+){0,2}(?:team|manager|person|rep|clerk|admin|assistant|coordinator|department|office|desk|warehouse|sales|ops|operations|finance|accounting|support|shop|floor|driver|dispatcher|buyer|planner))\b/i)
  if (role) return cap(role[2].trim())
  const someone = text.match(/\b(someone|somebody|anyone)\b/i)
  if (someone) return undefined
  const caps = [...text.matchAll(/\b([A-Z][a-z]{2,})\b/g)].map((m) => m[1]).filter((w) => !PRODUCT_WORDS.test(w) && !/^(The|Then|They|She|He|It|We|Our|And|But|Yes|No)$/.test(w))
  return caps[0]
}

function extractSystems(text: string): { name: string; vendor: string }[] {
  const out: { name: string; vendor: string }[] = []
  for (const [re, name, vendor] of PLATFORMS) if (re.test(text) && !out.some((o) => o.name === name)) out.push({ name, vendor })
  return out
}

function extractData(text: string): string[] {
  const out: string[] = []
  if (/\bpdf\b/i.test(text)) out.push("Order PDF")
  if (/\binvoice\b/i.test(text)) out.push("Invoice")
  if (/\bpurchase order\b|\bpo\b/i.test(text)) out.push("Purchase order")
  if (/\bspreadsheet\b|\bexcel\b/i.test(text)) out.push("Spreadsheet")
  if (/\bcustomer (record|details|info)\b/i.test(text)) out.push("Customer record")
  return out
}

export function createScriptedInterviewer(): Interviewer {
  const s: State = { stage: "name", customer: "Customer", channels: [] }
  const p = () => s.process ?? "Process"

  const nextChannel = (): ChannelPlan | undefined => s.channels.find((c) => !c.done)

  const askChannelIntro = (c: ChannelPlan): string => {
    s.current = c
    s.stage = "system"
    if (c.channel === "email") return `Let's start with ${c.label.toLowerCase()}. What email system receives those orders? For example Outlook, Gmail, or something else.`
    if (c.channel === "website") return `Now the website orders. Where do those land after the customer submits? A platform, an email, a spreadsheet?`
    if (c.channel === "phone") return `Now phone orders. Who takes the call, and where do they write the order down?`
    if (c.channel === "sms") return `Now text messages. Which phone or number receives them, and who watches it?`
    return `Now ${c.label.toLowerCase()}. Where does that request arrive, and who sees it first?`
  }

  const finishChannel = (): string => {
    if (s.current) s.current.done = true
    const nxt = nextChannel()
    if (nxt) return askChannelIntro(nxt)
    s.stage = "more"
    return `That covers every intake route you named. Is there another process to map next, or an exception path we skipped (rejected orders, missing information)?`
  }

  return {
    name: "Scripted interviewer (no AI key configured)",
    async next(ctx: InterviewContext, userText: string | null): Promise<InterviewTurn> {
      void ctx
      const ops: Op[] = []
      if (userText === null) return { say: OPENING_QUESTION, ops }
      const text = userText.trim()
      const unknown = DONT_KNOW.test(text)

      switch (s.stage) {
        case "name": {
          const name = cap(clean(text)) || "Order intake"
          s.process = name
          s.area = name
          ops.push({ op: "ensureArea", name }, { op: "ensureProcess", area: name, name })
          s.stage = "channels"
          return { say: `How does ${name.toLowerCase()} start? Through which channels can a request reach the business (email, website, phone, text, in person…)?`, ops }
        }

        case "channels": {
          const found: ChannelPlan[] = []
          for (const [re, channel, label] of CHANNEL_WORDS) if (re.test(text) && !found.some((f) => f.channel === channel)) found.push({ channel, label, done: false })
          if (!found.length) {
            if (unknown) ops.push({ op: "addQuestion", text: `How do requests enter ${p()}?`, process: p() })
            else ops.push({ op: "note", process: p(), node: "", notes: text }, { op: "addQuestion", text: `Which channels bring work into ${p()}? (You said: "${text}")`, process: p() })
            return { say: `I could not pick out specific channels. Say them plainly, like "email and phone", or "I don't know".`, ops }
          }
          s.channels = found
          ops.push({ op: "ensureActor", name: s.customer, kind: "customer" })
          for (const c of found) ops.push({ op: "addNode", process: p(), actor: s.customer, label: `${c.label} request arrives`, type: "trigger" })
          const first = found[0]
          return { say: `Got it: ${found.map((f) => f.label.toLowerCase()).join(", ")}. ${askChannelIntro(first)}`, ops }
        }

        case "system": {
          const c = s.current!
          const systems = extractSystems(text)
          const actor = extractActor(text)
          const shared = /\bshared\b|\bgroup\b|\bteam\b|\bdistribution\b/i.test(text)
          if (unknown) {
            ops.push({ op: "addQuestion", text: `What system receives ${c.label.toLowerCase()} requests for ${p()}?`, process: p() })
            s.stage = "monitor"
            return { say: `Noted as unknown. Who is the first person to see a new ${c.label.toLowerCase()} request?`, ops }
          }
          const needsPlatform = /\boutlook\b/i.test(text) && !systems.some((x) => x.name.startsWith("Microsoft") || x.name.startsWith("Exchange") || x.name === "Outlook.com")
          const platform = systems.find((x) => /Microsoft 365|Exchange|Outlook\.com|Google Workspace/.test(x.name))
          const sysName = c.channel === "email" ? (shared ? "Orders shared mailbox" : `${c.label} inbox`) : systems[0]?.name ?? `${c.label} intake`
          s.systemName = sysName
          if (platform) s.platform = platform.name
          ops.push({
            op: "ensureSystem",
            name: sysName,
            platform: platform?.name ?? (c.channel !== "email" ? systems[0]?.name : undefined),
            kind: c.channel === "email" ? "mailbox" : c.channel === "website" || c.channel === "web-form" ? "website" : c.channel === "phone" || c.channel === "sms" ? "phone" : "unknown",
            accountType: shared ? "shared" : undefined,
            owner: actor,
            purpose: `Receives ${c.label.toLowerCase()} requests`,
          })
          if (actor) {
            s.actor = actor
            ops.push({ op: "ensureActor", name: actor, kind: "person" })
            ops.push({ op: "addNode", process: p(), actor, label: `Checks ${sysName.toLowerCase()}`, system: sysName })
            ops.push({ op: "connect", process: p(), from: `${c.label} request arrives`, to: `Checks ${sysName.toLowerCase()}`, channel: c.channel, execution: "human", integration: "none", triggerKind: "human-check", trigger: `${actor} checks ${sysName.toLowerCase()}`, dataObjects: c.channel === "email" ? ["Order PDF"] : undefined })
            s.lastStep = `Checks ${sysName.toLowerCase()}`
            s.stage = needsPlatform ? "platform" : "next"
            return {
              say: needsPlatform
                ? `Is that Outlook on Microsoft 365 (Exchange Online), an on-premises Exchange Server, an Outlook.com account, or are you not sure?`
                : `So ${actor} checks ${sysName.toLowerCase()}. What happens after ${actor} sees a new one?`,
              ops,
            }
          }
          s.stage = needsPlatform ? "platform" : "monitor"
          return {
            say: needsPlatform ? `Is that Outlook on Microsoft 365 (Exchange Online), an on-premises Exchange Server, an Outlook.com account, or are you not sure?` : `Who monitors ${sysName.toLowerCase()}, and how do they know a new one arrived?`,
            ops,
          }
        }

        case "platform": {
          const systems = extractSystems(text)
          const platform = systems.find((x) => /Microsoft 365|Exchange|Outlook\.com|Google Workspace/.test(x.name))
          const shared = /\bshared\b|\bgroup\b|\bdistribution\b/i.test(text)
          const actor = extractActor(text)
          if (platform && s.systemName) {
            s.platform = platform.name
            ops.push({ op: "ensurePlatform", name: platform.name, vendor: platform.vendor }, { op: "ensureSystem", name: s.systemName, platform: platform.name, kind: "mailbox" })
          } else {
            ops.push({ op: "addQuestion", text: `Which email platform runs ${s.systemName ?? "the mailbox"}? (Microsoft 365, Exchange Server, Outlook.com, Google Workspace)`, process: p() })
          }
          if ((shared || actor) && s.systemName) ops.push({ op: "ensureSystem", name: s.systemName, kind: "mailbox", accountType: shared ? "shared" : undefined, owner: actor })
          if (actor && !s.actor && s.current) {
            s.actor = actor
            const c = s.current
            const step = `Checks ${s.systemName?.toLowerCase() ?? "the inbox"}`
            ops.push({ op: "ensureActor", name: actor, kind: "person" })
            ops.push({ op: "addNode", process: p(), actor, label: step, system: s.systemName })
            ops.push({ op: "connect", process: p(), from: `${c.label} request arrives`, to: step, channel: c.channel, execution: "human", integration: "none", triggerKind: "human-check", trigger: `${actor} checks ${s.systemName?.toLowerCase()}`, dataObjects: c.channel === "email" ? ["Order PDF"] : undefined })
            s.lastStep = step
          }
          if (s.actor) {
            s.stage = "next"
            return { say: `${platform ? "Recorded" : "Left as a question"}. What happens after ${s.actor} sees a new one?`, ops }
          }
          s.stage = "monitor"
          return { say: `${platform ? "Recorded" : "Left as a question"}. Who monitors ${s.systemName?.toLowerCase() ?? "that"}, and how do they know a new one arrived?`, ops }
        }

        case "monitor": {
          const c = s.current!
          const actor = extractActor(text)
          if (!actor || unknown) {
            ops.push({ op: "addQuestion", text: `Who monitors ${s.systemName ?? c.label.toLowerCase()} in ${p()}?`, process: p() })
            s.stage = "next"
            return { say: `Recorded as an open question. What happens next with the request, whoever picks it up?`, ops }
          }
          s.actor = actor
          const sysName = s.systemName ?? `${c.label} intake`
          const step = `Checks ${sysName.toLowerCase()}`
          ops.push({ op: "ensureActor", name: actor, kind: "person" })
          ops.push({ op: "addNode", process: p(), actor, label: step, system: sysName })
          ops.push({ op: "connect", process: p(), from: `${c.label} request arrives`, to: step, channel: c.channel, execution: "human", integration: "none", triggerKind: /notif|alert|ping|pop|sound/i.test(text) ? "event" : "human-check", trigger: text })
          s.lastStep = step
          s.stage = "next"
          return { say: `What happens after ${actor} sees a new one?`, ops }
        }

        case "next": {
          const actor = s.actor ?? extractActor(text) ?? "Unknown actor"
          if (!s.actor) ops.push({ op: "ensureActor", name: actor })
          const systems = extractSystems(text)
          const data = extractData(text)
          const dest = systems.find((x) => !/Microsoft 365|Exchange|Outlook\.com|Google Workspace/.test(x.name))
          const opens = /\bopens?\b|\breads?\b|\breviews?\b|\blooks?\b/i.test(text)
          const enters = /\benters?\b|\btypes?\b|\bkeys?\b|\binputs?\b|\bcreates?\b|\blogs?\b|\badds?\b|\bputs?\b/i.test(text)
          let prev = s.lastStep
          if (opens) {
            const label = data.length ? `Opens the ${data[0].toLowerCase()}` : "Reviews the request"
            ops.push({ op: "addNode", process: p(), actor, label, dataIn: data.length ? [data[0]] : undefined, after: prev })
            if (prev) ops.push({ op: "connect", process: p(), from: prev, to: label, channel: "system", execution: "human", integration: "none" })
            prev = label
          }
          if (enters && dest) {
            s.destSystem = dest.name
            const label = `Enters it into ${dest.name}`
            ops.push({ op: "ensurePlatform", name: dest.name, vendor: dest.vendor })
            ops.push({ op: "ensureSystem", name: dest.name, platform: dest.name, kind: "app" })
            ops.push({ op: "addNode", process: p(), actor, label, system: dest.name, dataOut: [`${p()} record`], after: prev })
            if (prev) ops.push({ op: "connect", process: p(), from: prev, to: label, channel: "system", execution: "human", integration: "none", payload: data[0] ? `${data[0]} details, typed by hand` : "Details typed by hand", dataObjects: data.length ? [data[0]] : undefined })
            prev = label
            if (/quickbooks$/i.test(dest.name)) ops.push({ op: "addQuestion", text: "Is that QuickBooks Online or QuickBooks Desktop?", process: p() })
          } else if (!opens && !enters) {
            if (unknown) ops.push({ op: "addQuestion", text: `What does ${actor} do after seeing a new request in ${p()}?`, process: p() })
            else {
              const label = cap(clean(text)).slice(0, 60)
              ops.push({ op: "addNode", process: p(), actor, label, after: prev, verification: "inferred" })
              if (prev) ops.push({ op: "connect", process: p(), from: prev, to: label, execution: "human" })
              prev = label
            }
          }
          s.lastStep = prev
          s.stage = "reentry"
          return { say: enters && dest ? `Does anyone else re-enter any of that information anywhere else, for example into another system or a spreadsheet?` : `Where is that information entered or recorded after that, if anywhere?`, ops }
        }

        case "reentry": {
          const systems = extractSystems(text)
          if (!NEGATIVE.test(text) && !unknown && (systems.length || /\bspreadsheet\b|\bexcel\b|\bsheet\b|\bagain\b|\bre-?enter/i.test(text))) {
            const actor = extractActor(text) ?? s.actor ?? "Unknown actor"
            const target = systems[0]?.name ?? "Spreadsheet"
            const label = `Re-enters it into ${target}`
            ops.push({ op: "ensureSystem", name: target, kind: target === "Spreadsheet" ? "spreadsheet" : "app" })
            ops.push({ op: "addNode", process: p(), actor, label, system: target, dataOut: [`${p()} record`], after: s.lastStep })
            if (s.lastStep) ops.push({ op: "connect", process: p(), from: s.lastStep, to: label, channel: target === "Spreadsheet" ? "spreadsheet" : "system", execution: "human", integration: "none", payload: "Same details, typed again" })
            s.lastStep = label
          } else if (unknown) ops.push({ op: "addQuestion", text: `Is the ${p().toLowerCase()} information re-entered anywhere else?`, process: p() })
          s.stage = "ready"
          return { say: `How does the next person or team know the request is ready for them, and who is that?`, ops }
        }

        case "ready": {
          const actor = extractActor(text)
          if (unknown || !actor) {
            ops.push({ op: "addQuestion", text: `Who receives the work after ${s.lastStep ?? "intake"} in ${p()}, and how do they know it is ready?`, process: p() })
          } else {
            const channel = CHANNEL_WORDS.find(([re]) => re.test(text))?.[1] ?? "unknown"
            const label = `Picks up the ${p().toLowerCase()} request`
            ops.push({ op: "ensureActor", name: actor, kind: /team|warehouse|department|ops|finance/i.test(actor) ? "team" : "person" })
            ops.push({ op: "addNode", process: p(), actor, label, after: s.lastStep })
            if (s.lastStep) ops.push({ op: "connect", process: p(), from: s.lastStep, to: label, channel, execution: channel === "api" || channel === "system" ? "system" : "human", integration: channel === "api" ? "live" : "none", triggerKind: /check|look|watch|poll/i.test(text) ? "human-check" : /notif|alert|email|slack|teams|text/i.test(text) ? "event" : "unknown", trigger: text })
            if (channel === "unknown") ops.push({ op: "addQuestion", text: `How exactly does ${actor} find out the request is ready? (channel)`, process: p() })
          }
          s.stage = "exception"
          return { say: `What happens if the request is incomplete or gets rejected?`, ops }
        }

        case "exception": {
          const decision = "Request complete?"
          if (unknown) {
            ops.push({ op: "addQuestion", text: `What happens to incomplete or rejected requests in ${p()}?`, process: p() })
          } else {
            const actor = s.actor ?? "Unknown actor"
            ops.push({ op: "addNode", process: p(), actor, label: decision, type: "decision", after: s.lastStep })
            const outcome = cap(clean(text)).slice(0, 60)
            ops.push({ op: "addNode", process: p(), actor, label: outcome, after: decision, verification: "reported" })
            ops.push({ op: "connect", process: p(), from: decision, to: outcome, type: "no", execution: "human" })
            if (/\bdone\b|\bthat'?s it\b|\bnothing\b/i.test(text)) ops.push({ op: "addQuestion", text: `When a request is rejected, is the customer told, and is the record closed anywhere?`, process: p(), node: outcome })
          }
          return { say: finishChannel(), ops }
        }

        case "more": {
          if (NEGATIVE.test(text)) {
            s.stage = "done"
            return { say: `Then ${p()} is mapped as far as you've described it. Open questions are listed in the tray below the map. Say the name of another process whenever you want to continue.`, ops }
          }
          if (POSITIVE.test(text) && !/\b[a-z]{4,}\b.*\b[a-z]{4,}\b/i.test(text.replace(/^(yes|yeah|yep|sure)\b/i, ""))) return { say: `Which process, or which exception path?`, ops }
          const name = cap(clean(text.replace(/^(yes|yeah|yep|sure)[,.\s]*/i, "")))
          s.process = name
          s.area = name
          s.channels = []
          s.current = undefined
          s.actor = undefined
          s.lastStep = undefined
          ops.push({ op: "ensureArea", name }, { op: "ensureProcess", area: name, name })
          s.stage = "channels"
          return { say: `How does ${name.toLowerCase()} start? Through which channels can a request reach it?`, ops }
        }

        case "done": {
          const name = cap(clean(text))
          s.process = name
          s.area = name
          s.channels = []
          s.actor = undefined
          s.lastStep = undefined
          ops.push({ op: "ensureArea", name }, { op: "ensureProcess", area: name, name })
          s.stage = "channels"
          return { say: `How does ${name.toLowerCase()} start? Through which channels can a request reach it?`, ops }
        }
      }
      return { say: OPENING_QUESTION, ops }
    },
  }
}
