/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { useInstanceCapabilities } from "@/hooks/useInstanceCapabilities"
import { useInstancePreferences } from "@/hooks/useInstancePreferences"
import { usePersistedStartPaused } from "@/hooks/usePersistedStartPaused"
import { useIncognitoMode } from "@/lib/incognito"
import { useForm } from "@tanstack/react-form"
import React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PreferencesFormShell } from "./PreferencesFormShell"

const getLegacyAutorunPlaceholders = (t: (key: string) => string): Array<{ token: string; label: string }> => [
  { token: "%N", label: t("instances.placeholderTorrentName") },
  { token: "%L", label: t("instances.placeholderCategory") },
  { token: "%G", label: t("instances.placeholderTags") },
  { token: "%F", label: t("instances.placeholderContentPath") },
  { token: "%R", label: t("instances.placeholderRootPath") },
  { token: "%D", label: t("instances.placeholderSavePath") },
  { token: "%C", label: t("instances.placeholderNumFiles") },
  { token: "%Z", label: t("instances.placeholderTorrentSize") },
  { token: "%T", label: t("instances.placeholderCurrentTracker") },
  { token: "%I", label: t("instances.placeholderInfoHashV1") },
]

const getModernAutorunPlaceholders = (t: (key: string) => string): Array<{ token: string; label: string }> => [
  { token: "%N", label: t("instances.placeholderTorrentName") },
  { token: "%L", label: t("instances.placeholderCategory") },
  { token: "%G", label: t("instances.placeholderTags") },
  { token: "%F", label: t("instances.placeholderContentPath") },
  { token: "%R", label: t("instances.placeholderRootPath") },
  { token: "%D", label: t("instances.placeholderSavePath") },
  { token: "%C", label: t("instances.placeholderNumFiles") },
  { token: "%Z", label: t("instances.placeholderTorrentSize") },
  { token: "%T", label: t("instances.placeholderCurrentTracker") },
  { token: "%I", label: t("instances.placeholderInfoHashV1OrDash") },
  { token: "%J", label: t("instances.placeholderInfoHashV2OrDash") },
  { token: "%K", label: t("instances.placeholderTorrentId") },
]

const LEGACY_AUTORUN_PROGRAM_PLACEHOLDER = "/path/to/script \"%N\" \"%I\""
const MODERN_AUTORUN_PROGRAM_PLACEHOLDER = "/path/to/script \"%N\" \"%K\""
const AUTORUN_PROGRAM_TIP = "Tip: wrap placeholders in quotes, e.g. \"%N\", to preserve spaces."
const AUTORUN_ON_ADDED_MIN_WEBAPI_VERSION = "2.8.18" // qBittorrent 4.5.0+
const DEFAULT_WATCH_FOLDER_MODE = 0
const OVERRIDE_WATCH_FOLDER_SAVE_MODE = 1
type WatchFolderDestination = "monitored-folder" | "default-save-location" | "other"
type WatchFolderConfig = {
  path: string
  destination: WatchFolderDestination
  otherPath: string
}

function isWebAPIVersionAtLeast(version: string, minimum: string): boolean {
  const parse = (value: string) => value.trim().split(".").map(part => Number.parseInt(part, 10))
  const a = parse(version)
  const b = parse(minimum)

  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false

  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left > right) return true
    if (left < right) return false
  }

  return true
}

function getWatchFolders(scanDirs: Record<string, unknown> | undefined): WatchFolderConfig[] {
  if (!scanDirs || typeof scanDirs !== "object") {
    return []
  }

  return Object.entries(scanDirs).map(([path, value]) => {
    if (typeof value === "string") {
      return { path, destination: "other", otherPath: value }
    }
    if (typeof value === "number" && value === OVERRIDE_WATCH_FOLDER_SAVE_MODE) {
      return { path, destination: "default-save-location", otherPath: "" }
    }
    return { path, destination: "monitored-folder", otherPath: "" }
  })
}

function toScanDirs(watchFolders: WatchFolderConfig[]): Record<string, number | string> {
  return watchFolders.reduce<Record<string, number | string>>((acc, folder) => {
    const path = folder.path.trim()
    if (!path) {
      return acc
    }

    acc[path] = folder.destination === "default-save-location"
      ? OVERRIDE_WATCH_FOLDER_SAVE_MODE
      : folder.destination === "other"
        ? folder.otherPath
        : DEFAULT_WATCH_FOLDER_MODE

    return acc
  }, {})
}

function SwitchSetting({
  label,
  checked,
  onCheckedChange,
  description,
  disabled,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  description?: string
  disabled?: boolean
}) {
  const switchId = React.useId()
  const descriptionId = description ? `${switchId}-desc` : undefined

  return (
    <label
      htmlFor={switchId}
      className="flex items-center gap-3 cursor-pointer"
    >
      <Switch
        id={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={descriptionId}
        disabled={disabled}
      />
      <div className="space-y-0.5">
        <span className="text-sm font-medium">{label}</span>
        {description && (
          <p id={descriptionId} className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </label>
  )
}

interface FileManagementFormProps {
  instanceId: number
  onSuccess?: () => void
}

export function FileManagementForm({ instanceId, onSuccess }: FileManagementFormProps) {
  const { t } = useTranslation()
  const { preferences, isLoading, updatePreferences, isUpdating } = useInstancePreferences(instanceId)
  const [startPausedEnabled, setStartPausedEnabled] = usePersistedStartPaused(instanceId, false)
  const { data: capabilities } = useInstanceCapabilities(instanceId)
  const [incognitoMode] = useIncognitoMode()
  const supportsSubcategories = capabilities?.supportsSubcategories ?? false
  const webAPIVersion = capabilities?.webAPIVersion?.trim() ?? ""
  const supportsAutorunOnTorrentAdded = isWebAPIVersionAtLeast(webAPIVersion, AUTORUN_ON_ADDED_MIN_WEBAPI_VERSION)
  const autorunPlaceholders = supportsAutorunOnTorrentAdded ? getModernAutorunPlaceholders(t) : getLegacyAutorunPlaceholders(t)
  const autorunProgramPlaceholder = supportsAutorunOnTorrentAdded ? MODERN_AUTORUN_PROGRAM_PLACEHOLDER : LEGACY_AUTORUN_PROGRAM_PLACEHOLDER

  const form = useForm({
    defaultValues: {
      auto_tmm_enabled: false,
      torrent_changed_tmm_enabled: true,
      save_path_changed_tmm_enabled: true,
      category_changed_tmm_enabled: true,
      start_paused_enabled: false,
      use_subcategories: false,
      save_path: "",
      temp_path_enabled: false,
      temp_path: "",
      torrent_content_layout: "Original",
      autorun_on_torrent_added_enabled: false,
      autorun_on_torrent_added_program: "",
      autorun_enabled: false,
      autorun_program: "",
      watch_folders: [] as WatchFolderConfig[],
    },
    onSubmit: async ({ value }) => {
      try {
        setStartPausedEnabled(value.start_paused_enabled)

        const qbittorrentPrefs: Record<string, unknown> = {
          auto_tmm_enabled: value.auto_tmm_enabled,
          torrent_changed_tmm_enabled: value.torrent_changed_tmm_enabled,
          save_path_changed_tmm_enabled: value.save_path_changed_tmm_enabled,
          category_changed_tmm_enabled: value.category_changed_tmm_enabled,
          save_path: value.save_path,
          temp_path_enabled: value.temp_path_enabled,
          temp_path: value.temp_path,
          torrent_content_layout: value.torrent_content_layout ?? "Original",
          autorun_enabled: value.autorun_enabled,
          autorun_program: value.autorun_program,
          scan_dirs: toScanDirs(value.watch_folders),
        }
        if (supportsAutorunOnTorrentAdded) {
          qbittorrentPrefs.autorun_on_torrent_added_enabled = value.autorun_on_torrent_added_enabled
          qbittorrentPrefs.autorun_on_torrent_added_program = value.autorun_on_torrent_added_program
        }
        if (supportsSubcategories) {
          qbittorrentPrefs.use_subcategories = Boolean(value.use_subcategories)
        }
        updatePreferences(qbittorrentPrefs)
        toast.success(t("instances.fileManagementUpdated"))
        onSuccess?.()
      } catch {
        toast.error(t("instances.fileManagementUpdateFailed"))
      }
    },
  })

  React.useEffect(() => {
    if (preferences) {
      form.setFieldValue("auto_tmm_enabled", preferences.auto_tmm_enabled)
      form.setFieldValue("torrent_changed_tmm_enabled", preferences.torrent_changed_tmm_enabled ?? true)
      form.setFieldValue("save_path_changed_tmm_enabled", preferences.save_path_changed_tmm_enabled ?? true)
      form.setFieldValue("category_changed_tmm_enabled", preferences.category_changed_tmm_enabled ?? true)
      if (supportsSubcategories) {
        form.setFieldValue("use_subcategories", Boolean(preferences.use_subcategories))
      } else {
        form.setFieldValue("use_subcategories", false)
      }
      form.setFieldValue("save_path", preferences.save_path)
      form.setFieldValue("temp_path_enabled", preferences.temp_path_enabled)
      form.setFieldValue("temp_path", preferences.temp_path)
      form.setFieldValue("torrent_content_layout", preferences.torrent_content_layout ?? "Original")
      form.setFieldValue("autorun_on_torrent_added_enabled", preferences.autorun_on_torrent_added_enabled ?? false)
      form.setFieldValue("autorun_on_torrent_added_program", preferences.autorun_on_torrent_added_program ?? "")
      form.setFieldValue("autorun_enabled", preferences.autorun_enabled ?? false)
      form.setFieldValue("autorun_program", preferences.autorun_program ?? "")
      form.setFieldValue("watch_folders", getWatchFolders(preferences.scan_dirs))
    }
  }, [preferences, form, supportsSubcategories])

  React.useEffect(() => {
    form.setFieldValue("start_paused_enabled", startPausedEnabled)
  }, [startPausedEnabled, form])

  if (isLoading) {
    return (
      <div className="text-center py-8" role="status" aria-live="polite">
        <p className="text-sm text-muted-foreground">{t("instances.loadingFileManagement")}</p>
      </div>
    )
  }

  if (!preferences) {
    return (
      <div className="text-center py-8" role="alert">
        <p className="text-sm text-muted-foreground">{t("instances.failedLoadPreferences")}</p>
      </div>
    )
  }

  return (
    <PreferencesFormShell
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      footer={(
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
        >
          {([canSubmit, isSubmitting]) => (
            <Button
              type="submit"
              disabled={!canSubmit || isSubmitting || isUpdating}
              className="min-w-32"
            >
              {isSubmitting || isUpdating ? t("instances.saving") : t("instances.save")}
            </Button>
          )}
        </form.Subscribe>
      )}
    >
      <div className="space-y-6">
        <div className="space-y-6">
          <form.Field name="auto_tmm_enabled">
            {(field) => (
              <SwitchSetting
                label={t("instances.automaticTorrentManagement")}
                checked={field.state.value as boolean}
                onCheckedChange={field.handleChange}
                description={t("instances.automaticTorrentManagementDesc")}
              />
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.values.auto_tmm_enabled}>
            {(autoTmmEnabled) =>
              autoTmmEnabled && (
                <div className="ml-6 pl-4 border-l-2 border-muted space-y-4">
                  <form.Field name="torrent_changed_tmm_enabled">
                    {(field) => (
                      <SwitchSetting
                        label={t("instances.relocateOnCategoryChange")}
                        checked={field.state.value as boolean}
                        onCheckedChange={field.handleChange}
                        description={t("instances.relocateOnCategoryChangeDesc")}
                      />
                    )}
                  </form.Field>

                  <form.Field name="save_path_changed_tmm_enabled">
                    {(field) => (
                      <SwitchSetting
                        label={t("instances.relocateOnDefaultSavePathChange")}
                        checked={field.state.value as boolean}
                        onCheckedChange={field.handleChange}
                        description={t("instances.relocateOnDefaultSavePathChangeDesc")}
                      />
                    )}
                  </form.Field>

                  <form.Field name="category_changed_tmm_enabled">
                    {(field) => (
                      <SwitchSetting
                        label={t("instances.relocateOnCategorySavePathChange")}
                        checked={field.state.value as boolean}
                        onCheckedChange={field.handleChange}
                        description={t("instances.relocateOnCategorySavePathChangeDesc")}
                      />
                    )}
                  </form.Field>
                </div>
              )
            }
          </form.Subscribe>

          {supportsSubcategories && (
            <form.Field name="use_subcategories">
              {(field) => (
                <SwitchSetting
                  label={t("instances.enableSubcategories")}
                  checked={field.state.value as boolean}
                  onCheckedChange={field.handleChange}
                  description={t("instances.enableSubcategoriesDesc")}
                />
              )}
            </form.Field>
          )}

          <form.Field name="start_paused_enabled">
            {(field) => (
              <SwitchSetting
                label={t("instances.startTorrentsPaused")}
                checked={field.state.value as boolean}
                onCheckedChange={field.handleChange}
                description={t("instances.startTorrentsPausedDesc")}
              />
            )}
          </form.Field>

          <form.Field name="save_path">
            {(field) => (
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("instances.defaultSavePath")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("instances.defaultSavePathDesc")}
                </p>
                <Input
                  value={field.state.value as string}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="/downloads"
                  className={incognitoMode ? "blur-sm select-none" : ""}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="temp_path_enabled">
            {(field) => (
              <SwitchSetting
                label={t("instances.useTemporaryPath")}
                checked={field.state.value as boolean}
                onCheckedChange={field.handleChange}
                description={t("instances.useTemporaryPathDesc")}
              />
            )}
          </form.Field>

          <form.Field name="temp_path">
            {(field) => (
              <form.Subscribe selector={(state) => state.values.temp_path_enabled}>
                {(tempPathEnabled) => (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t("instances.temporaryDownloadPath")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("instances.temporaryDownloadPathDesc")}
                    </p>
                    <Input
                      value={field.state.value as string}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="/temp-downloads"
                      disabled={!tempPathEnabled}
                      className={incognitoMode ? "blur-sm select-none" : ""}
                    />
                  </div>
                )}
              </form.Subscribe>
            )}
          </form.Field>

          <form.Field name="torrent_content_layout">
            {(field) => (
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("instances.defaultContentLayout")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("instances.defaultContentLayoutDesc")}
                </p>
                <Select
                  value={field.state.value as string}
                  onValueChange={field.handleChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("instances.selectContentLayout")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Original">{t("instances.original")}</SelectItem>
                    <SelectItem value="Subfolder">{t("instances.createSubfolder")}</SelectItem>
                    <SelectItem value="NoSubfolder">{t("instances.dontCreateSubfolder")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.values.watch_folders}>
            {(watchFolders) => (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label className="text-sm font-medium">Watch Folders</Label>
                    <p className="text-xs text-muted-foreground">
                      Add one or more monitored folders and choose where discovered torrents should be saved.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => form.setFieldValue("watch_folders", [
                      ...watchFolders,
                      { path: "", destination: "default-save-location", otherPath: "" },
                    ])}
                  >
                    Add Folder
                  </Button>
                </div>

                {watchFolders.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No watch folders configured.
                  </p>
                )}

                {watchFolders.map((watchFolder, index) => (
                  <div key={`watch-folder-${index}`} className="rounded-md border p-3 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Monitored Folder</Label>
                        <Input
                          value={watchFolder.path}
                          onChange={(e) => {
                            const next = [...watchFolders]
                            next[index] = { ...next[index], path: e.target.value }
                            form.setFieldValue("watch_folders", next)
                          }}
                          placeholder="/watchfolder"
                          className={incognitoMode ? "blur-sm select-none" : ""}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Torrent Destination</Label>
                        <Select
                          value={watchFolder.destination}
                          onValueChange={(value) => {
                            const next = [...watchFolders]
                            next[index] = { ...next[index], destination: value as WatchFolderDestination }
                            form.setFieldValue("watch_folders", next)
                          }}
                          disabled={!watchFolder.path}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select destination" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="monitored-folder">Monitored folder</SelectItem>
                            <SelectItem value="default-save-location">Default save location</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {watchFolder.destination === "other" && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Custom Save Path</Label>
                        <Input
                          value={watchFolder.otherPath}
                          onChange={(e) => {
                            const next = [...watchFolders]
                            next[index] = { ...next[index], otherPath: e.target.value }
                            form.setFieldValue("watch_folders", next)
                          }}
                          placeholder="foldername"
                          disabled={!watchFolder.path}
                          className={incognitoMode ? "blur-sm select-none" : ""}
                        />
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => form.setFieldValue("watch_folders", watchFolders.filter((_, i) => i !== index))}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </form.Subscribe>

          <Card className="bg-muted/20 border-muted/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("instances.runExternalProgram")}</CardTitle>
              <CardDescription>
                {t("instances.runExternalProgramDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {supportsAutorunOnTorrentAdded ? (
                <form.Field name="autorun_on_torrent_added_enabled">
                  {(enabledField) => (
                    <div className="space-y-3">
                      <SwitchSetting
                        label={t("instances.runOnTorrentAdded")}
                        checked={enabledField.state.value as boolean}
                        onCheckedChange={enabledField.handleChange}
                        description={t("instances.runOnTorrentAddedDesc")}
                      />

                      <form.Field name="autorun_on_torrent_added_program">
                        {(programField) => (
                          <div className="space-y-2 ml-6 pl-4 border-l-2 border-muted">
                            <Label className="text-sm font-medium">{t("instances.command")}</Label>
                            <Input
                              value={programField.state.value as string}
                              onChange={(e) => programField.handleChange(e.target.value)}
                              placeholder={autorunProgramPlaceholder}
                              disabled={!(enabledField.state.value as boolean)}
                              className={incognitoMode ? "blur-sm select-none" : ""}
                            />
                            <p className="text-xs text-muted-foreground">
                              {t("instances.autorunTip")}
                            </p>
                          </div>
                        )}
                      </form.Field>
                    </div>
                  )}
                </form.Field>
              ) : (
                <div className="space-y-1 rounded-md border border-muted bg-background/40 p-3">
                  <p className="text-sm font-medium">{t("instances.runOnTorrentAddedUnavailable")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("instances.runOnTorrentAddedUnavailableDesc", { minVersion: AUTORUN_ON_ADDED_MIN_WEBAPI_VERSION, currentVersion: webAPIVersion || "N/A" })}
                  </p>
                </div>
              )}

              <form.Field name="autorun_enabled">
                {(enabledField) => (
                  <div className="space-y-3">
                    <SwitchSetting
                      label={t("instances.runOnTorrentFinished")}
                      checked={enabledField.state.value as boolean}
                      onCheckedChange={enabledField.handleChange}
                      description={t("instances.runOnTorrentFinishedDesc")}
                    />

                    <form.Field name="autorun_program">
                      {(programField) => (
                        <div className="space-y-2 ml-6 pl-4 border-l-2 border-muted">
                          <Label className="text-sm font-medium">{t("instances.command")}</Label>
                          <Input
                            value={programField.state.value as string}
                            onChange={(e) => programField.handleChange(e.target.value)}
                            placeholder={autorunProgramPlaceholder}
                            disabled={!(enabledField.state.value as boolean)}
                            className={incognitoMode ? "blur-sm select-none" : ""}
                          />
                          <p className="text-xs text-muted-foreground">
                            {t("instances.autorunTip")}
                          </p>
                        </div>
                      )}
                    </form.Field>
                  </div>
                )}
              </form.Field>

              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("instances.supportedPlaceholders")}</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs text-muted-foreground">
                  {autorunPlaceholders.map((item) => (
                    <div key={item.token}>
                      <code className="font-mono text-foreground">{item.token}</code> {item.label}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PreferencesFormShell>
  )
}
