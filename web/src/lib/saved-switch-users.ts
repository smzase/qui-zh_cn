/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import type { User, UserRole } from "@/types"
import { getBaseUrl } from "./base-url"

/**
 * A browser-local account record used by the user switcher.
 *
 * The password is intentionally kept in localStorage because the switcher is
 * designed to work without prompting on every account change. This is the
 * same trust boundary as the authenticated browser session: anyone with
 * access to this browser profile can inspect these records.
 */
export interface SavedSwitchUser {
  id: number
  username: string
  password: string
  role: UserRole
}

const STORAGE_KEY_PREFIX = "qui-saved-switch-users:"

function storageKey(): string {
  try {
    // Include the configured base path so two qui installations sharing an
    // origin do not accidentally share account credentials.
    return `${STORAGE_KEY_PREFIX}${getBaseUrl()}`
  } catch {
    return `${STORAGE_KEY_PREFIX}/`
  }
}

function isSavedSwitchUser(value: unknown): value is SavedSwitchUser {
  if (!value || typeof value !== "object") {
    return false
  }

  const record = value as Partial<SavedSwitchUser>
  return (
    typeof record.id === "number" &&
    Number.isInteger(record.id) &&
    record.id > 0 &&
    typeof record.username === "string" &&
    record.username.trim().length > 0 &&
    typeof record.password === "string" &&
    record.password.length > 0 &&
    (record.role === "admin" || record.role === "user")
  )
}

export function readSavedSwitchUsers(): SavedSwitchUser[] {
  if (typeof window === "undefined") {
    return []
  }

  try {
    const raw = window.localStorage.getItem(storageKey())
    if (!raw) {
      return []
    }

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(isSavedSwitchUser)
  } catch {
    return []
  }
}

function writeSavedSwitchUsers(users: SavedSwitchUser[]): void {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(users))
  } catch {
    // A blocked or full localStorage should not prevent authentication.
  }
}

export function saveSwitchUser(user: User, password: string): SavedSwitchUser[] {
  if (!user.id || !password) {
    return readSavedSwitchUsers()
  }

  const record: SavedSwitchUser = {
    id: user.id,
    username: user.username,
    password,
    role: user.role === "admin" ? "admin" : "user",
  }
  const users = readSavedSwitchUsers().filter((saved) => saved.id !== record.id && saved.username !== record.username)
  users.push(record)
  writeSavedSwitchUsers(users)
  return users
}

export function removeSavedSwitchUser(id: number): SavedSwitchUser[] {
  const users = readSavedSwitchUsers().filter((saved) => saved.id !== id)
  writeSavedSwitchUsers(users)
  return users
}
