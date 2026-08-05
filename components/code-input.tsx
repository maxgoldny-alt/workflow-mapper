"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { Code, X, ChevronDown, ChevronUp } from "lucide-react"

interface CodeInputProps {
  onCodeSubmit: (content: string) => void
}

export function CodeInput({ onCodeSubmit }: CodeInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [code, setCode] = useState("")

  const handleSubmit = useCallback(() => {
    if (code.trim()) {
      onCodeSubmit(code)
      setIsOpen(false)
    }
  }, [code, onCodeSubmit])

  const handleClear = useCallback(() => {
    setCode("")
    onCodeSubmit("")
  }, [onCodeSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && e.metaKey) {
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-md transition-all
          border-2
          ${
            isOpen
              ? "border-primary bg-primary/10 text-primary"
              : "border-border hover:border-primary/50 hover:bg-muted text-muted-foreground hover:text-foreground"
          }
        `}
      >
        <Code className="w-4 h-4" />
        <span className="text-sm font-medium">Paste Mermaid</span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 w-[500px] p-4 bg-card border border-border rounded-lg shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-foreground">Mermaid Code</span>
            <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-muted rounded transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`graph LR
  subgraph Intake
    Customer[Customer] -->|submits| Order[Place Order]
    Order --> Valid{Order Valid?}
  end`}
            className="w-full h-48 p-3 bg-muted/50 border border-border rounded-md text-sm font-mono text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          />

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">Cmd/Ctrl + Enter to apply</span>
            <div className="flex gap-2">
              <button
                onClick={handleClear}
                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              >
                Reset
              </button>
              <button
                onClick={handleSubmit}
                disabled={!code.trim()}
                className="px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
