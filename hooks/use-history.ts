"use client"

import { useCallback, useState } from "react"

const LIMIT = 50

/**
 * Undo/redo over any immutable value. `commit` records history by default;
 * pass `false` for high-frequency updates (drags) after calling `snapshot` once.
 */
export function useHistory<T>(value: T, setValue: (fn: (v: T) => T) => void) {
  const [past, setPast] = useState<T[]>([])
  const [future, setFuture] = useState<T[]>([])

  const snapshot = useCallback(() => {
    setPast((p) => [...p.slice(-(LIMIT - 1)), value])
    setFuture([])
  }, [value])

  const commit = useCallback(
    (fn: (v: T) => T, history = true) => {
      if (history) snapshot()
      setValue(fn)
    },
    [snapshot, setValue],
  )

  const undo = useCallback(() => {
    if (!past.length) return
    const prev = past[past.length - 1]
    setFuture((f) => [value, ...f.slice(0, LIMIT - 1)])
    setPast((p) => p.slice(0, -1))
    setValue(() => prev)
  }, [past, value, setValue])

  const redo = useCallback(() => {
    if (!future.length) return
    const next = future[0]
    setPast((p) => [...p, value])
    setFuture((f) => f.slice(1))
    setValue(() => next)
  }, [future, value, setValue])

  const reset = useCallback(() => {
    setPast([])
    setFuture([])
  }, [])

  return { commit, snapshot, undo, redo, reset, canUndo: past.length > 0, canRedo: future.length > 0 }
}
