import { stageVocabularyFor } from "@/lib/loops"
import { contextualOpening, resolveFocus, type InterviewContext, type InterviewTurn, type Interviewer } from "./provider"
import { summarizeModel, type Op } from "./ops"

export class NoApiKeyError extends Error {
  constructor() {
    super("No AI provider configured")
  }
}

/** Browser-side client for /api/interview (the server route picks the provider:
 * Base44 first, then Anthropic). Throws NoApiKeyError on 503 so the caller can
 * fall back to the scripted interviewer. */
export const claudeInterviewer: Interviewer = {
  name: "AI",
  async next(ctx: InterviewContext, userText: string | null): Promise<InterviewTurn> {
    const f = resolveFocus(ctx)
    // The workflow being mapped: the focused stage's own workflow when the user is inside a stage, else the focused process
    const focus = f.level !== "company" ? f.process?.name : ctx.focusProcessId ? ctx.model.processes.find((p) => p.id === ctx.focusProcessId)?.name : undefined
    const res = await fetch("/api/interview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: ctx.messages.map((m) => ({ role: m.role, text: m.text })),
        modelSummary: summarizeModel(ctx.model),
        instructions: ctx.instructions,
        userText,
        focus,
        level: f.level,
        focusArea: f.area?.name,
        focusNode: f.node?.label,
        stageVocabulary: stageVocabularyFor(ctx.model.company.industry),
        opening: userText === null ? contextualOpening(ctx) : undefined,
      }),
    })
    if (res.status === 503) throw new NoApiKeyError()
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      // A dead or misconfigured server route should not kill the interview: fall back to the scripted interviewer
      if (res.status >= 500 || res.status === 404) throw new NoApiKeyError()
      throw new Error(body.error ?? `Interview request failed (${res.status})`)
    }
    const data = (await res.json()) as { say: string; ops: Op[]; provider?: string; providerDetail?: string }
    return { say: data.say, ops: data.ops ?? [], provider: data.provider, providerDetail: data.providerDetail }
  },
}
