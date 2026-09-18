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
- `ANTHROPIC_API_KEY` (optional): enables the AI interview feature. Without it the API route returns 503 and the client falls back to a scripted interviewer — the app still works.
- `INTERVIEW_MODEL` (optional): defaults to `claude-opus-5`
- `BASE44_PUBLIC_HOST_SUFFIX`: used by `next.config.mjs` `allowedDevOrigins` so the preview origin can load dev assets/HMR

## Verification
- `curl http://localhost:3000` returns 200 with HTML
- `npm run lint`, `npx tsc --noEmit`, `npm run build` should all pass
