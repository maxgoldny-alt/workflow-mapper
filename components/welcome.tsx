"use client"

import { useState } from "react"
import { Rows3, MessageSquareText, Shuffle, X, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BUSINESS_TYPES, type BusinessType } from "@/lib/loops"

interface WelcomeProps {
  /** Create a company with this loop, then optionally open the interviewer. */
  onStart: (type: BusinessType, withAi: boolean) => void
  onExploreSample: () => void
  onClose: () => void
}

/**
 * First-run card. Explains the three ideas the product rests on, then offers
 * the AI interview or the sample company. Reopens from the "?" in the header.
 */
export function Welcome({ onStart, onExploreSample, onClose }: WelcomeProps) {
  const [picking, setPicking] = useState(false)
  const [type, setType] = useState<BusinessType>("service")

  if (picking) {
    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/60 p-4 backdrop-blur-[2px]" onPointerDown={onClose}>
        <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => setPicking(false)} className="absolute left-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Close">
            <X className="h-4 w-4" />
          </button>
          <h2 className="text-center text-lg font-semibold">What type of business are we mapping?</h2>
          <p className="mt-1 text-center text-sm text-muted-foreground">You get a starter loop with the right stage names. Rename anything later.</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            {BUSINESS_TYPES.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setType(b.id)}
                className={cn("rounded-xl border-2 p-3 text-left transition-colors", type === b.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}
              >
                <div className="text-sm font-medium">{b.label}</div>
                <div className="text-[11px] text-muted-foreground">{b.hint}</div>
              </button>
            ))}
          </div>
          <div className="mt-5 flex gap-2">
            <Button className="flex-1" onClick={() => onStart(type, true)}>Build the loop with AI</Button>
            <Button variant="outline" className="flex-1" onClick={() => onStart(type, false)}>Just give me the loop</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/60 p-4 backdrop-blur-[2px]" onPointerDown={onClose}>
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Close">
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-semibold">Map the full business loop first. Then drill into each part.</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Start with the whole operating cycle on one screen: where customers come from, how work comes in, gets done, gets paid, and comes back. Open any stage to map who does what, in which system, and where it gets handed off.
        </p>

        <ol className="mt-5 space-y-3">
          <Step icon={MessageSquareText} color="#4f46e5" title="Tell it what happens">
            One question at a time. “I don’t know” is a valid answer; it becomes an open question instead of a guess.
          </Step>
          <Step icon={Rows3} color="#0891b2" title="Loop first, workflows second">
            The loop shows only the big picture. Open a stage to map the detailed workflow in swimlanes.
          </Step>
          <Step icon={Shuffle} color="#dc2626" title="Handoffs record how work moves today">
            Channel, person or system, integration state, trigger, and what data moves. Issues are observations, not recommendations.
          </Step>
        </ol>

        <div className="mt-6 flex gap-2">
          <Button className="flex-1" onClick={() => setPicking(true)}>
            Start a new company
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
