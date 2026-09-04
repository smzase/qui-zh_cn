/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

export type UserRole = "admin" | "user"

export type UserPermission =
  | "manage_global_settings"
  | "manage_external_programs"
  | "execute_external_programs"
  | "manage_notifications"
  | "manage_arr"
  | "manage_tracker_customizations"
  | "manage_logs"
  | "manage_updates"

export interface User {
  id?: number
  username: string
  createdAt?: string
  updatedAt?: string
  auth_method?: string
  role?: UserRole
  permissions?: UserPermission[]
}

export interface AuthResponse {
  user: User
  message?: string
}

export interface ManagedUser {
  id: number
  username: string
  role: UserRole
  permissions: UserPermission[]
}

export interface CreateManagedUserInput {
  username: string
  password: string
  role: UserRole
  permissions: UserPermission[]
}

export interface SwitchUser {
  id: number
  username: string
  role: UserRole
  current: boolean
}

export interface ShareTargetUser {
  id: number
  username: string
  role: "admin" | "user"
}
