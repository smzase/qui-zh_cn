/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { useCallback, useMemo, useSyncExternalStore } from "react"

const STORAGE_KEY = "qui-torrent-layout-sync-enabled"
const CHANGE_EVENT = "qui-torrent-layout-sync-changed"

export const SYNCED_TORRENT_LAYOUT_KEY = "synced"

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
    return localStorage.getItem(STORAGE_KEY) ?? "false"
  } catch {
    return "false"
  }
}

export function usePersistedTorrentLayoutSync(): [
  boolean,
  (enabled: boolean) => void,
] {
  const storedString = useSyncExternalStore(subscribe, getSnapshot)
  const enabled = useMemo(() => storedString === "true", [storedString])

  const setEnabled = useCallback((nextEnabled: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(nextEnabled))
      window.dispatchEvent(new Event(CHANGE_EVENT))
    } catch (error) {
      console.error("Failed to save torrent layout sync setting:", error)
    }
  }, [])

  return [enabled, setEnabled]
}
