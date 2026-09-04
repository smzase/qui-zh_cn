/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import type { User } from "@/types"
import { beforeEach, describe, expect, it } from "vitest"

import { readSavedSwitchUsers, saveSwitchUser } from "./saved-switch-users"

const admin: User = {
  id: 1,
  username: "admin",
  role: "admin",
}

const standardUser: User = {
  id: 2,
  username: "viewer",
  role: "user",
}

describe("saved switch users", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("keeps the administrator record when a standard user is saved", () => {
    saveSwitchUser(admin, "admin-password")
    saveSwitchUser(standardUser, "user-password")

    expect(readSavedSwitchUsers()).toEqual([
      {
        id: 1,
        username: "admin",
        password: "admin-password",
        role: "admin",
      },
      {
        id: 2,
        username: "viewer",
        password: "user-password",
        role: "user",
      },
    ])
  })
})
