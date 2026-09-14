"use client"

import { useEffect, useRef, useState } from "react"

interface InlineEditorProps {
  value: string
  className: string
  style?: React.CSSProperties
  onCommit: (next: string) => void
  onCancel: () => void
}

/**
 * The in-place rename input shared by nodes, lane headers, and edge labels.
 * Mount it only while editing; it seeds its draft from `value` once and
 * focuses itself after paint so the click that opened it doesn't steal focus.
 */
export function InlineEditor({ value, className, style, onCommit, onCancel }: InlineEditorProps) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft.trim())}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Enter") onCommit(draft.trim())
        if (e.key === "Escape") onCancel()
      }}
      className={className}
      style={style}
    />
  )
}
