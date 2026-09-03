/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

export interface User {
  id?: number
  username: string
  createdAt?: string
  updatedAt?: string
  auth_method?: string
  role?: "admin" | "user"
}

export interface AuthResponse {
  user: User
  message?: string
}

export interface ManagedUser {
  id: number
  username: string
  role: "admin" | "user"
}
