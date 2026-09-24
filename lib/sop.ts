import { processesInArea, type Model, type ProcessArea } from "./model"
import { sopForProcess } from "./reports"

/**
 * Standard operating procedures as Markdown, generated from the same process
 * docs the Steps and Diagram tabs edit. Missing facts show as **UNKNOWN**.
 */

function areaBody(m: Model, area: ProcessArea): string[] {
  const lines: string[] = []
  if (area.purpose?.trim()) lines.push(`_${area.purpose.trim()}_`, "")
  const procs = processesInArea(m, area.id)
  if (!procs.length) {
    lines.push("_No steps recorded yet._", "")
    return lines
  }
  for (const p of procs) lines.push(...sopForProcess(m, p))
  return lines
}

/** SOP for one stage: `# {stage}`, its purpose, then each workflow's numbered steps. */
export function sopForArea(m: Model, area: ProcessArea): string {
  return [`# ${area.name}`, "", ...areaBody(m, area)].join("\n").trimEnd() + "\n"
}

/** SOP for the whole company: every stage in loop order. */
export function sopForCompany(m: Model): string {
  const lines = [`# ${m.company.name}: standard operating procedures`, "", "Generated from the map. **UNKNOWN** marks information nobody has provided yet.", ""]
  for (const a of [...m.areas].sort((x, y) => x.order - y.order)) lines.push(`## ${a.name}`, "", ...areaBody(m, a))
  return lines.join("\n").trimEnd() + "\n"
}
