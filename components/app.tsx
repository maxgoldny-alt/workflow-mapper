"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { ChevronRight, HelpCircle, Moon, Sun, Undo2, Redo2, Upload, Sparkles, Mic, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  AREA_COLORS,
  blankDoc,
  newId,
  processById,
  updateProcessDoc,
  type Doc,
  type Model,
  type Workspace,
} from "@/lib/model"
import { templates, getTemplateById, workspaceFromTemplate } from "@/lib/templates"
import { loadState, saveState, coerceImport } from "@/lib/storage"
import { useHistory } from "@/hooks/use-history"
import { computeFindings } from "@/lib/findings"
import { VIEWS, VIEW_META, type View } from "@/lib/views"
import { navForRef, type Nav, type Selection } from "@/lib/selection"
import { applyOps } from "@/lib/ai/ops"
import { claudeInterviewer, NoApiKeyError } from "@/lib/ai/claude"
import { createScriptedInterviewer } from "@/lib/ai/scripted"
import type { Interviewer } from "@/lib/ai/provider"
import { OverviewCanvas } from "./overview-canvas"
import { AreaView } from "./area-view"
import { ProcessCanvas } from "./process-canvas"
import { Inspector } from "./inspector"
import { BottomTray } from "./bottom-tray"
import { InterviewPanel } from "./interview-panel"
import { ExportDialog } from "./export-dialog"
import { ReportDialog } from "./report-dialog"
import { Welcome } from "./welcome"

const subscribeNoop = () => () => {}

export default function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => [workspaceFromTemplate()])
  const [activeId, setActiveId] = useState(() => workspaces[0].id)
  const [loaded, setLoaded] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)

  const [nav, setNav] = useState<Nav>({ level: "company" })
  const [selection, setSelection] = useState<Selection>(null)
  const [view, setView] = useState<View>("operational")
  const [drawerOpen, setDrawerOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false)

  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0]
  const model = active.model

  const setModel = useCallback(
    (fn: (m: Model) => Model) => setWorkspaces((ws) => ws.map((w) => (w.id === activeId ? { ...w, model: fn(w.model), name: fn(w.model).company.name } : w))),
    [activeId],
  )
  const history = useHistory(model, setModel)
  const { commit, snapshot, undo, redo } = history

  /* ------------------------------------------------------------ persistence */

  useEffect(() => {
    const s = loadState()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspaces(s.workspaces)
    setActiveId(s.activeId)
    setShowWelcome(!!s.fresh)
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    const t = setTimeout(() => saveState({ activeId, workspaces }), 400)
    return () => clearTimeout(t)
  }, [loaded, workspaces, activeId])

  /* ------------------------------------------------------------- derived */

  const findings = useMemo(() => computeFindings(model), [model])
  const currentProcess = nav.level === "process" ? processById(model, nav.processId) : undefined
  const currentArea = nav.level === "area" ? model.areas.find((a) => a.id === nav.areaId) : nav.level === "process" && currentProcess ? model.areas.find((a) => a.id === currentProcess.areaId) : undefined

  // If the thing we are looking at disappears (undo, delete), fall back up the hierarchy
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (nav.level === "process" && !currentProcess) setNav(currentArea ? { level: "area", areaId: currentArea.id } : { level: "company" })
    if (nav.level === "area" && !currentArea) setNav({ level: "company" })
  }, [nav, currentProcess, currentArea])

  const navigate = useCallback((n: Nav, s: Selection = null) => {
    setNav(n)
    setSelection(s)
  }, [])

  const openArea = (areaId: string) => {
    const procs = model.processes.filter((p) => p.areaId === areaId)
    if (procs.length === 1) navigate({ level: "process", processId: procs[0].id })
    else navigate({ level: "area", areaId })
  }

  const commitDoc = useCallback(
    (fn: (d: Doc) => Doc, hist = true) => {
      if (nav.level !== "process") return
      const pid = nav.processId
      commit((m) => updateProcessDoc(m, pid, fn), hist)
    },
    [nav, commit],
  )

  /* ---------------------------------------------------------- interview */

  const [busy, setBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const interviewerRef = useRef<Interviewer>(claudeInterviewer)
  const [providerName, setProviderName] = useState(claudeInterviewer.name)

  const runTurn = useCallback(
    async (userText: string | null) => {
      setBusy(true)
      setAiError(null)
      const userMsg = userText !== null ? { id: newId("m"), role: "user" as const, text: userText, at: Date.now() } : null
      if (userMsg) commit((m) => ({ ...m, interview: { ...m.interview, messages: [...m.interview.messages, userMsg] } }))
      const baseModel = userMsg ? { ...model, interview: { ...model.interview, messages: [...model.interview.messages, userMsg] } } : model
      const ctx = { model: baseModel, messages: baseModel.interview.messages, focusProcessId: nav.level === "process" ? nav.processId : baseModel.interview.focusProcessId, instructions: baseModel.interview.instructions }

      let turn
      const t0 = Date.now()
      try {
        turn = await interviewerRef.current.next(ctx, userText)
      } catch (err) {
        if (err instanceof NoApiKeyError && interviewerRef.current === claudeInterviewer) {
          interviewerRef.current = createScriptedInterviewer()
          setProviderName(interviewerRef.current.name)
          try {
            turn = await interviewerRef.current.next(ctx, userText)
          } catch (e2) {
            setAiError((e2 as Error).message)
          }
        } else setAiError((err as Error).message)
      }
      if (turn) {
        if (turn.provider) setProviderName(turn.provider)
        const aiId = newId("m")
        const { model: next, derived } = applyOps(baseModel, turn.ops, aiId)
        const aiMsg = {
          id: aiId,
          role: "ai" as const,
          text: turn.say,
          at: Date.now(),
          derived: derived.length ? derived : undefined,
          trace: { provider: turn.provider ?? interviewerRef.current.name, detail: turn.providerDetail, ms: Date.now() - t0, ops: turn.ops.length },
        }
        // Focus the process most recently touched so drill-down follows the conversation
        const focus = next.processes.find((p) => p.doc.nodes.some((n) => n.messageId === aiId))?.id ?? ctx.focusProcessId
        commit(() => ({ ...next, interview: { messages: [...next.interview.messages, aiMsg], focusProcessId: focus } }), false)
        if (focus && nav.level !== "process") {
          const proc = next.processes.find((p) => p.id === focus)
          if (proc && next.processes.length === 1 && next.areas.length === 1) setNav({ level: "process", processId: focus })
        }
      }
      setBusy(false)
    },
    [commit, model, nav],
  )

  const resetInterview = () => {
    interviewerRef.current = claudeInterviewer
    setProviderName(claudeInterviewer.name)
    commit((m) => ({ ...m, interview: { messages: [] } }))
    setTimeout(() => runTurn(null), 0)
  }

  /* ------------------------------------------------------------- files */

  const createWorkspace = (templateId?: string) => {
    const t = templateId ? getTemplateById(templateId) : undefined
    const ws = t ? workspaceFromTemplate(t) : workspaceFromTemplate(getTemplateById("empty")!, "New company")
    setWorkspaces((all) => [...all, ws])
    setActiveId(ws.id)
    history.reset()
    navigate({ level: "company" })
  }

  const switchWorkspace = (id: string) => {
    if (id === "__new__") return createWorkspace()
    if (id.startsWith("__tpl__")) return createWorkspace(id.slice(7))
    setActiveId(id)
    history.reset()
    navigate({ level: "company" })
  }

  const deleteWorkspace = () => {
    if (!confirm(`Delete "${active.name}" and everything in it?`)) return
    const rest = workspaces.filter((w) => w.id !== activeId)
    const next = rest.length ? rest : [workspaceFromTemplate(getTemplateById("empty")!, "My company")]
    setWorkspaces(next)
    setActiveId(next[0].id)
    history.reset()
    navigate({ level: "company" })
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = coerceImport(JSON.parse(String(reader.result)))
        if (!imported) return alert("Not a workflow file.")
        if (imported.kind === "workspace") {
          setWorkspaces((all) => [...all, imported.workspace])
          setActiveId(imported.workspace.id)
          history.reset()
          navigate({ level: "company" })
        } else {
          const name = imported.name || file.name.replace(/\.json$/i, "") || "Imported"
          const areaId = newId("area")
          const procId = newId("proc")
          commit((m) => ({
            ...m,
            areas: [...m.areas, { id: areaId, name, order: m.areas.length, color: AREA_COLORS[m.areas.length % AREA_COLORS.length] }],
            processes: [...m.processes, { id: procId, areaId, name, doc: imported.doc }],
          }))
          navigate({ level: "process", processId: procId })
        }
      } catch {
        alert("Could not parse that file as JSON.")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  /* ---------------------------------------------------------------- render */

  const inspectorProcessId = nav.level === "process" ? nav.processId : undefined
  const showInspector = selection !== null
  const selectedEdgeId = selection?.kind === "edge" ? selection.id : null

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <Select value={activeId} onValueChange={switchWorkspace}>
          <SelectTrigger className="h-8 w-[180px] text-sm font-medium"><SelectValue /></SelectTrigger>
          <SelectContent>
            {workspaces.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            <SelectItem value="__new__">＋ New company</SelectItem>
            {templates.filter((t) => t.id !== "empty").map((t) => <SelectItem key={t.id} value={`__tpl__${t.id}`}>＋ {t.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <nav className="flex min-w-0 items-center gap-1 text-sm">
          <Crumb active={nav.level === "company"} onClick={() => navigate({ level: "company" })}>{model.company.name}</Crumb>
          {currentArea && (
            <>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Crumb active={nav.level === "area"} onClick={() => navigate({ level: "area", areaId: currentArea.id })}>{currentArea.name}</Crumb>
            </>
          )}
          {currentProcess && (
            <>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Crumb active>{currentProcess.name}</Crumb>
            </>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {nav.level === "process" && (
            <div className="mr-2 flex items-center rounded-md border border-border p-0.5">
              {VIEWS.map((v) => (
                <button key={v} type="button" title={VIEW_META[v].hint} onClick={() => setView(v)} className={cn("rounded px-2 py-0.5 text-xs", view === v ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {VIEW_META[v].label}
                </button>
              ))}
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={!history.canUndo} title="Undo — Ctrl+Z"><Undo2 className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={!history.canRedo} title="Redo — Ctrl+Shift+Z"><Redo2 className="h-4 w-4" /></Button>
          <Button variant={drawerOpen ? "secondary" : "default"} size="sm" onClick={() => setDrawerOpen((o) => !o)} title="Open the AI interview">
            <Sparkles className="mr-1.5 h-4 w-4" /> {drawerOpen ? "Interview" : "AI interview"}
            {busy && <Mic className="ml-1.5 h-3 w-3 animate-pulse" />}
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} title="Import JSON"><Upload className="h-4 w-4" /></Button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
          <ExportDialog model={model} process={currentProcess} workspaceName={active.name} />
          <ReportDialog model={model} findings={findings} />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowWelcome(true)} title="How this works"><HelpCircle className="h-4 w-4" /></Button>
          {mounted && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} title="Toggle theme">
              {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {nav.level === "company" && (
            <OverviewCanvas model={model} findings={findings} selection={selection} setSelection={setSelection} commit={commit} snapshot={snapshot} onOpenArea={openArea} onStartInterview={() => setDrawerOpen(true)} />
          )}
          {nav.level === "area" && currentArea && (
            <AreaView model={model} area={currentArea} selection={selection} setSelection={setSelection} commit={commit} onOpenProcess={(id) => navigate({ level: "process", processId: id })} />
          )}
          {nav.level === "process" && currentProcess && (
            <ProcessCanvas key={currentProcess.id} model={model} process={currentProcess} findings={findings} view={view} selection={selection} setSelection={setSelection} commitDoc={commitDoc} snapshot={snapshot} undo={undo} redo={redo} />
          )}

          <BottomTray
            model={model}
            findings={findings}
            processId={inspectorProcessId}
            selectedEdgeId={selectedEdgeId}
            onSelectRef={(ref) => {
              const { nav: n, selection: s } = navForRef(ref)
              navigate(n, s)
            }}
            onAnswerQuestion={(id, answer) => commit((m) => ({ ...m, questions: m.questions.map((q) => (q.id === id ? { ...q, status: "answered", answer } : q)) }))}
            onDismissQuestion={(id) => commit((m) => ({ ...m, questions: m.questions.map((q) => (q.id === id ? { ...q, status: "dismissed" } : q)) }))}
          />
        </div>

        {showInspector && <Inspector selection={selection} model={model} processId={inspectorProcessId} commit={commit} onNavigate={navigate} onClose={() => setSelection(null)} />}

        {drawerOpen && (
          <InterviewPanel
            model={model}
            busy={busy}
            providerName={providerName}
            error={aiError}
            onSend={(t) => runTurn(t)}
            onStart={() => runTurn(null)}
            onReset={resetInterview}
            onClose={() => setDrawerOpen(false)}
            onInstructions={(text) => commit((m) => ({ ...m, interview: { ...m.interview, instructions: text || undefined } }), false)}
          />
        )}

        {showWelcome && (
          <Welcome
            onClose={() => setShowWelcome(false)}
            onStartInterview={() => {
              setShowWelcome(false)
              if (model.processes.length) createWorkspace()
              setDrawerOpen(true)
            }}
            onExploreSample={() => {
              setShowWelcome(false)
              if (!model.processes.length) commit(() => workspaceFromTemplate().model)
              navigate({ level: "company" })
            }}
          />
        )}
      </div>

      <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-border bg-card px-3 text-[11px] text-muted-foreground">
        <span>{model.areas.length} areas</span>
        <span>{model.processes.length} processes</span>
        <span>{model.actors.length} actors</span>
        <span>{model.systems.length} systems</span>
        <span>{model.questions.filter((q) => q.status === "open").length} open questions</span>
        {nav.level === "company" && (
          <button type="button" onClick={() => { const id = newId("area"); commit((m) => ({ ...m, areas: [...m.areas, { id, name: `Area ${m.areas.length + 1}`, order: m.areas.length, color: AREA_COLORS[m.areas.length % AREA_COLORS.length] }] })); setSelection({ kind: "area", id }) }} className="flex items-center gap-0.5 hover:text-foreground">
            <Plus className="h-3 w-3" /> area
          </button>
        )}
        {nav.level === "area" && currentArea && (
          <button type="button" onClick={() => { const id = newId("proc"); commit((m) => ({ ...m, processes: [...m.processes, { id, areaId: currentArea.id, name: `Process ${m.processes.filter((p) => p.areaId === currentArea.id).length + 1}`, doc: blankDoc() }] })); navigate({ level: "process", processId: id }) }} className="flex items-center gap-0.5 hover:text-foreground">
            <Plus className="h-3 w-3" /> process
          </button>
        )}
        <button type="button" onClick={deleteWorkspace} className="ml-auto hover:text-foreground">Delete company</button>
      </footer>
    </div>
  )
}

function Crumb({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className={cn("max-w-[220px] truncate rounded px-1.5 py-0.5", active ? "font-semibold text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
      {children}
    </button>
  )
}
