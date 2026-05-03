import { useCallback, useEffect, useState } from "react"

export function usePersistedColumnFilterVisibility(defaultVisible: boolean = true) {
  const storageKey = "qui-column-filter-visible"

  const [columnFilterVisible, setColumnFilterVisibleState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) {
        return stored === "true"
      }
    } catch (error) {
      console.error("Failed to load column filter visibility from localStorage:", error)
    }

    return defaultVisible
  })

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      localStorage.setItem(storageKey, columnFilterVisible.toString())
    } catch (error) {
      console.error("Failed to save column filter visibility to localStorage:", error)
    }

    const evt = new CustomEvent(storageKey, { detail: { visible: columnFilterVisible } })
    window.dispatchEvent(evt)
  }, [columnFilterVisible])

  useEffect(() => {
    const handleEvent = (e: Event) => {
      const custom = e as CustomEvent<{ visible: boolean }>
      if (typeof custom.detail?.visible === "boolean") {
        setColumnFilterVisibleState(custom.detail.visible)
      }
    }
    window.addEventListener(storageKey, handleEvent as EventListener)
    return () => window.removeEventListener(storageKey, handleEvent as EventListener)
  }, [])

  const setColumnFilterVisible = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setColumnFilterVisibleState((prev) => (
      typeof next === "function" ? (next as (p: boolean) => boolean)(prev) : next
    ))
  }, [])

  return [columnFilterVisible, setColumnFilterVisible] as const
}
