"use client"

import { Rows3, MousePointerClick, Shuffle, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface WelcomeProps {
  onStartSample: () => void
  onStartBlank: () => void
  onClose: () => void
}

/**
 * First-run card. Explains the three ideas the whole tool rests on, then
 * offers a sample map or a blank board. Reopens from the "?" in the header.
 */
export function Welcome({ onStartSample, onStartBlank, onClose }: WelcomeProps) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/60 p-4 backdrop-blur-[2px]" onPointerDown={onClose}>
      <div
        className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-semibold">Map how work really moves</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Who does what, where it gets handed off, and whether that handoff is a person, an email, or an API.
        </p>

        <ol className="mt-5 space-y-3">
          <Step icon={Rows3} color="#0891b2" title="Each lane is an actor">
            A person, team, customer, or system. Press <Kbd>L</Kbd> to add one. Double-click the header to name it.
          </Step>
          <Step icon={MousePointerClick} color="#4f46e5" title="Steps live in the lane of whoever does them">
            Press <Kbd>1</Kbd>, click the board, type the name. Drag a dot on a step onto another step to connect them.
          </Step>
          <Step icon={Shuffle} color="#dc2626" title="Any edge that crosses lanes is a handoff">
            Click it and record how it happens today: manual, email, spreadsheet, API. The table at the bottom lists
            every handoff, most manual first. That is your automation backlog.
          </Step>
        </ol>

        <div className="mt-6 flex gap-2">
          <Button className="flex-1" onClick={onStartSample}>
            Explore the sample map
          </Button>
          <Button variant="outline" className="flex-1" onClick={onStartBlank}>
            Start my own
          </Button>
        </div>
      </div>
    </div>
  )
}

function Step({
  icon: Icon,
  color,
  title,
  children,
}: {
  icon: typeof Rows3
  color: string
  title: string
  children: React.ReactNode
}) {
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

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px] text-foreground">{children}</kbd>
}
