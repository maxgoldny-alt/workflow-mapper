/**
 * Voice abstraction. The interview panel talks to these interfaces only, so the
 * Web Speech implementation below can be swapped for a cloud STT/TTS provider
 * without touching the UI.
 */

export interface SpeechInput {
  readonly supported: boolean
  start(handlers: { onInterim?: (text: string) => void; onFinal: (text: string) => void; onEnd?: () => void; onError?: (message: string) => void }): void
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

class WebSpeechInput implements SpeechInput {
  private rec: SR | null = null
  listening = false
  readonly supported = !!recognitionCtor()

  start(h: Parameters<SpeechInput["start"]>[0]) {
    const Ctor = recognitionCtor()
    if (!Ctor) {
      h.onError?.("Speech recognition is not available in this browser")
      return
    }
    this.stop()
    const rec = new Ctor()
    rec.lang = navigator.language || "en-US"
    rec.continuous = false
    rec.interimResults = true
    let finalText = ""
    rec.onresult = (e) => {
      let interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else interim += r[0].transcript
      }
      if (interim) h.onInterim?.(finalText + interim)
      if (finalText && !interim) h.onInterim?.(finalText)
    }
    rec.onend = () => {
      this.listening = false
      this.rec = null
      if (finalText.trim()) h.onFinal(finalText.trim())
      h.onEnd?.()
    }
    rec.onerror = (e) => {
      this.listening = false
      if (e.error !== "no-speech" && e.error !== "aborted") h.onError?.(e.error)
    }
    this.rec = rec
    this.listening = true
    rec.start()
  }

  stop() {
    if (this.rec) {
      try {
        this.rec.stop()
      } catch {
        /* already stopped */
      }
    }
    this.listening = false
  }
}

class WebSpeechOutput implements SpeechOutput {
  readonly supported = typeof window !== "undefined" && "speechSynthesis" in window

  speak(text: string, onEnd?: () => void) {
    if (!this.supported) return
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.02
    u.onend = () => onEnd?.()
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
