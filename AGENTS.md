# Workflow Mapper — Base44 Dev Notes

## Stack
- Next.js 16 (Turbopack) + React 19 + TypeScript + Tailwind v4
- All data lives in browser localStorage — no database, no backend persistence
- Single Next.js app (API route at `app/api/interview/route.ts`); single-origin on port 3000

## Running
- `docker compose -f docker-compose.base44.yml up -d` — starts `next dev` on port 3000
- Node 22 base image, source bind-mounted, deps installed at container start
- Healthcheck curls `http://localhost:3000`

## Environment
- `BASE44_APP_ID` (optional, preferred): routes the AI interview through Base44's built-in **InvokeLLM** core integration via the official `@base44/sdk` external client (anonymous mode, `response_json_schema` for the structured `{say, ops}` turn). Metered against the app's Base44 credit quota; no provider API key involved. Delivered via `/run/base44/app.env` (compose `env_file`).
- `ANTHROPIC_API_KEY` (optional): legacy fallback when `BASE44_APP_ID` is not set — Claude runs the interview server-side (forced tool call).
- Neither set → `/api/interview` returns 503 and the client falls back to the scripted interviewer. The app always works.
- `INTERVIEW_MODEL` (optional, Anthropic path only): defaults to `claude-opus-5`
- `BASE44_PUBLIC_HOST_SUFFIX`: used by `next.config.mjs` `allowedDevOrigins` so the preview origin can load dev assets/HMR

## AI interview providers (`app/api/interview/route.ts`)
Order: Base44 (`base44Turn`, dynamic-imports `@base44/sdk`) → Anthropic → 503. Both return `{say, ops, provider}`; the panel badge shows which provider served the turn.

## Verification
- `curl http://localhost:3000` returns 200 with HTML
- `curl -X POST http://localhost:3000/api/interview -H 'content-type: application/json' -d '{"messages":[],"modelSummary":"{}","userText":null}'` → 503 `{"error":"no_api_key"}` when no provider is configured
- `npm run lint`, `npx tsc --noEmit`, `npm run build` should all pass
