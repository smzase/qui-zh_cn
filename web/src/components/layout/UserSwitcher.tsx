/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/useAuth"
import { APIError, api } from "@/lib/api"
import { readSavedSwitchUsers, type SavedSwitchUser } from "@/lib/saved-switch-users"
import type { SwitchUser } from "@/types"
import { useQuery } from "@tanstack/react-query"
import { Check, Loader2, UserPlus, Users } from "lucide-react"
import { type FormEvent, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

export function UserSwitcher() {
  const { t } = useTranslation("common")
  const { user, switchSavedUserAsync, switchUserAsync, isSwitchingUser } = useAuth()
  const accountsQuery = useQuery({
    queryKey: ["switch-users"],
    queryFn: () => api.listSwitchUsers(),
    enabled: Boolean(user && user.auth_method !== "none"),
  })
  const [savedUsers, setSavedUsers] = useState<SavedSwitchUser[]>(() => readSavedSwitchUsers())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  const refreshSavedUsers = () => setSavedUsers(readSavedSwitchUsers())

  useEffect(() => {
    const handleStorageChange = () => setSavedUsers(readSavedSwitchUsers())
    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [])

  const openCredentialsDialog = (account?: SwitchUser) => {
    setUsername(account?.username ?? "")
    setPassword("")
    setDialogOpen(true)
  }

  const accounts = useMemo(() => {
    if (!user) {
      return []
    }

    const serverAccounts = accountsQuery.data ?? []
    const serverByID = new Map(serverAccounts.map((account) => [account.id, account]))
    const merged = new Map<number, SwitchUser>()

    for (const account of serverAccounts) {
      if (user.role === "admin" || account.current || account.id === user.id) {
        merged.set(account.id, {
          ...account,
          current: account.current || account.id === user.id,
        })
      }
    }

    if (user.id && !merged.has(user.id)) {
      merged.set(user.id, {
        id: user.id,
        username: user.username,
        role: user.role === "admin" ? "admin" : "user",
        current: true,
      })
    }

    for (const saved of savedUsers) {
      const serverAccount = serverByID.get(saved.id)
      merged.set(saved.id, {
        id: saved.id,
        username: serverAccount?.username ?? saved.username,
        role: serverAccount?.role ?? saved.role,
        current: saved.id === user.id,
      })
    }

    return Array.from(merged.values()).sort((left, right) => {
      if (left.current !== right.current) return left.current ? -1 : 1
      return left.username.localeCompare(right.username)
    })
  }, [accountsQuery.data, savedUsers, user])

  if (!user || user.auth_method === "none") {
    return null
  }

  const selectAccount = async (account: SwitchUser) => {
    if (account.current || isSwitchingUser) {
      return
    }
    const savedAccount = savedUsers.find((saved) => saved.id === account.id)
    if (!savedAccount) {
      openCredentialsDialog(account)
      return
    }
    try {
      await switchSavedUserAsync(savedAccount)
      refreshSavedUsers()
    } catch (error) {
      refreshSavedUsers()
      if (error instanceof APIError && error.status === 401) {
        openCredentialsDialog(account)
        return
      }
      toast.error(error instanceof Error ? error.message : t("userMenu.switchFailed"))
    }
  }

  const submitCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await switchUserAsync({ username, password })
      refreshSavedUsers()
      setDialogOpen(false)
      setPassword("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("userMenu.switchFailed"))
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={user.username}>
            <Users className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{user.username}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {accounts.map((account) => (
            <DropdownMenuItem
              key={account.id}
              disabled={account.current || isSwitchingUser}
              onSelect={() => void selectAccount(account)}
            >
              <Check className={`mr-2 h-4 w-4 ${account.current ? "opacity-100" : "opacity-0"}`} />
              <span className="truncate">{account.username}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openCredentialsDialog()}>
            <UserPlus className="mr-2 h-4 w-4" />
            {t("userMenu.addUser")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("userMenu.title")}</DialogTitle>
            <DialogDescription>{t("userMenu.description")}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void submitCredentials(event)}>
            <div className="space-y-2">
              <Label htmlFor="switch-user-username">{t("userMenu.username")}</Label>
              <Input
                id="switch-user-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="switch-user-password">{t("userMenu.password")}</Label>
              <Input
                id="switch-user-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("actions.cancel")}
              </Button>
              <Button type="submit" disabled={isSwitchingUser || !username || !password}>
                {isSwitchingUser && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("userMenu.switch")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
