/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { ShareInstancesDialog } from "@/components/instances/ShareInstancesDialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/hooks/useAuth"
import { api } from "@/lib/api"
import type { ManagedUser, UserPermission } from "@/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ShieldCheck, Share2, Trash2, UserPlus } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

const permissionKeys: { value: UserPermission; label: string }[] = [
  { value: "manage_global_settings", label: "users.permissions.manageGlobalSettings" },
  { value: "manage_external_programs", label: "users.permissions.manageExternalPrograms" },
  { value: "execute_external_programs", label: "users.permissions.executeExternalPrograms" },
  { value: "manage_notifications", label: "users.permissions.manageNotifications" },
  { value: "manage_arr", label: "users.permissions.manageArr" },
  { value: "manage_tracker_customizations", label: "users.permissions.manageTrackerCustomizations" },
  { value: "manage_logs", label: "users.permissions.manageLogs" },
  { value: "manage_updates", label: "users.permissions.manageUpdates" },
]

function PermissionChecklist({
  selected,
  onChange,
  disabled = false,
}: {
  selected: UserPermission[]
  onChange: (permissions: UserPermission[]) => void
  disabled?: boolean
}) {
  const { t } = useTranslation("settings")
  const selectedPermissions = new Set(selected)

  const toggle = (permission: UserPermission, checked: boolean) => {
    const next = new Set(selectedPermissions)
    if (checked) {
      next.add(permission)
    } else {
      next.delete(permission)
    }
    onChange([...next])
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {permissionKeys.map((permission) => {
        const id = `permission-${permission.value}`
        return (
          <Label key={permission.value} htmlFor={id} className="flex items-center gap-2 text-sm font-normal">
            <Checkbox
              id={id}
              checked={selectedPermissions.has(permission.value)}
              disabled={disabled}
              onCheckedChange={(checked) => toggle(permission.value, checked === true)}
            />
            {t(permission.label)}
          </Label>
        )
      })}
    </div>
  )
}

export function UsersManager() {
  const { t } = useTranslation("settings")
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const users = useQuery({ queryKey: ["managed-users"], queryFn: () => api.listUsers() })
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [sharingDialogOpen, setSharingDialogOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [newRole, setNewRole] = useState<ManagedUser["role"]>("user")
  const [newPermissions, setNewPermissions] = useState<UserPermission[]>([])
  const [permissionsUser, setPermissionsUser] = useState<ManagedUser | null>(null)
  const [editedPermissions, setEditedPermissions] = useState<UserPermission[]>([])
  const [userToDelete, setUserToDelete] = useState<ManagedUser | null>(null)
  const create = useMutation({
    mutationFn: () => api.createUser({
      username,
      password,
      role: newRole,
      permissions: newRole === "admin" ? [] : newPermissions,
    }),
    onSuccess: () => {
      setUsername("")
      setPassword("")
      setNewRole("user")
      setNewPermissions([])
      setCreateDialogOpen(false)
      void queryClient.invalidateQueries({ queryKey: ["managed-users"] })
      void queryClient.invalidateQueries({ queryKey: ["share-target-users"] })
      toast.success(t("users.created"))
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("users.createFailed")),
  })
  const role = useMutation({
    mutationFn: ({ id, value }: { id: number; value: ManagedUser["role"] }) => api.updateUserRole(id, value),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["managed-users"] })
      if (id === user?.id) {
        void queryClient.invalidateQueries({ queryKey: ["auth", "user"] })
      }
      toast.success(t("users.roleUpdated"))
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("users.roleUpdateFailed")),
  })
  const permissions = useMutation({
    mutationFn: ({ id, values }: { id: number; values: UserPermission[] }) => api.updateUserPermissions(id, values),
    onSuccess: () => {
      setPermissionsUser(null)
      void queryClient.invalidateQueries({ queryKey: ["managed-users"] })
      toast.success(t("users.permissions.updated"))
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("users.permissions.updateFailed")),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteUser(id),
    onSuccess: () => {
      setUserToDelete(null)
      void queryClient.invalidateQueries({ queryKey: ["managed-users"] })
      void queryClient.invalidateQueries({ queryKey: ["share-target-users"] })
      toast.success(t("users.deleted"))
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("users.deleteFailed")),
  })

  if (user?.role !== "admin") {
    return <p className="text-sm text-muted-foreground">{t("users.adminOnly")}</p>
  }

  const openPermissionsDialog = (account: ManagedUser) => {
    setPermissionsUser(account)
    setEditedPermissions(account.permissions)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => setSharingDialogOpen(true)}>
          <Share2 className="mr-2 h-4 w-4" />
          {t("users.shareInstances")}
        </Button>
        <Button type="button" onClick={() => setCreateDialogOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          {t("users.createUser")}
        </Button>
      </div>

      <div className="divide-y rounded-md border">
        {(users.data ?? []).map((account) => (
          <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <span className="font-medium">{account.username}</span>
            <div className="flex items-center gap-2">
              <Select
                value={account.role}
                onValueChange={(value) => role.mutate({ id: account.id, value: value as ManagedUser["role"] })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t("users.admin")}</SelectItem>
                  <SelectItem value="user">{t("users.user")}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={account.role === "admin"}
                onClick={() => openPermissionsDialog(account)}
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                {account.role === "admin" ? t("users.permissions.all") : t("users.permissions.button")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setUserToDelete(account)}
                disabled={account.id === user.id}
                aria-label={t("users.delete")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("users.createTitle")}</DialogTitle>
            <DialogDescription>{t("users.createDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              create.mutate()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="new-user-name">{t("users.username")}</Label>
              <Input id="new-user-name" value={username} onChange={(event) => setUsername(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-password">{t("users.password")}</Label>
              <Input id="new-user-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{t("users.role")}</Label>
              <Select value={newRole} onValueChange={(value) => setNewRole(value as ManagedUser["role"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t("users.admin")}</SelectItem>
                  <SelectItem value="user">{t("users.user")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("users.permissions.button")}</Label>
              <PermissionChecklist selected={newPermissions} onChange={setNewPermissions} disabled={newRole === "admin"} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                {t("users.deleteCancel")}
              </Button>
              <Button type="submit" disabled={create.isPending || !username || !password}>
                {t("users.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={permissionsUser !== null} onOpenChange={(open) => !open && setPermissionsUser(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("users.permissions.title")}</DialogTitle>
            <DialogDescription>{t("users.permissions.description", { username: permissionsUser?.username ?? "" })}</DialogDescription>
          </DialogHeader>
          <PermissionChecklist selected={editedPermissions} onChange={setEditedPermissions} disabled={permissions.isPending} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPermissionsUser(null)}>
              {t("users.deleteCancel")}
            </Button>
            <Button
              type="button"
              disabled={permissions.isPending || !permissionsUser}
              onClick={() => permissionsUser && permissions.mutate({ id: permissionsUser.id, values: editedPermissions })}
            >
              {t("users.permissions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShareInstancesDialog open={sharingDialogOpen} onOpenChange={setSharingDialogOpen} />

      <AlertDialog open={userToDelete !== null} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("users.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("users.deleteDescription", { username: userToDelete?.username ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>{t("users.deleteCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                if (userToDelete) {
                  remove.mutate(userToDelete.id)
                }
              }}
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("users.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
