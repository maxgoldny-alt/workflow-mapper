"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Mic, MicOff, Send, Volume2, VolumeX, X, Loader2, Square, RotateCcw, SlidersHorizontal } from "lucide-react"
import { INTERVIEWER_RULES } from "@/lib/ai/provider"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { InterviewMessage, Model } from "@/lib/model"
import { createVoice } from "@/lib/voice"

interface InterviewPanelProps {
  model: Model
  busy: boolean
  providerName: string
  /** Where the interviewer is looking: "the whole business", a stage name, or a stage plus one step. */
  focusLabel?: string
  error: string | null
  onSend: (text: string) => void
  onStart: () => void
  onReset: () => void
  onClose: () => void
  /** Save user-edited interviewer instructions (empty string restores the default). */
  onInstructions: (text: string) => void
}

/**
 * The AI interview drawer. Text by default; voice mode adds speech-to-text for
 * answers and optional read-aloud for questions. Everything voice goes through
 * `lib/voice`, so the provider can change without touching this file.
 */
export function InterviewPanel({ model, busy, providerName, focusLabel, error, onSend, onStart, onReset, onClose, onInstructions }: InterviewPanelProps) {
  const messages = model.interview.messages
  const [tuning, setTuning] = useState(false)
  const [rulesDraft, setRulesDraft] = useState(model.interview.instructions ?? INTERVIEWER_RULES)
  const [draft, setDraft] = useState("")
  const [voiceMode, setVoiceMode] = useState(false)
  const [listening, setListening] = useState(false)
  const [speak, setSpeak] = useState(true)
  const [autoSend, setAutoSend] = useState(true)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [voiceNames, setVoiceNames] = useState<{ name: string; lang: string }[]>([])
  const [chosenVoice, setChosenVoice] = useState<string | null>(null)
  const voice = useMemo(() => createVoice(), [])
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const spokenId = useRef<string | null>(null)
  const pending = useRef<string | null>(null)

  // An answer typed while the interviewer is still busy is queued, not dropped
  useEffect(() => {
    if (!busy && pending.current) {
      const t = pending.current
      pending.current = null
      onSend(t)
    }
  }, [busy, onSend])

  useEffect(() => {
    if (!messages.length) onStart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
  }, [messages.length, busy])

  const last = messages[messages.length - 1]

  useEffect(() => () => {
    voice.input.stop()
    voice.output.cancel()
  }, [voice])

  // Voice list loads asynchronously in Chrome; poll briefly until it appears
  useEffect(() => {
    if (!voiceMode || !voice.output.supported) return
    let tries = 0
    const tick = () => {
      const list = voice.output.voices()
      if (list.length || tries++ > 20) {
        setVoiceNames(list)
        setChosenVoice(voice.output.currentVoice())
      } else setTimeout(tick, 150)
    }
    tick()
  }, [voiceMode, voice])

  const submit = (text: string) => {
    const t = text.trim()
    if (!t) return
    voice.input.stop()
    setListening(false)
    setDraft("")
    if (busy) pending.current = t
    else onSend(t)
  }

  const startListening = () => {
    setVoiceError(null)
    voice.output.cancel()
    voice.input.start({
      onInterim: (t) => setDraft(t),
      onFinal: (t) => {
        setDraft(t)
        setListening(false)
        if (autoSend) submit(t)
        else inputRef.current?.focus()
      },
      onEnd: () => setListening(false),
      onError: (m) => {
        setVoiceError(m === "not-allowed" ? "Microphone access was blocked. Allow it in the browser and try again." : `Speech input error: ${m}`)
        setListening(false)
      },
    })
    setListening(true)
  }

  const stopListening = () => {
    voice.input.stop()
    setListening(false)
  }

  // Speak the newest AI question in voice mode, then open the mic
  useEffect(() => {
    if (!voiceMode || !last || last.role !== "ai" || spokenId.current === last.id || busy) return
    spokenId.current = last.id
    const startMic = () => {
      if (!voice.input.supported) return
      startListening()
    }
    if (speak && voice.output.supported) voice.output.speak(last.text, startMic)
    else startMic()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.id, voiceMode, busy])


  const toggleVoiceMode = () => {
    if (voiceMode) {
      stopListening()
      voice.output.cancel()
      setVoiceMode(false)
    } else {
      setVoiceMode(true)
      spokenId.current = null
    }
  }

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">AI interview</h2>
        <span className="truncate text-[11px] text-muted-foreground" title={providerName}>{providerName}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setRulesDraft(model.interview.instructions ?? INTERVIEWER_RULES)
              setTuning((t) => !t)
            }}
            title="Tune the interviewer: edit the instructions sent with every turn"
            className={cn("rounded p-1 hover:bg-muted hover:text-foreground", tuning ? "text-primary" : "text-muted-foreground", model.interview.instructions && "text-amber-600")}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onReset} title="Start over (clears the transcript, keeps the map)" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onClose} title="Close" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {focusLabel && !tuning && (
        <div className="border-b border-border bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
          Talking about <span className="font-medium text-foreground">{focusLabel}</span>. Open another stage to switch.
        </div>
      )}

      {tuning && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 border-b border-border p-3">
          <p className="text-xs text-muted-foreground">
            These instructions go to the model on every turn, before the current map and the conversation. Edit them to change how it asks, what it insists on, and what it records. {model.interview.instructions ? "Custom instructions are active." : "Showing the default."}
          </p>
          <textarea
            value={rulesDraft}
            onChange={(e) => setRulesDraft(e.target.value)}
            className="min-h-0 flex-1 resize-none rounded-md border border-input bg-background p-2 font-mono text-[11px] leading-relaxed outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { onInstructions(rulesDraft.trim() === INTERVIEWER_RULES.trim() ? "" : rulesDraft); setTuning(false) }}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => setRulesDraft(INTERVIEWER_RULES)}>Reset to default</Button>
            <Button size="sm" variant="ghost" onClick={() => setTuning(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div ref={listRef} className={cn("min-h-0 flex-1 space-y-3 overflow-auto px-3 py-3", tuning && "hidden")}>
        {messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
          </div>
        )}
        {error && <p className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-700">{error}</p>}
        {voiceError && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700">{voiceError}</p>}
      </div>

      <div className="border-t border-border p-2">
        <div className="mb-1.5 flex items-center gap-1">
          <button
            type="button"
            onClick={toggleVoiceMode}
            disabled={!voice.input.supported}
            title={voice.input.supported ? (voiceMode ? "Voice mode on: switch to text" : "Switch to voice mode") : "Speech recognition is not available in this browser"}
            className={cn("flex items-center gap-1 rounded-md border px-2 py-1 text-xs", voiceMode ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted", !voice.input.supported && "opacity-50")}
          >
            {voiceMode ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
            {voiceMode ? "Voice" : "Text"}
          </button>
          {voiceMode && (
            <>
              {listening ? (
                <button type="button" onClick={stopListening} className="flex items-center gap-1 rounded-md border border-red-500/50 bg-red-500/10 px-2 py-1 text-xs text-red-700">
                  <Square className="h-3 w-3" /> Stop
                </button>
              ) : (
                <button type="button" onClick={startListening} disabled={busy} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">
                  <Mic className="h-3.5 w-3.5" /> Listen
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSpeak((s) => !s)
                  if (speak) voice.output.cancel()
                }}
                disabled={!voice.output.supported}
                title={speak ? "Mute AI speech" : "Read questions aloud"}
                className={cn("rounded-md border border-border p-1 text-muted-foreground hover:bg-muted", !voice.output.supported && "opacity-50")}
              >
                {speak ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </button>
              <label className="ml-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} /> auto-send
              </label>
              {voiceNames.length > 0 && (
                <select
                  value={chosenVoice ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null
                    voice.output.setVoice(v)
                    setChosenVoice(v)
                    voice.output.speak("This is how I sound.")
                  }}
                  title="Read-aloud voice. Edge ships natural voices; Chrome on Windows mostly does not."
                  className="ml-1 max-w-[150px] truncate rounded-md border border-border bg-background px-1 py-1 text-[11px]"
                >
                  <option value="">Auto ({voiceNames[0]?.name})</option>
                  {voiceNames.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          {listening && (
            <span className="ml-auto flex items-center gap-1 text-[11px] text-red-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> listening
            </span>
          )}
        </div>

        <div className="flex items-end gap-1.5">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit(draft)
              }
            }}
            rows={2}
            placeholder={listening ? "Listening… you can edit before sending" : "Answer in plain words. “I don’t know” is fine."}
            className="min-h-[44px] flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <Button size="icon" className="h-9 w-9 shrink-0" disabled={!draft.trim() || busy} onClick={() => submit(draft)} title="Send (Enter)">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  )
}

function Bubble({ m }: { m: InterviewMessage }) {
  const ai = m.role === "ai"
  return (
    <div className={cn("flex flex-col", ai ? "items-start" : "items-end")}>
      <div className={cn("max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-snug", ai ? "rounded-tl-sm bg-muted text-foreground" : "rounded-tr-sm bg-primary text-primary-foreground")}>{m.text}</div>
      {m.trace && (
        <p className="mt-0.5 pl-1 text-[10px] text-muted-foreground/70" title={m.trace.detail ?? m.trace.provider}>
          {m.trace.provider} · {(m.trace.ms / 1000).toFixed(1)}s · {m.trace.ops} ops{m.trace.detail ? ` · ${m.trace.detail}` : ""}
        </p>
      )}
      {m.derived && m.derived.length > 0 && (
        <ul className="mt-1 max-w-[92%] space-y-0.5 pl-1 text-[11px] text-muted-foreground">
          {m.derived.map((d, i) => (
            <li key={i} className={cn(d.startsWith("?") && "text-amber-700", d.startsWith("!") && "text-red-700")}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
