/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { useCallback, useMemo, useSyncExternalStore } from "react"
import { encodeUnifiedInstanceIds, parseUnifiedInstanceIds } from "@/lib/instances"

const STORAGE_KEY = "qui-bulk-add-torrent-instances"
const CHANGE_EVENT = "qui-bulk-add-torrent-instances-changed"

function subscribe(callback: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback()
  }
  window.addEventListener("storage", handleStorage)
  window.addEventListener(CHANGE_EVENT, callback as EventListener)
  return () => {
    window.removeEventListener("storage", handleStorage)
    window.removeEventListener(CHANGE_EVENT, callback as EventListener)
  }
}

function getSnapshot(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ""
  } catch {
    return ""
  }
}

export function usePersistedBulkAddTorrentInstances(): [
  readonly number[],
  (ids: readonly number[]) => void,
] {
  const storedString = useSyncExternalStore(subscribe, getSnapshot)

  const persistedIds = useMemo(
    () => parseUnifiedInstanceIds(storedString),
    [storedString]
  )

  const saveSelection = useCallback((ids: readonly number[]) => {
    try {
      const encoded = encodeUnifiedInstanceIds(ids)
      if (encoded) {
        localStorage.setItem(STORAGE_KEY, encoded)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
      window.dispatchEvent(new Event(CHANGE_EVENT))
    } catch (error) {
      console.error("Failed to save bulk add torrent instance selection:", error)
    }
  }, [])

  return [persistedIds, saveSelection]
}
