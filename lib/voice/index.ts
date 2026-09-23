/**
 * Voice abstraction. The interview panel talks to these interfaces only, so the
 * Web Speech implementation below can be swapped for a cloud STT/TTS provider
 * without touching the UI.
 */

export interface SpeechInput {
  readonly supported: boolean
  start(handlers: { onInterim?: (text: string) => void; onFinal: (text: string) => void; onEnd?: () => void; onError?: (message: string) => void }): void
  /** Stop listening and deliver whatever was heard so far. */
  stop(): void
  readonly listening: boolean
}

export interface SpeechOutput {
  readonly supported: boolean
  speak(text: string, onEnd?: () => void): void
  cancel(): void
}

export interface VoiceProviders {
  input: SpeechInput
  output: SpeechOutput
}

/** How long the speaker has to be quiet before the answer counts as finished. */
const SILENCE_MS = 2500

/* ------------------------------------------------------------ web speech */

type SR = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}
type SRCtor = new () => SR

function recognitionCtor(): SRCtor | undefined {
  if (typeof window === "undefined") return undefined
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/**
 * Continuous recognition: the browser keeps listening through pauses, and the
 * answer is finished only after SILENCE_MS of quiet following the last words,
 * or when the user presses stop. People think while they talk; a single-shot
 * recognizer would cut them off at the first breath.
 */
class WebSpeechInput implements SpeechInput {
  private rec: SR | null = null
  private finalText = ""
  private interimText = ""
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private handlers: Parameters<SpeechInput["start"]>[0] | null = null
  private finished = false
  listening = false
  readonly supported = !!recognitionCtor()

  start(h: Parameters<SpeechInput["start"]>[0]) {
    const Ctor = recognitionCtor()
    if (!Ctor) {
      h.onError?.("Speech recognition is not available in this browser")
      return
    }
    this.teardown()
    this.handlers = h
    this.finalText = ""
    this.interimText = ""
    this.finished = false
    const rec = new Ctor()
    rec.lang = navigator.language || "en-US"
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      let interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) this.finalText += (this.finalText ? " " : "") + r[0].transcript.trim()
        else interim += r[0].transcript
      }
      this.interimText = interim.trim()
      h.onInterim?.((this.finalText + (this.interimText ? " " + this.interimText : "")).trim())
      this.armSilence()
    }
    rec.onend = () => {
      // Chrome ends continuous sessions on its own after a while; restart unless we finished
      if (this.finished || !this.listening) return this.finish()
      try {
        rec.start()
      } catch {
        this.finish()
      }
    }
    rec.onerror = (e) => {
      if (e.error === "no-speech") return
      if (e.error === "aborted") return
      this.listening = false
      h.onError?.(e.error)
      this.finish()
    }
    this.rec = rec
    this.listening = true
    rec.start()
  }

  stop() {
    if (!this.listening) return
    this.listening = false
    this.finish()
  }

  private armSilence() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer)
    this.silenceTimer = setTimeout(() => {
      if (this.finalText.trim()) this.stop()
    }, SILENCE_MS)
  }

  private finish() {
    if (this.finished) return
    this.finished = true
    this.listening = false
    if (this.silenceTimer) clearTimeout(this.silenceTimer)
    this.silenceTimer = null
    const text = (this.finalText + (this.interimText ? " " + this.interimText : "")).trim()
    const h = this.handlers
    this.teardown()
    if (text) h?.onFinal(text)
    h?.onEnd?.()
  }

  private teardown() {
    if (this.rec) {
      const r = this.rec
      this.rec = null
      r.onresult = null
      r.onend = null
      r.onerror = null
      try {
        r.abort()
      } catch {
        /* already stopped */
      }
    }
  }
}

class WebSpeechOutput implements SpeechOutput {
  readonly supported = typeof window !== "undefined" && "speechSynthesis" in window
  private voice: SpeechSynthesisVoice | null = null

  /** Prefer a natural-sounding voice in the user's language when the browser ships one. */
  private pickVoice(): SpeechSynthesisVoice | null {
    if (this.voice) return this.voice
    const voices = window.speechSynthesis.getVoices()
    if (!voices.length) return null
    const lang = (navigator.language || "en-US").toLowerCase()
    const inLang = voices.filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)))
    const pool = inLang.length ? inLang : voices
    const score = (v: SpeechSynthesisVoice) =>
      (/natural|neural|premium|enhanced/i.test(v.name) ? 8 : 0) +
      (/google|microsoft/i.test(v.name) ? 3 : 0) +
      (v.lang.toLowerCase() === lang ? 2 : 0) +
      (v.localService ? 0 : 1)
    this.voice = [...pool].sort((a, b) => score(b) - score(a))[0] ?? null
    return this.voice
  }

  speak(text: string, onEnd?: () => void) {
    if (!this.supported) return
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const v = this.pickVoice()
    if (v) u.voice = v
    u.rate = 1.0
    u.pitch = 1.0
    u.onend = () => onEnd?.()
    u.onerror = () => onEnd?.()
    synth.speak(u)
  }

  cancel() {
    if (this.supported) window.speechSynthesis.cancel()
  }
}

let cached: VoiceProviders | null = null

/** Runtime-detected providers. Safe to call on the server: everything reports unsupported. */
export function createVoice(): VoiceProviders {
  if (!cached) cached = { input: new WebSpeechInput(), output: new WebSpeechOutput() }
  return cached
}
