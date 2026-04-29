/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { IndexersPage } from "@/components/indexers/IndexersPage"
import { InstanceCard } from "@/components/instances/InstanceCard"
import { InstanceForm } from "@/components/instances/InstanceForm"
import { PasswordIssuesBanner } from "@/components/instances/PasswordIssuesBanner"
import { InstancePreferencesDialog } from "@/components/instances/preferences/InstancePreferencesDialog"
import { ArrInstancesManager } from "@/components/settings/ArrInstancesManager"
import { ClientApiKeysManager } from "@/components/settings/ClientApiKeysManager"
import { DateTimePreferencesForm } from "@/components/settings/DateTimePreferencesForm"
import { ExternalProgramsManager } from "@/components/settings/ExternalProgramsManager"
import { LogSettingsPanel } from "@/components/settings/LogSettingsPanel"
import { NotificationsManager } from "@/components/settings/NotificationsManager"
import { LicenseManager } from "@/components/themes/LicenseManager.tsx"
import { ThemeSelector } from "@/components/themes/ThemeSelector"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useDateTimeFormatters } from "@/hooks/useDateTimeFormatters"
import { useInstances } from "@/hooks/useInstances"
import { usePersistedTitleBarSpeeds } from "@/hooks/usePersistedTitleBarSpeeds"
import { api } from "@/lib/api"

import { withBasePath } from "@/lib/base-url"
import { canRegisterProtocolHandler, getMagnetHandlerRegistrationGuidance, registerMagnetHandler } from "@/lib/protocol-handler"
import { copyTextToClipboard, formatBytes, formatDuration } from "@/lib/utils"
import type { SettingsSearch } from "@/routes/_authenticated/settings"
import type { Instance, TorznabSearchCacheStats, User } from "@/types"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell, Clock, Copy, Database, ExternalLink, FileText, Info, Key, Layers, Link2, Loader2, Palette, Plus, RefreshCw, Server, Share2, Shield, Terminal, Trash2 } from "lucide-react"
import type { FormEvent, ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

type SettingsTab = NonNullable<SettingsSearch["tab"]>

const TORZNAB_CACHE_MIN_TTL_MINUTES = 1440

function ChangePasswordForm() {
  const { t } = useTranslation()
  const mutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      return api.changePassword(data.currentPassword, data.newPassword)
    },
    onSuccess: () => {
      toast.success(t("settings.passwordChanged"))
      form.reset()
    },
    onError: () => {
      toast.error(t("settings.passwordChangeFailed"))
    },
  })

  const form = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
      })
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="space-y-4"
    >
      <form.Field
        name="currentPassword"
        validators={{
          onChange: ({ value }) => !value ? t("settings.passwordRequired") : undefined,
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="currentPassword">{t("settings.currentPassword")}</Label>
            <Input
              id="currentPassword"
              type="password"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {field.state.meta.isTouched && field.state.meta.errors[0] && (
              <p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
            )}
          </div>
        )}
      </form.Field>

      <form.Field
        name="newPassword"
        validators={{
          onChange: ({ value }) => {
            if (!value) return t("settings.newPasswordRequired")
            if (value.length < 8) return t("settings.passwordMinLength")
            return undefined
          },
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="newPassword">{t("settings.newPassword")}</Label>
            <Input
              id="newPassword"
              type="password"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {field.state.meta.isTouched && field.state.meta.errors[0] && (
              <p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
            )}
          </div>
        )}
      </form.Field>

      <form.Field
        name="confirmPassword"
        validators={{
          onChange: ({ value, fieldApi }) => {
            const newPassword = fieldApi.form.getFieldValue("newPassword")
            if (!value) return t("settings.confirmPasswordRequired")
            if (value !== newPassword) return t("settings.passwordsDoNotMatch")
            return undefined
          },
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("settings.confirmPassword")}</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {field.state.meta.isTouched && field.state.meta.errors[0] && (
              <p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
            )}
          </div>
        )}
      </form.Field>

      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting]}
      >
        {([canSubmit, isSubmitting]) => (
          <Button
            type="submit"
            disabled={!canSubmit || isSubmitting || mutation.isPending}
          >
            {isSubmitting || mutation.isPending ? t("settings.changing") : t("settings.changePassword")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}

function ApiKeysManager() {
  const { t } = useTranslation()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deleteKeyId, setDeleteKeyId] = useState<number | null>(null)
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null)
  const queryClient = useQueryClient()
  const { formatDate } = useDateTimeFormatters()

  // Fetch API keys from backend
  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ["apiKeys"],
    queryFn: () => api.getApiKeys(),
    staleTime: 30 * 1000, // 30 seconds
  })

  // Ensure apiKeys is always an array
  const keys = apiKeys || []

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      return api.createApiKey(name)
    },
    onSuccess: (data) => {
      setNewKey(data)
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] })
      toast.success(t("settings.apiKeyCreated"))
    },
    onError: () => {
      toast.error(t("settings.failedCreateApiKey"))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return api.deleteApiKey(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] })
      setDeleteKeyId(null)
      toast.success(t("settings.apiKeyDeleted"))
    },
    onError: () => {
      toast.error(t("settings.failedDeleteApiKey"))
    },
  })

  const form = useForm({
    defaultValues: {
      name: "",
    },
    onSubmit: async ({ value }) => {
      await createMutation.mutateAsync(value.name)
      form.reset()
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t("settings.apiKeysDescription")}
        </p>
        <Dialog
          open={showCreateDialog}
          onOpenChange={(open) => {
            setShowCreateDialog(open)
            if (!open) {
              setNewKey(null)
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              {t("settings.createApiKey")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90dvh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>{t("settings.createApiKey")}</DialogTitle>
              <DialogDescription>
                {t("settings.apiKeyNamePlaceholder")}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto min-h-0">
              {newKey ? (
                <div className="space-y-4">
                  <div>
                    <Label>{t("settings.yourNewApiKey")}</Label>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 rounded bg-muted px-2 py-1 text-sm font-mono break-all">
                        {newKey.key}
                      </code>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await copyTextToClipboard(newKey.key)
                            toast.success(t("dashboard.copiedClipboard"))
                          } catch {
                            toast.error(t("dashboard.failedCopyClipboard"))
                          }
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="mt-2 text-sm text-destructive">
                      {t("settings.saveKeyNow")}
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setNewKey(null)
                      setShowCreateDialog(false)
                    }}
                    className="w-full"
                  >
                    {t("common.done")}
                  </Button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    form.handleSubmit()
                  }}
                  className="space-y-4"
                >
                  <form.Field
                    name="name"
                    validators={{
                      onChange: ({ value }) => !value ? t("settings.apiKeyNameRequired") : undefined,
                    }}
                  >
                    {(field) => (
                      <div className="space-y-2">
                        <Label htmlFor="name">{t("settings.apiKeyName")}</Label>
                        <Input
                          id="name"
                          placeholder={t("settings.apiKeyNamePlaceholder")}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          data-1p-ignore
                          autoComplete="off"
                        />
                        {field.state.meta.isTouched && field.state.meta.errors[0] && (
                          <p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
                        )}
                      </div>
                    )}
                  </form.Field>

                  <form.Subscribe
                    selector={(state) => [state.canSubmit, state.isSubmitting]}
                  >
                    {([canSubmit, isSubmitting]) => (
                      <Button
                        type="submit"
                        disabled={!canSubmit || isSubmitting || createMutation.isPending}
                        className="w-full"
                      >
                        {isSubmitting || createMutation.isPending ? t("settings.creating") : t("settings.createApiKey")}
                      </Button>
                    )}
                  </form.Subscribe>
                </form>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {t("settings.loadingApiKeys")}
          </p>
        ) : (
          <>
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center bg-muted/40 justify-between rounded-lg border p-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{key.name}</span>
                    <Badge variant="outline" className="text-xs">
                      ID: {key.id}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.created")}: {formatDate(new Date(key.createdAt))}
                    {key.lastUsedAt && (
                      <> • {t("settings.lastUsed")}: {formatDate(new Date(key.lastUsedAt))}</>
                    )}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setDeleteKeyId(key.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {keys.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                {t("settings.noApiKeys")}
              </p>
            )}
          </>
        )}
      </div>

      <AlertDialog open={!!deleteKeyId} onOpenChange={() => setDeleteKeyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.deleteApiKey")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.deleteApiKeyDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteKeyId && deleteMutation.mutate(deleteKeyId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface InstancesManagerProps {
  search: SettingsSearch
  onSearchChange: (search: SettingsSearch) => void
}

const INSTANCE_FORM_ID = "instance-form"

function InstancesManager({ search, onSearchChange }: InstancesManagerProps) {
  const { t } = useTranslation()
  const { instances, isLoading, reorderInstances, isReordering, isCreating } = useInstances()
  const [titleBarSpeedsEnabled, setTitleBarSpeedsEnabled] = usePersistedTitleBarSpeeds(false)
  const isDialogOpen = search.tab === "instances" && search.modal === "add-instance"
  const [editingInstanceId, setEditingInstanceId] = useState<number | null>(null)
  const editingInstance = instances?.find(instance => instance.id === editingInstanceId)

  // Close edit dialog if instance was deleted
  useEffect(() => {
    if (editingInstanceId !== null && !editingInstance && !isLoading) {
      setEditingInstanceId(null)
    }
  }, [editingInstanceId, editingInstance, isLoading])

  const handleOpenAddDialog = () => {
    onSearchChange({ ...search, tab: "instances", modal: "add-instance" })
  }

  const handleCloseDialog = () => {
    onSearchChange({ tab: "instances" })
  }

  const handleEditInstance = (instance: Instance) => {
    setEditingInstanceId(instance.id)
  }

  const handleReorder = (instanceId: number, direction: -1 | 1) => {
    if (!instances || isReordering) return

    const currentIndex = instances.findIndex(instance => instance.id === instanceId)
    if (currentIndex === -1) return

    const targetIndex = currentIndex + direction
    if (targetIndex < 0 || targetIndex >= instances.length) return

    const orderedIds = instances.map(instance => instance.id)
    const [moved] = orderedIds.splice(currentIndex, 1)
    orderedIds.splice(targetIndex, 0, moved)

    reorderInstances(orderedIds, {
      onError: (error) => {
        toast.error(t("settings.failedUpdateOrder"), {
          description: error instanceof Error ? error.message : undefined,
        })
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-end">
        <Button onClick={handleOpenAddDialog} size="sm" className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          {t("dashboard.addInstance")}
        </Button>
      </div>

      <PasswordIssuesBanner instances={instances || []} />

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {t("settings.loadingInstances")}
          </p>
        ) : (
          <>
            {instances && instances.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {instances.map((instance, index) => (
                  <InstanceCard
                    key={instance.id}
                    instance={instance}
                    onEdit={() => handleEditInstance(instance)}
                    onMoveUp={index > 0 ? () => handleReorder(instance.id, -1) : undefined}
                    onMoveDown={index < instances.length - 1 ? () => handleReorder(instance.id, 1) : undefined}
                    disableMoveUp={isReordering}
                    disableMoveDown={isReordering}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-12 text-center">
                <p className="text-muted-foreground">{t("dashboard.noInstancesConfigured")}</p>
                <Button
                  onClick={handleOpenAddDialog}
                  className="mt-4"
                  variant="outline"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t("dashboard.addFirstInstance")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label className="text-sm font-medium">{t("settings.titleBarSpeeds")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("settings.titleBarSpeedsDesc")}
            </p>
          </div>
          <Switch
            checked={titleBarSpeedsEnabled}
            onCheckedChange={(checked) => setTitleBarSpeedsEnabled(Boolean(checked))}
          />
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => open ? handleOpenAddDialog() : handleCloseDialog()}>
        <DialogContent className="sm:max-w-[425px] max-h-[90dvh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{t("dashboard.addInstance")}</DialogTitle>
            <DialogDescription>
              {t("settings.addInstanceDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0">
            <InstanceForm
              onSuccess={handleCloseDialog}
              onCancel={handleCloseDialog}
              formId={INSTANCE_FORM_ID}
            />
          </div>
          <DialogFooter className="flex-shrink-0">
            <Button type="button" variant="outline" onClick={handleCloseDialog}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" form={INSTANCE_FORM_ID} disabled={isCreating}>
              {isCreating ? t("common.loading") : t("dashboard.addInstance")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Instance Preferences Dialog */}
      {editingInstanceId && editingInstance && (
        <InstancePreferencesDialog
          open={true}
          onOpenChange={(open) => !open && setEditingInstanceId(null)}
          instanceId={editingInstance.id}
          instanceName={editingInstance.name}
          instance={editingInstance}
        />
      )}
    </div>
  )
}

function TorznabSearchCachePanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const statsQuery = useQuery({
    queryKey: ["torznab", "search-cache", "stats"],
    queryFn: () => api.getTorznabSearchCacheStats(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const { formatDate } = useDateTimeFormatters()

  const stats: TorznabSearchCacheStats | undefined = statsQuery.data
  const [ttlInput, setTtlInput] = useState("")

  const formatCacheTimestamp = useCallback((value?: string | null) => {
    if (!value) {
      return "—"
    }
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return "—"
    }
    return formatDate(parsed)
  }, [formatDate])

  useEffect(() => {
    if (stats?.ttlMinutes !== undefined) {
      setTtlInput(String(stats.ttlMinutes))
    }
  }, [stats?.ttlMinutes])

  const updateTTLMutation = useMutation({
    mutationFn: async (nextTTL: number) => {
      return api.updateTorznabSearchCacheSettings(nextTTL)
    },
    onSuccess: (updatedStats) => {
      toast.success(t("settings.cacheTtlUpdated", { minutes: updatedStats.ttlMinutes }))
      setTtlInput(String(updatedStats.ttlMinutes))
      queryClient.setQueryData(["torznab", "search-cache", "stats"], updatedStats)
      queryClient.invalidateQueries({
        queryKey: ["torznab", "search-cache"],
        exact: false,
      })
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t("settings.failedUpdateCacheTtl")
      toast.error(message)
    },
  })

  const handleUpdateTTL = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = Number(ttlInput)
    if (!Number.isFinite(parsed)) {
      toast.error(t("settings.enterValidNumber"))
      return
    }
    const normalized = Math.floor(parsed)
    if (normalized < TORZNAB_CACHE_MIN_TTL_MINUTES) {
      toast.error(t("settings.cacheTtlMinError", { min: TORZNAB_CACHE_MIN_TTL_MINUTES }))
      return
    }
    updateTTLMutation.mutate(normalized)
  }

  const ttlMinutes = stats?.ttlMinutes ?? 0
  const approxSize = stats?.approxSizeBytes ?? 0

  const cacheStatusText = stats?.enabled ? t("common.enabled") : t("common.disabled")

  const rows = useMemo(
    () => [
      { label: t("settings.entries"), value: stats?.entries?.toLocaleString() ?? "0" },
      { label: t("settings.hitCount"), value: stats?.totalHits?.toLocaleString() ?? "0" },
      { label: t("settings.approxSize"), value: approxSize > 0 ? formatBytes(approxSize) : "—" },
      { label: t("settings.ttl"), value: ttlMinutes > 0 ? `${ttlMinutes} ${t("common.minutes")}` : "—" },
      { label: t("settings.newestEntry"), value: formatCacheTimestamp(stats?.newestCachedAt) },
      { label: t("settings.lastUsed"), value: formatCacheTimestamp(stats?.lastUsedAt) },
    ],
    [approxSize, formatCacheTimestamp, stats?.entries, stats?.lastUsedAt, stats?.newestCachedAt, stats?.totalHits, ttlMinutes, t]
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t("settings.torznabTitle")}</CardTitle>
            <CardDescription>{t("settings.torznabDescription")}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={stats?.enabled ? "default" : "secondary"}>{cacheStatusText}</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => statsQuery.refetch()}
              disabled={statsQuery.isFetching}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${statsQuery.isFetching ? "animate-spin" : ""}`} />
              {t("settings.refreshStats")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {rows.map(row => (
            <div key={row.label} className="space-y-1 rounded-lg border p-3 bg-muted/40">
              <p className="text-xs uppercase text-muted-foreground">{row.label}</p>
              <p className="text-lg font-semibold">{row.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("common.configuration")}</CardTitle>
          <CardDescription>{t("settings.cacheConfigDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateTTL} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="torznab-cache-ttl">{t("settings.cacheTtl")}</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="torznab-cache-ttl"
                  type="number"
                  min={TORZNAB_CACHE_MIN_TTL_MINUTES}
                  value={ttlInput}
                  onChange={(event) => setTtlInput(event.target.value)}
                  disabled={updateTTLMutation.isPending}
                />
                <Button type="submit" disabled={updateTTLMutation.isPending}>
                  {updateTTLMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("settings.saving")}
                    </>
                  ) : (
                    t("settings.saveTtl")
                  )}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.cacheTtlHint")}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function formatApplicationDate(value?: string): string {
  if (!value || value.trim() === "") {
    return "—"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  })
}

function formatRelativeDate(value?: string): string {
  if (!value || value.trim() === "") {
    return "—"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "—"
  }

  const secondsDiff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (Math.abs(secondsDiff) < 1) {
    return "just now"
  }

  const duration = formatDuration(Math.abs(secondsDiff))
  if (secondsDiff >= 0) {
    return `${duration} ago`
  }

  return `in ${duration}`
}

function formatCurrentSessionAuth(user?: User, t?: (key: string) => string): string {
  if (!user) {
    return t ? t("common.unknown") : "Unknown"
  }

  const methodRaw = user.auth_method?.trim() || ""
  const method = methodRaw !== "" ? methodRaw : "builtin"
  const username = user.username?.trim() || ""

  if (username !== "") {
    return `${method} (${username})`
  }

  return method
}

function isDevVersion(version?: string): boolean {
  const value = version?.trim().toLowerCase() || ""
  return value === "0.0.0-dev" || value.includes("dev") || value === "main"
}

function getLiveUptimeSeconds(baseUptime: number, startedAtMs: number): number {
  const elapsed = Math.floor((Date.now() - startedAtMs) / 1000)
  return Math.max(0, baseUptime + elapsed)
}

type ApplicationField = {
  label: string
  value: string
  secondary?: string
  copyValue?: string
  monospace?: boolean
}

interface ApplicationSectionProps {
  title: string
  description: string
  fields: ApplicationField[]
  onCopy: (value: string, label: string) => Promise<void> | void
  headerAction?: ReactNode
}

function ApplicationSection({ title, description, fields, onCopy, headerAction }: ApplicationSectionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {headerAction}
      </CardHeader>
      <CardContent className="p-0">
        <dl className="divide-y">
          {fields.map((field) => (
            <div key={field.label} className="group px-4 py-3 sm:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <dt className="text-xs uppercase text-muted-foreground sm:w-44 sm:shrink-0">{field.label}</dt>
                <dd className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className={`${field.monospace ? "font-mono text-xs sm:text-sm" : "text-sm font-medium"} break-all`}
                        title={field.value}
                      >
                        {field.value}
                      </p>
                      {field.secondary && (
                        <p className="mt-1 text-xs text-muted-foreground">{field.secondary}</p>
                      )}
                    </div>
                    {field.copyValue && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => {
                          void onCopy(field.copyValue || "", field.label)
                        }}
                        title={`Copy ${field.label}`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

function ApplicationInfoPanel() {
  const { t } = useTranslation()
  const appInfoQuery = useQuery({
    queryKey: ["application-info"],
    queryFn: () => api.getApplicationInfo(),
    staleTime: 30 * 1000,
  })

  const currentUserQuery = useQuery({
    queryKey: ["auth-me", "application-tab"],
    queryFn: () => api.checkAuth(),
    staleTime: 60 * 1000,
  })

  const latestVersionQuery = useQuery({
    queryKey: ["latest-version"],
    queryFn: () => api.getLatestVersion(),
    staleTime: 5 * 60 * 1000,
  })

  const info = appInfoQuery.data
  const user = currentUserQuery.data

  const [liveUptimeSeconds, setLiveUptimeSeconds] = useState(0)

  useEffect(() => {
    if (!info) {
      setLiveUptimeSeconds(0)
      return
    }

    const baseUptime = Math.max(0, info.uptimeSeconds)
    const startedAtMs = Date.now()
    setLiveUptimeSeconds(baseUptime)

    const timer = window.setInterval(() => {
      setLiveUptimeSeconds(getLiveUptimeSeconds(baseUptime, startedAtMs))
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [info])

  let currentSessionAuth = t("common.unknown")
  if (currentUserQuery.isLoading) {
    currentSessionAuth = t("common.loading")
  } else if (currentUserQuery.isError) {
    currentSessionAuth = t("common.unavailable")
  } else {
    currentSessionAuth = formatCurrentSessionAuth(user, t)
  }

  const updateStatus = useMemo(() => {
    if (!info) {
      return { label: t("common.unknown"), detail: t("settings.waitingMetadata") }
    }
    if (!info.checkForUpdates) {
      return { label: t("common.disabled"), detail: t("settings.updateChecksDisabled") }
    }
    if (isDevVersion(info.version)) {
      return { label: t("settings.devBuild"), detail: "" }
    }
    if (latestVersionQuery.isLoading || latestVersionQuery.isFetching) {
      return { label: t("settings.checking"), detail: t("settings.checkingGithubCache") }
    }
    if (latestVersionQuery.data) {
      return { label: t("settings.updateAvailable"), detail: latestVersionQuery.data.tag_name }
    }
    return { label: t("settings.upToDate"), detail: t("settings.noNewerRelease") }
  }, [info, latestVersionQuery.data, latestVersionQuery.isFetching, latestVersionQuery.isLoading, t])

  const updateCheckedAt = latestVersionQuery.dataUpdatedAt > 0 ? formatApplicationDate(new Date(latestVersionQuery.dataUpdatedAt).toISOString()) : t("settings.notCheckedYet")

  const buildFields: ApplicationField[] = info ? [
    { label: t("settings.version"), value: info.version || "—", monospace: true },
    { label: t("settings.commit"), value: info.commitShort || info.commit || "—", copyValue: info.commit || "", monospace: true },
    {
      label: t("settings.buildDate"),
      value: formatApplicationDate(info.buildDate),
      secondary: formatRelativeDate(info.buildDate),
    },
    {
      label: t("settings.updateStatus"),
      value: updateStatus.label,
      secondary: [updateStatus.detail, `${t("settings.lastChecked")}: ${updateCheckedAt}`].filter(Boolean).join(" • "),
    },
  ] : []

  const runtimeFields: ApplicationField[] = info ? [
    { label: t("settings.uptime"), value: formatDuration(liveUptimeSeconds) },
    { label: t("settings.runtime"), value: `${info.goVersion} • ${info.goOS}/${info.goArch}`, monospace: true },
  ] : []

  const authFields: ApplicationField[] = info ? [
    { label: t("settings.currentSessionAuth"), value: currentSessionAuth, monospace: true },
    { label: t("settings.oidcEnabled"), value: info.oidcEnabled ? t("common.yes") : t("common.no") },
    { label: t("settings.builtInLoginEnabled"), value: info.builtInLoginEnabled ? t("common.yes") : t("common.no") },
    { label: t("settings.oidcIssuerHost"), value: info.oidcIssuerHost || "—", monospace: true },
  ] : []

  const storageFields: ApplicationField[] = info ? [
    {
      label: t("settings.database"),
      value: `${info.database.engine}${info.database.target ? ` (${info.database.target})` : ""}`,
      monospace: true,
    },
    { label: t("settings.bind"), value: `${info.host}:${info.port}${info.baseUrl}`, monospace: true },
    { label: t("settings.configDir"), value: info.configDir || "—", copyValue: info.configDir || "", monospace: true },
    { label: t("settings.dataDir"), value: info.dataDir || "—", copyValue: info.dataDir || "", monospace: true },
  ] : []

  const handleCopy = useCallback(async (value: string, label: string) => {
    if (!value) {
      return
    }

    try {
      await copyTextToClipboard(value)
      toast.success(`${label} ${t("common.copied")}`)
    } catch {
      toast.error(`${t("common.failedCopy")} ${label.toLowerCase()}`)
    }
  }, [t])

  return (
    <div className="space-y-4">
      {appInfoQuery.isLoading && (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("settings.loadingAppInfo")}
            </div>
          </CardContent>
        </Card>
      )}

      {appInfoQuery.isError && (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-destructive">
              {appInfoQuery.error instanceof Error ? appInfoQuery.error.message : t("settings.failedLoadAppInfo")}
            </p>
          </CardContent>
        </Card>
      )}

      {info && (
        <>
          <ApplicationSection
            title={t("settings.build")}
            description={t("settings.buildDesc")}
            fields={buildFields}
            onCopy={handleCopy}
            headerAction={(
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void appInfoQuery.refetch()
                  void latestVersionQuery.refetch()
                  void currentUserQuery.refetch()
                }}
                disabled={appInfoQuery.isFetching || latestVersionQuery.isFetching || currentUserQuery.isFetching}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${(appInfoQuery.isFetching || latestVersionQuery.isFetching || currentUserQuery.isFetching) ? "animate-spin" : ""}`} />
                {t("common.refresh")}
              </Button>
            )}
          />
          <ApplicationSection
            title={t("settings.runtime")}
            description={t("settings.runtimeDesc")}
            fields={runtimeFields}
            onCopy={handleCopy}
          />
          <ApplicationSection
            title={t("settings.authentication")}
            description={t("settings.authenticationDesc")}
            fields={authFields}
            onCopy={handleCopy}
          />
          <ApplicationSection
            title={t("settings.storageNetwork")}
            description={t("settings.storageNetworkDesc")}
            fields={storageFields}
            onCopy={handleCopy}
          />
        </>
      )}

    </div>
  )
}

interface SettingsProps {
  search: SettingsSearch
  onSearchChange: (search: SettingsSearch) => void
}

interface SettingsScrollPanelProps {
  children: ReactNode
  contentClassName?: string
}

function SettingsScrollPanel({ children, contentClassName }: SettingsScrollPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)

  useEffect(() => {
    const scrollElement = scrollRef.current
    const contentElement = contentRef.current

    if (!scrollElement) {
      return
    }

    const updateFades = () => {
      setShowTopFade(scrollElement.scrollTop > 4)
      setShowBottomFade(scrollElement.scrollTop + scrollElement.clientHeight < scrollElement.scrollHeight - 4)
    }

    updateFades()

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      updateFades()
    })

    scrollElement.addEventListener("scroll", updateFades, { passive: true })
    window.addEventListener("resize", updateFades)
    resizeObserver?.observe(scrollElement)
    if (contentElement) {
      resizeObserver?.observe(contentElement)
    }

    return () => {
      scrollElement.removeEventListener("scroll", updateFades)
      window.removeEventListener("resize", updateFades)
      resizeObserver?.disconnect()
    }
  }, [children])

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-linear-to-b from-background via-background/50 to-transparent transition-opacity duration-150 ${showTopFade ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-linear-to-t from-background via-background/50 to-transparent transition-opacity duration-150 ${showBottomFade ? "opacity-100" : "opacity-0"}`}
      />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto md:pr-4">
        <div ref={contentRef} className={contentClassName}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function Settings({ search, onSearchChange }: SettingsProps) {
  const { t } = useTranslation()
  const activeTab: SettingsTab = search.tab ?? "application"
  const scrollPanelContentClassName = "space-y-4"

  const handleTabChange = (tab: SettingsTab) => {
    onSearchChange({ tab })
  }

  return (
    <div className="container mx-auto flex h-full min-h-0 flex-col overflow-hidden p-4 md:p-6">
      <div className="mb-4 shrink-0 md:mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">{t("nav.settings")}</h1>
        <p className="text-muted-foreground mt-1 md:mt-2 text-sm md:text-base">
          {t("settings.description")}
        </p>
      </div>

      {/* Mobile Dropdown Navigation */}
      <div className="mb-4 shrink-0 md:hidden">
        <Select
          value={activeTab}
          onValueChange={(value) => handleTabChange(value as SettingsTab)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="application">
              <div className="flex items-center">
                <Info className="w-4 h-4 mr-2" />
                {t("settings.application")}
              </div>
            </SelectItem>
            <SelectItem value="instances">
              <div className="flex items-center">
                <Server className="w-4 h-4 mr-2" />
                {t("nav.instances")}
              </div>
            </SelectItem>
            <SelectItem value="indexers">
              <div className="flex items-center">
                <Database className="w-4 h-4 mr-2" />
                {t("settings.indexers")}
              </div>
            </SelectItem>
            <SelectItem value="search-cache">
              <div className="flex items-center">
                <Layers className="w-4 h-4 mr-2" />
                {t("settings.searchCache")}
              </div>
            </SelectItem>
            <SelectItem value="integrations">
              <div className="flex items-center">
                <Link2 className="w-4 h-4 mr-2" />
                {t("settings.integrations")}
              </div>
            </SelectItem>
            <SelectItem value="client-api">
              <div className="flex items-center">
                <Share2 className="w-4 h-4 mr-2" />
                {t("settings.clientProxy")}
              </div>
            </SelectItem>
            <SelectItem value="api">
              <div className="flex items-center">
                <Key className="w-4 h-4 mr-2" />
                {t("settings.apiKeys")}
              </div>
            </SelectItem>
            <SelectItem value="external-programs">
              <div className="flex items-center">
                <Terminal className="w-4 h-4 mr-2" />
                {t("settings.externalPrograms")}
              </div>
            </SelectItem>
            <SelectItem value="notifications">
              <div className="flex items-center">
                <Bell className="w-4 h-4 mr-2" />
                {t("settings.notifications")}
              </div>
            </SelectItem>
            <SelectItem value="datetime">
              <div className="flex items-center">
                <Clock className="w-4 h-4 mr-2" />
                {t("settings.dateTime")}
              </div>
            </SelectItem>
            <SelectItem value="themes">
              <div className="flex items-center">
                <Palette className="w-4 h-4 mr-2" />
                {t("settings.premiumThemes")}
              </div>
            </SelectItem>
            <SelectItem value="security">
              <div className="flex items-center">
                <Shield className="w-4 h-4 mr-2" />
                {t("settings.security")}
              </div>
            </SelectItem>
            <SelectItem value="logs">
              <div className="flex items-center">
                <FileText className="w-4 h-4 mr-2" />
                {t("nav.logs")}
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 md:flex-row">
        {/* Desktop Sidebar Navigation */}
        <div className="hidden w-64 shrink-0 overflow-y-auto md:block">
          <nav className="space-y-1">
            <button
              onClick={() => handleTabChange("application")}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "application" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              }`}
            >
              <Info className="w-4 h-4 mr-2" />
              {t("settings.application")}
            </button>
            <button
              onClick={() => handleTabChange("instances")}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "instances" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              }`}
            >
              <Server className="w-4 h-4 mr-2" />
              {t("nav.instances")}
            </button>
            <button
              onClick={() => handleTabChange("indexers")}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "indexers" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              }`}
            >
              <Database className="w-4 h-4 mr-2" />
              {t("settings.indexers")}
            </button>
            <button
              onClick={() => handleTabChange("search-cache")}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "search-cache" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              }`}
            >
              <Layers className="w-4 h-4 mr-2" />
              {t("settings.searchCache")}
            </button>
            <button
              onClick={() => handleTabChange("integrations")}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "integrations" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              }`}
            >
              <Link2 className="w-4 h-4 mr-2" />
              {t("settings.integrations")}
            </button>
            <button
              onClick={() => handleTabChange("client-api")}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "client-api" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              }`}
            >
              <Share2 className="w-4 h-4 mr-2" />
              {t("settings.clientProxy")}
            </button>
            <button
              onClick={() => handleTabChange("api")}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "api" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              }`}
            >
              <Key className="w-4 h-4 mr-2" />
              {t("settings.apiKeys")}
            </button>
            <button
              onClick={() => handleTabChange("external-programs")}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "external-programs" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              }`}
            >
              <Terminal className="w-4 h-4 mr-2" />
              {t("settings.externalPrograms")}
            </button>
            <button
              onClick={() => handleTabChange("notifications")}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "notifications" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              }`}
            >
              <Bell className="w-4 h-4 mr-2" />
              {t("settings.notifications")}
            </button>
            <button
              onClick={() => handleTabChange("datetime")}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "datetime" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              }`}
            >
              <Clock className="w-4 h-4 mr-2" />
              {t("settings.dateTime")}
            </button>
            <button
              onClick={() => handleTabChange("themes")}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "themes" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              }`}
            >
              <Palette className="w-4 h-4 mr-2" />
              {t("settings.premiumThemes")}
            </button>
            <button
              onClick={() => handleTabChange("security")}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "security" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              }`}
            >
              <Shield className="w-4 h-4 mr-2" />
              {t("settings.security")}
            </button>
            <button
              onClick={() => handleTabChange("logs")}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "logs" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              }`}
            >
              <FileText className="w-4 h-4 mr-2" />
              {t("nav.logs")}
            </button>
          </nav>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
          {activeTab === "application" && (
            <SettingsScrollPanel contentClassName={scrollPanelContentClassName}>
              <ApplicationInfoPanel />
            </SettingsScrollPanel>
          )}

          {activeTab === "instances" && (
            <SettingsScrollPanel contentClassName={scrollPanelContentClassName}>
              <Card className="flex min-h-full flex-col">
                <CardHeader>
                  <CardTitle>{t("nav.instances")}</CardTitle>
                  <CardDescription>
                    {t("settings.instancesDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="min-h-0 flex-1">
                  <InstancesManager search={search} onSearchChange={onSearchChange} />
                </CardContent>
              </Card>
            </SettingsScrollPanel>
          )}

          {activeTab === "indexers" && (
            <SettingsScrollPanel contentClassName={scrollPanelContentClassName}>
              <IndexersPage withContainer={false} />
            </SettingsScrollPanel>
          )}

          {activeTab === "search-cache" && (
            <SettingsScrollPanel contentClassName={scrollPanelContentClassName}>
              <TorznabSearchCachePanel />
            </SettingsScrollPanel>
          )}

          {activeTab === "integrations" && (
            <SettingsScrollPanel contentClassName={scrollPanelContentClassName}>
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.arrTitle")}</CardTitle>
                  <CardDescription>
                    {t("settings.arrDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ArrInstancesManager />
                </CardContent>
              </Card>
            </SettingsScrollPanel>
          )}

          {activeTab === "client-api" && (
            <SettingsScrollPanel contentClassName={scrollPanelContentClassName}>
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.clientProxyTitle")}</CardTitle>
                  <CardDescription>
                    {t("settings.clientProxyDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ClientApiKeysManager />
                </CardContent>
              </Card>
            </SettingsScrollPanel>
          )}

          {activeTab === "api" && (
            <SettingsScrollPanel contentClassName={scrollPanelContentClassName}>
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1.5">
                      <CardTitle>{t("settings.apiKeysTitle")}</CardTitle>
                      <CardDescription>
                        {t("settings.apiKeysDescription")}
                      </CardDescription>
                    </div>
                    <a
                      href={withBasePath("api/docs")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      title={t("settings.apiDocs")}
                    >
                      <span className="hidden sm:inline">{t("settings.apiDocs")}</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </CardHeader>
                <CardContent>
                  <ApiKeysManager />
                </CardContent>
              </Card>
            </SettingsScrollPanel>
          )}

          {activeTab === "external-programs" && (
            <SettingsScrollPanel contentClassName={scrollPanelContentClassName}>
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.externalProgramsTitle")}</CardTitle>
                  <CardDescription>
                    {t("settings.externalProgramsDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ExternalProgramsManager />
                </CardContent>
              </Card>
            </SettingsScrollPanel>
          )}

          {activeTab === "notifications" && (
            <SettingsScrollPanel contentClassName={scrollPanelContentClassName}>
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.notificationsTitle")}</CardTitle>
                  <CardDescription>
                    {t("settings.notificationsDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <NotificationsManager />
                </CardContent>
              </Card>
            </SettingsScrollPanel>
          )}

          {activeTab === "datetime" && (
            <SettingsScrollPanel contentClassName={scrollPanelContentClassName}>
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.dateTimeTitle")}</CardTitle>
                  <CardDescription>
                    {t("settings.dateTimeDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DateTimePreferencesForm />
                </CardContent>
              </Card>
            </SettingsScrollPanel>
          )}

          {activeTab === "themes" && (
            <SettingsScrollPanel contentClassName={scrollPanelContentClassName}>
              <LicenseManager
                checkoutStatus={search.checkout}
                checkoutPaymentStatus={search.status}
                onCheckoutConsumed={() => onSearchChange({ tab: "themes" })}
              />
              <ThemeSelector />
            </SettingsScrollPanel>
          )}

          {activeTab === "security" && (
            <SettingsScrollPanel contentClassName={scrollPanelContentClassName}>
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.changePassword")}</CardTitle>
                  <CardDescription>
                    {t("settings.changePasswordDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChangePasswordForm />
                </CardContent>
              </Card>

              {canRegisterProtocolHandler() && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t("settings.browserIntegration")}</CardTitle>
                    <CardDescription>
                      {t("settings.browserIntegrationDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">
                        {t("settings.magnetHandlerDesc")}
                      </p>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          const success = registerMagnetHandler()
                          if (success) {
                            toast.success(t("settings.magnetHandlerRequested"), {
                              description: getMagnetHandlerRegistrationGuidance(),
                            })
                          } else {
                            toast.error(t("settings.magnetHandlerFailed"))
                          }
                        }}
                        className="w-fit"
                      >
                        {t("settings.registerHandler")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </SettingsScrollPanel>
          )}

          {activeTab === "logs" && (
            <SettingsScrollPanel contentClassName={scrollPanelContentClassName}>
              <LogSettingsPanel />
            </SettingsScrollPanel>
          )}
        </div>
      </div>
    </div>
  )
}
