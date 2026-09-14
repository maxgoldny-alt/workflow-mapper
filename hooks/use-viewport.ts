"use client"

import { useCallback, useState, type RefObject } from "react"

export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 2.5

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Pan/zoom state plus the client↔canvas coordinate mapping. */
export function useViewport(viewportRef: RefObject<HTMLDivElement | null>) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const r = viewportRef.current?.getBoundingClientRect()
      if (!r) return { x: 0, y: 0 }
      return { x: (clientX - r.left - pan.x) / zoom, y: (clientY - r.top - pan.y) / zoom }
    },
    [viewportRef, pan, zoom],
  )

  const zoomAt = useCallback(
    (nextZoom: number, clientX: number, clientY: number) => {
      const r = viewportRef.current?.getBoundingClientRect()
      if (!r) return
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))
      const cx = clientX - r.left
      const cy = clientY - r.top
      // Keep the canvas point under the cursor pinned while zooming
      const canvasX = (cx - pan.x) / zoom
      const canvasY = (cy - pan.y) / zoom
      setPan({ x: cx - canvasX * z, y: cy - canvasY * z })
      setZoom(z)
    },
    [viewportRef, pan, zoom],
  )

  const fitTo = useCallback(
    (boxes: Box[]) => {
      const r = viewportRef.current?.getBoundingClientRect()
      if (!r) return
      if (!boxes.length) {
        setZoom(1)
        setPan({ x: 0, y: 0 })
        return
      }
      const minX = Math.min(...boxes.map((b) => b.x))
      const minY = Math.min(...boxes.map((b) => b.y))
      const maxX = Math.max(...boxes.map((b) => b.x + b.w))
      const maxY = Math.max(...boxes.map((b) => b.y + b.h))
      const pad = 40
      const z = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad * 2) / (maxY - minY))),
      )
      setZoom(z)
      setPan({
        x: (r.width - (maxX - minX) * z) / 2 - minX * z,
        y: (r.height - (maxY - minY) * z) / 2 - minY * z,
      })
    },
    [viewportRef],
  )

  return { zoom, pan, setZoom, setPan, toCanvas, zoomAt, fitTo }
}
