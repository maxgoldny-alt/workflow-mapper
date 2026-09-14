"use client"

import { useCallback, useState } from "react"
import type { Doc } from "@/lib/model"

const LIMIT = 50

/**
 * Undo/redo over a document. `commit` records history by default; pass
 * `false` for high-frequency updates (drags) after calling `snapshot` once.
 */
export function useHistory(doc: Doc, setDoc: (fn: (d: Doc) => Doc) => void) {
  const [past, setPast] = useState<Doc[]>([])
  const [future, setFuture] = useState<Doc[]>([])

  const snapshot = useCallback(() => {
    setPast((p) => [...p.slice(-(LIMIT - 1)), doc])
    setFuture([])
  }, [doc])

  const commit = useCallback(
    (fn: (d: Doc) => Doc, history = true) => {
      if (history) snapshot()
      setDoc(fn)
    },
    [snapshot, setDoc],
  )

  const undo = useCallback(() => {
    if (!past.length) return
    const prev = past[past.length - 1]
    setFuture((f) => [doc, ...f.slice(0, LIMIT - 1)])
    setPast((p) => p.slice(0, -1))
    setDoc(() => prev)
  }, [past, doc, setDoc])

  const redo = useCallback(() => {
    if (!future.length) return
    const next = future[0]
    setPast((p) => [...p, doc])
    setFuture((f) => f.slice(1))
    setDoc(() => next)
  }, [future, doc, setDoc])

  const reset = useCallback(() => {
    setPast([])
    setFuture([])
  }, [])

  return { commit, snapshot, undo, redo, reset, canUndo: past.length > 0, canRedo: future.length > 0 }
}
