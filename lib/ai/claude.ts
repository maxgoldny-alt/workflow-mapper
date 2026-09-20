import type { InterviewContext, InterviewTurn, Interviewer } from "./provider"
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
    const focus = ctx.focusProcessId ? ctx.model.processes.find((p) => p.id === ctx.focusProcessId)?.name : undefined
    const res = await fetch("/api/interview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: ctx.messages.map((m) => ({ role: m.role, text: m.text })),
        modelSummary: summarizeModel(ctx.model),
        userText,
        focus,
      }),
    })
    if (res.status === 503) throw new NoApiKeyError()
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      // A dead or misconfigured server route should not kill the interview: fall back to the scripted interviewer
      if (res.status >= 500 || res.status === 404) throw new NoApiKeyError()
      throw new Error(body.error ?? `Interview request failed (${res.status})`)
    }
    const data = (await res.json()) as { say: string; ops: Op[]; provider?: string }
    return { say: data.say, ops: data.ops ?? [], provider: data.provider }
  },
}
