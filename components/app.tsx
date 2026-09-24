"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { ChevronRight, HelpCircle, Moon, Sun, Undo2, Redo2, Upload, Sparkles, Mic, Plus, PencilRuler, Check, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  AREA_COLORS,
  blankDoc,
  blankModel,
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
import { LoopView } from "./loop-view"
import { LoopMap } from "./loop-map"
import { allStageStarters, businessTypeFor, loopAreas, loopModel, type BusinessType } from "@/lib/loops"
import { StagePage, type StageTab } from "./stage-page"
import { ProcessCanvas } from "./process-canvas"
import { Inspector } from "./inspector"
import { BottomTray } from "./bottom-tray"
import { InterviewPanel } from "./interview-panel"
import { ExportDialog } from "./export-dialog"
import { ReportDialog } from "./report-dialog"
import { Welcome } from "./welcome"

const subscribeNoop = () => () => {}

export default function App() {
  // Deterministic boot state so server and client render the same tree; real state loads after mount
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => [{ id: "ws_boot", name: "Loading…", model: blankModel("Loading…") }])
  const [activeId, setActiveId] = useState("ws_boot")
  const [loaded, setLoaded] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)

  const [nav, setNav] = useState<Nav>({ level: "company" })
  const [selection, setSelection] = useState<Selection>(null)
  const [view, setView] = useState<View>("operational")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [companyView, setCompanyView] = useState<"map" | "cards">("map")
  const [stageTab, setStageTab] = useState<StageTab>("steps")
  const [stageProcessId, setStageProcessId] = useState<string | undefined>(undefined)

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

  /** Level 2: the stage page (Steps / Diagram / SOP / Data). Hand editing (level 3) is reached from there. */
  const openStage = (areaId: string, tab: StageTab = "steps", processId?: string) => {
    setStageTab(tab)
    setStageProcessId(processId)
    navigate({ level: "area", areaId })
  }
  const openArea = (areaId: string) => openStage(areaId)

  /** Navigation from findings, questions, and the map: workflows open inside their stage, never the hand editor. */
  const goTo = useCallback(
    (n: Nav, s: Selection = null) => {
      if (n.level === "process") {
        const p = model.processes.find((x) => x.id === n.processId)
        if (p) {
          setStageTab(s?.kind === "node" || s?.kind === "edge" ? "diagram" : "steps")
          setStageProcessId(p.id)
          navigate({ level: "area", areaId: p.areaId }, s)
          return
        }
      }
      navigate(n, s)
    },
    [model.processes, navigate],
  )

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

  /** The focus the drawer last asked about; set by the re-ask effect and by turns that move the user themselves. */
  const askedFor = useRef<string | null>(null)

  const runTurn = useCallback(
    async (userText: string | null) => {
      setBusy(true)
      setAiError(null)
      const userMsg = userText !== null ? { id: newId("m"), role: "user" as const, text: userText, at: Date.now() } : null
      if (userMsg) commit((m) => ({ ...m, interview: { ...m.interview, messages: [...m.interview.messages, userMsg] } }))
      const baseModel = userMsg ? { ...model, interview: { ...model.interview, messages: [...model.interview.messages, userMsg] } } : model
      const focusAreaId = nav.level === "area" ? nav.areaId : nav.level === "process" ? baseModel.processes.find((p) => p.id === nav.processId)?.areaId : undefined
      const focusNodeId = selection?.kind === "node" ? selection.id : undefined
      const ctx = {
        model: baseModel,
        messages: baseModel.interview.messages,
        level: focusNodeId && focusAreaId ? ("step" as const) : focusAreaId ? ("stage" as const) : ("company" as const),
        focusAreaId,
        focusNodeId,
        focusProcessId: nav.level === "process" ? nav.processId : (baseModel.interview.focusProcessId && baseModel.processes.find((p) => p.id === baseModel.interview.focusProcessId)?.areaId === focusAreaId ? baseModel.interview.focusProcessId : undefined),
        instructions: baseModel.interview.instructions,
        depth: baseModel.interview.depth ?? ("map" as const),
      }

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
        const applied = applyOps(baseModel, turn.ops, aiId)
        let next = applied.model
        const derived = applied.derived
        // The business is known but no stages came back: seed the overview from the closest industry template
        if (next.areas.length === 0 && next.company.industry) {
          const bt = businessTypeFor(next.company.industry)
          const { areas, links } = loopAreas(bt.stages)
          next = { ...next, areas, areaLinks: links }
          derived.push(`+ Overview: ${areas.filter((a) => !a.side).map((a) => a.name).join(" → ")} (typical for ${bt.label.toLowerCase()})`)
        }
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
        commit(() => ({ ...next, interview: { ...next.interview, messages: [...next.interview.messages, aiMsg], focusProcessId: focus } }), false)
        // From the map, the conversation lands in a stage: follow it there so the steps appear as they are said
        if (focus && nav.level === "company") {
          const proc = next.processes.find((p) => p.id === focus)
          if (proc && proc.doc.nodes.some((n) => n.messageId === aiId)) {
            setStageTab("steps")
            setStageProcessId(proc.id)
            askedFor.current = `area:${proc.areaId}`
            setNav({ level: "area", areaId: proc.areaId })
          }
        }
      }
      setBusy(false)
    },
    [commit, model, nav, selection],
  )

  // Moving to another stage while the drawer is open: ask a fresh, contextual question there
  const focusKey = nav.level === "company" ? "company" : nav.level === "area" ? `area:${nav.areaId}` : `area:${currentProcess?.areaId ?? ""}`
  useEffect(() => {
    if (!drawerOpen) {
      askedFor.current = null
      return
    }
    if (busy) return
    if (askedFor.current === null) {
      askedFor.current = focusKey
      return
    }
    if (askedFor.current === focusKey) return
    askedFor.current = focusKey
    if (model.interview.messages.length) {
      const t = setTimeout(() => runTurn(null), 0)
      return () => clearTimeout(t)
    }
  }, [drawerOpen, focusKey, busy, model.interview.messages.length, runTurn])

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

  /** New company: from an industry template, or blank (the AI or the user lays out the stages). */
  const createLoopWorkspace = (type: BusinessType | null) => {
    const ws = { id: newId("ws"), name: "New company", model: type ? loopModel(type) : blankModel("New company") }
    setWorkspaces((all) => [...all, ws])
    setActiveId(ws.id)
    history.reset()
    navigate({ level: "company" })
  }

  /** "Map this stage": capture steps in the outline first; it creates the workflow on the first step. */
  const mapArea = (areaId: string) => openStage(areaId)

  /** Point the interviewer at one stage and open its outline. */
  const askAbout = (areaId: string) => {
    const area = model.areas.find((a) => a.id === areaId)
    if (!area) return
    const existing = model.processes.find((p) => p.areaId === areaId)
    let pid = existing?.id
    if (!pid) {
      pid = newId("proc")
      const id = pid
      commit((m) => ({ ...m, processes: [...m.processes, { id, areaId, name: area.name, doc: blankDoc() }] }))
    }
    commit((m) => ({ ...m, interview: { ...m.interview, focusProcessId: pid } }), false)
    if (nav.level !== "area" || nav.areaId !== areaId) openStage(areaId)
    setDrawerOpen(true)
  }

  const switchWorkspace = (id: string) => {
    if (id === "__new__") return setShowWelcome(true)
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

  const stageProcess = nav.level === "area" ? (model.processes.find((p) => p.id === stageProcessId && p.areaId === nav.areaId) ?? model.processes.find((p) => p.areaId === nav.areaId)) : undefined
  const inspectorProcessId = nav.level === "process" ? nav.processId : stageProcess?.id
  const showInspector = selection !== null
  const selectedEdgeId = selection?.kind === "edge" ? selection.id : null

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowWelcome(true)} title="Home: your companies, start a new one"><Home className="h-4 w-4" /></Button>
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
          {nav.level === "company" && <span className="text-[11px] text-muted-foreground">Overview</span>}
          {nav.level === "area" && <span className="ml-1 text-[11px] text-muted-foreground">Stage</span>}
          {nav.level === "process" && <span className="ml-1 rounded bg-amber-500/15 px-1.5 text-[11px] text-amber-700 dark:text-amber-400">Editing by hand</span>}
          {currentArea && (
            <>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Crumb active={nav.level === "area"} onClick={() => openStage(currentArea.id, nav.level === "process" ? "diagram" : stageTab, currentProcess?.id)}>{currentArea.name}</Crumb>
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
          {nav.level === "area" && stageProcess && stageTab === "diagram" && (
            <Button variant="ghost" size="sm" className="mr-1 text-xs text-muted-foreground" onClick={() => navigate({ level: "process", processId: stageProcess.id })} title="Open the full diagram editor: draw steps, lanes, frames and connections by hand">
              <PencilRuler className="mr-1 h-3.5 w-3.5" /> Edit by hand
            </Button>
          )}
          {nav.level === "process" && currentProcess && (
            <Button variant="secondary" size="sm" className="mr-2 text-xs" onClick={() => openStage(currentProcess.areaId, "diagram", currentProcess.id)}>
              <Check className="mr-1 h-3.5 w-3.5" /> Done editing
            </Button>
          )}
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
          {nav.level === "company" && companyView === "map" && (
            <div className="relative flex min-h-0 flex-1 flex-col">
              <LoopMap model={model} findings={findings} selection={selection} setSelection={setSelection} onOpenArea={openArea} onMapArea={mapArea} onAskAbout={askAbout} onNavigate={goTo} commit={commit} snapshot={snapshot} onStartInterview={() => setDrawerOpen(true)} />
              <MapStyle value={companyView} onChange={setCompanyView} />
            </div>
          )}
          {nav.level === "company" && companyView === "cards" && (
            <LoopView
              model={model}
              findings={findings}
              selection={selection}
              setSelection={setSelection}
              commit={commit}
              onOpenArea={openArea}
              onMapArea={mapArea}
              onAskAbout={askAbout}
              onStartInterview={() => setDrawerOpen(true)}
            />
          )}
          {nav.level === "company" && companyView === "cards" && <MapStyle value={companyView} onChange={setCompanyView} />}
          {nav.level === "area" && currentArea && (
            <StagePage
              model={model}
              area={currentArea}
              findings={findings}
              selection={selection}
              setSelection={setSelection}
              commit={commit}
              snapshot={snapshot}
              undo={undo}
              redo={redo}
              onAskAbout={askAbout}
              onBack={() => navigate({ level: "company" })}
              tab={stageTab}
              onTab={setStageTab}
              processId={stageProcessId}
            />
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
              goTo(n, s)
            }}
            onAnswerQuestion={(id, answer) => commit((m) => ({ ...m, questions: m.questions.map((q) => (q.id === id ? { ...q, status: "answered", answer } : q)) }))}
            onDismissQuestion={(id) => commit((m) => ({ ...m, questions: m.questions.map((q) => (q.id === id ? { ...q, status: "dismissed" } : q)) }))}
          />
        </div>

        {showInspector && <Inspector selection={selection} model={model} processId={inspectorProcessId} commit={commit} onNavigate={goTo} onClose={() => setSelection(null)} />}

        {drawerOpen && (
          <InterviewPanel
            key={activeId}
            model={model}
            busy={busy}
            providerName={providerName}
            focusLabel={nav.level === "company" ? "the whole business" : (currentArea?.name ?? "this stage") + (selection?.kind === "node" ? " · one step" : "")}
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
            companies={workspaces.filter((w) => w.id !== "ws_boot").map((w) => ({ id: w.id, name: w.name, active: w.id === activeId }))}
            onOpenCompany={(id) => { setShowWelcome(false); switchWorkspace(id) }}
            onClose={() => setShowWelcome(false)}
            onStart={(type, withAi) => {
              setShowWelcome(false)
              createLoopWorkspace(type)
              if (withAi) setDrawerOpen(true)
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
        <span>{model.areas.length} stages</span>
        <span>{model.processes.length} workflows</span>
        <span>{model.actors.length} actors</span>
        <span>{model.systems.length} systems</span>
        <span>{model.questions.filter((q) => q.status === "open").length} open questions</span>
        {nav.level === "company" && (
          <label className="relative flex cursor-pointer items-center gap-0.5 hover:text-foreground" title="Add a stage: pick a typical one or name your own">
            <Plus className="h-3 w-3" /> stage
            <select
              value=""
              onChange={(e) => {
                const v = e.target.value
                if (!v) return
                const starter = v === "__custom__" ? undefined : allStageStarters().find((st) => st.name === v)
                const name = starter ? starter.name : (prompt("Name the stage") ?? "").trim()
                if (!name) return
                const id = newId("area")
                commit((m) => ({ ...m, areas: [...m.areas, { id, name, order: m.areas.length, color: AREA_COLORS[m.areas.length % AREA_COLORS.length], side: starter?.side, sketch: starter?.nodes }] }))
                setSelection({ kind: "area", id })
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Add a stage"
            >
              <option value="">Add a stage…</option>
              {allStageStarters().filter((st) => !model.areas.some((a) => a.name.toLowerCase() === st.name.toLowerCase())).map((st) => <option key={st.name} value={st.name}>{st.name}</option>)}
              <option value="__custom__">Custom name…</option>
            </select>
          </label>
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

function MapStyle({ value, onChange }: { value: "map" | "cards"; onChange: (v: "map" | "cards") => void }) {
  return (
    <div className="absolute right-3 top-3 z-30 flex items-center rounded-md border border-border bg-card/95 p-0.5 text-xs shadow-sm backdrop-blur">
      {(["map", "cards"] as const).map((v) => (
        <button key={v} type="button" onClick={() => onChange(v)} className={cn("rounded px-2 py-0.5", value === v ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
          {v === "map" ? "Overview" : "Cards"}
        </button>
      ))}
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
