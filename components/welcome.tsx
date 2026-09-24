"use client"

import { Rows3, MessageSquareText, Shuffle, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface WelcomeProps {
  onStartInterview: () => void
  onExploreSample: () => void
  onClose: () => void
}

/**
 * First-run card. Explains the three ideas the product rests on, then offers
 * the AI interview or the sample company. Reopens from the "?" in the header.
 */
export function Welcome({ onStartInterview, onExploreSample, onClose }: WelcomeProps) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/60 p-4 backdrop-blur-[2px]" onPointerDown={onClose}>
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Close">
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-semibold">Map how the business really works</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Explain it in plain words. The interviewer asks the questions an operations analyst would ask, and a current-state model builds itself: areas, processes, people, systems, handoffs, and the gaps nobody has answered yet.
        </p>

        <ol className="mt-5 space-y-3">
          <Step icon={MessageSquareText} color="#4f46e5" title="Tell it what happens">
            One question at a time. “I don’t know” is a valid answer; it becomes an open question instead of a guess.
          </Step>
          <Step icon={Rows3} color="#0891b2" title="See it as areas, then processes, then steps">
            The overview shows only the big picture. Double-click an area to drill into who does what, in swimlanes.
          </Step>
          <Step icon={Shuffle} color="#dc2626" title="Handoffs record how work moves today">
            Channel, person or system, integration state, trigger, and what data moves. Findings are observations, not recommendations.
          </Step>
        </ol>

        <div className="mt-6 flex gap-2">
          <Button className="flex-1" onClick={onStartInterview}>
            Start mapping with AI
          </Button>
          <Button variant="outline" className="flex-1" onClick={onExploreSample}>
            Explore the sample company
          </Button>
        </div>
      </div>
    </div>
  )
}

function Step({ icon: Icon, color, title, children }: { icon: typeof Rows3; color: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}1a`, color }}>
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </li>
  )
}
