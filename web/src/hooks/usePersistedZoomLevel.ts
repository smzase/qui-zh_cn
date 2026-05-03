import { useCallback, useEffect, useState } from "react"

const MIN_ZOOM = 50
const MAX_ZOOM = 200
const ZOOM_STEP = 5
const STORAGE_KEY = "qui-zoom-level"

export function usePersistedZoomLevel(defaultZoom: number = 100) {
  const [zoomLevel, setZoomLevelState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored !== null) {
        const parsed = parseInt(stored, 10)
        if (!isNaN(parsed) && parsed >= MIN_ZOOM && parsed <= MAX_ZOOM) {
          return parsed
        }
      }
    } catch (error) {
      console.error("Failed to load zoom level from localStorage:", error)
    }

    return defaultZoom
  })

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      localStorage.setItem(STORAGE_KEY, zoomLevel.toString())
    } catch (error) {
      console.error("Failed to save zoom level to localStorage:", error)
    }

    const evt = new CustomEvent(STORAGE_KEY, { detail: { zoom: zoomLevel } })
    window.dispatchEvent(evt)
  }, [zoomLevel])

  useEffect(() => {
    const handleEvent = (e: Event) => {
      const custom = e as CustomEvent<{ zoom: number }>
      if (typeof custom.detail?.zoom === "number") {
        setZoomLevelState(custom.detail.zoom)
      }
    }
    window.addEventListener(STORAGE_KEY, handleEvent as EventListener)
    return () => window.removeEventListener(STORAGE_KEY, handleEvent as EventListener)
  }, [])

  const setZoomLevel = useCallback((next: number | ((prev: number) => number)) => {
    setZoomLevelState((prev) => {
      const raw = typeof next === "function" ? (next as (p: number) => number)(prev) : next
      return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, raw))
    })
  }, [])

  const zoomIn = useCallback(() => {
    setZoomLevel((prev) => prev + ZOOM_STEP)
  }, [setZoomLevel])

  const zoomOut = useCallback(() => {
    setZoomLevel((prev) => prev - ZOOM_STEP)
  }, [setZoomLevel])

  const resetZoom = useCallback(() => {
    setZoomLevel(100)
  }, [setZoomLevel])

  return { zoomLevel, setZoomLevel, zoomIn, zoomOut, resetZoom, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM } as const
}
