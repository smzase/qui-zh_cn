/*
 * Copyright (c) 2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { useCallback } from "react"
import { useClientSetting } from "@/lib/client-settings"

export const SIDEBAR_NAVIGATION_KEY = "qui-sidebar-navigation"

export const SIDEBAR_NAVIGATION_IDS = [
  "dashboard",
  "search",
  "cross-seed",
  "automations",
  "backups",
  "rss",
  "settings",
  "logs",
] as const

export type SidebarNavigationId = typeof SIDEBAR_NAVIGATION_IDS[number]

export interface SidebarNavigationSettings {
  order: SidebarNavigationId[]
  hidden: SidebarNavigationId[]
}

export const DEFAULT_SIDEBAR_NAVIGATION: SidebarNavigationSettings = {
  order: [...SIDEBAR_NAVIGATION_IDS],
  hidden: [],
}

function isSidebarNavigationId(value: unknown): value is SidebarNavigationId {
  return typeof value === "string" && (SIDEBAR_NAVIGATION_IDS as readonly string[]).includes(value)
}

export function normalizeSidebarNavigation(value: Partial<SidebarNavigationSettings> | null | undefined): SidebarNavigationSettings {
  const order = Array.isArray(value?.order) ? value.order.filter(isSidebarNavigationId) : []
  const hidden = Array.isArray(value?.hidden) ? value.hidden.filter(isSidebarNavigationId) : []
  const normalizedOrder = [...new Set(order)]

  for (const id of SIDEBAR_NAVIGATION_IDS) {
    if (!normalizedOrder.includes(id)) normalizedOrder.push(id)
  }

  return {
    order: ["dashboard", ...normalizedOrder.filter(id => id !== "dashboard")],
    hidden: [...new Set(hidden.filter(id => id !== "dashboard"))],
  }
}

function parseSidebarNavigation(raw: string): SidebarNavigationSettings {
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== "object") throw new Error("invalid sidebar navigation")
  return normalizeSidebarNavigation(parsed as Partial<SidebarNavigationSettings>)
}

export function usePersistedSidebarNavigation(): [
  SidebarNavigationSettings,
  (next: SidebarNavigationSettings | ((previous: SidebarNavigationSettings) => SidebarNavigationSettings)) => void
] {
  const [settings, setSettings] = useClientSetting<SidebarNavigationSettings>(SIDEBAR_NAVIGATION_KEY, {
    defaultValue: DEFAULT_SIDEBAR_NAVIGATION,
    parse: parseSidebarNavigation,
  })

  const updateSettings = useCallback((next: SidebarNavigationSettings | ((previous: SidebarNavigationSettings) => SidebarNavigationSettings)) => {
    setSettings(previous => normalizeSidebarNavigation(typeof next === "function" ? next(previous) : next))
  }, [setSettings])

  return [settings, updateSettings]
}
