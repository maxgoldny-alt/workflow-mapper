"use client"

import { useState } from "react"
import { Rows3, MessageSquareText, Shuffle, X, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BUSINESS_TYPES, type BusinessType } from "@/lib/loops"

interface WelcomeProps {
  companies: { id: string; name: string; active: boolean }[]
  onOpenCompany: (id: string) => void
  /** Create a company with this loop, then optionally open the interviewer. */
  onStart: (type: BusinessType, withAi: boolean) => void
  onExploreSample: () => void
  onClose: () => void
}

/**
 * First-run card. Explains the three ideas the product rests on, then offers
 * the AI interview or the sample company. Reopens from the "?" in the header.
 */
export function Welcome({ companies, onOpenCompany, onStart, onExploreSample, onClose }: WelcomeProps) {
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
          <p className="mt-1 text-center text-sm text-muted-foreground">You get the typical stages for that kind of business as a starting point. Add, rename, or delete any of them; the AI adds a stage when you describe work that belongs to one.</p>
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
          <div className="mt-5 flex flex-col gap-2">
            <Button onClick={() => onStart(type, true)}>Create it and start the interview</Button>
            <Button variant="outline" onClick={() => onStart(type, false)}>Create it, I will fill it in myself</Button>
            <p className="text-center text-[11px] text-muted-foreground">Both give the same map. The interview just starts asking right away; you can open it any time.</p>
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

        <h2 className="text-lg font-semibold">A clean map of how your business actually runs, end to end.</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Not how it should run. How it runs today, dysfunction included. Start with the whole loop on one screen, then open any stage and talk through it. The map builds itself; the AI asks what an operations analyst would ask.
        </p>

        <ol className="mt-5 space-y-3">
          <Step icon={Rows3} color="#0891b2" title="The loop first">
            Every stage of the business on one screen: where customers come from, how work comes in, gets done, gets paid, comes back. Stages you have not mapped yet show what is typical for your kind of business.
          </Step>
          <Step icon={MessageSquareText} color="#4f46e5" title="Talk through each stage">
            Open a stage and describe it, or type the steps straight in. Who does it, in which system, how the next person knows it is ready. Steps, diagram, SOP, and data flow are the same facts, four ways.
          </Step>
          <Step icon={Shuffle} color="#dc2626" title="See what the map shows">
            Manual handoffs, re-entered data, one-person dependencies, open questions. Hand the SOP to a consultant or an automation builder when you are ready.
          </Step>
        </ol>

        {companies.length > 0 && (
          <div className="mt-5">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Your companies</div>
            <div className="flex flex-wrap gap-1.5">
              {companies.map((c) => (
                <button key={c.id} type="button" onClick={() => onOpenCompany(c.id)} className={cn("rounded-full border px-3 py-1 text-xs", c.active ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex gap-2">
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
