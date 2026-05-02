/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { CompletionOverview } from "@/components/instances/preferences/CompletionOverview"
import { BlocklistTab } from "@/components/cross-seed/BlocklistTab"
import { DirScanTab } from "@/components/cross-seed/DirScanTab"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MultiSelect } from "@/components/ui/multi-select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDateTimeFormatters } from "@/hooks/useDateTimeFormatters"
import { useInstances } from "@/hooks/useInstances"
import { api } from "@/lib/api"
import { buildCategorySelectOptions, buildTagSelectOptions } from "@/lib/category-utils"
import type {
  CrossSeedAutomationSettingsPatch,
  CrossSeedAutomationStatus,
  CrossSeedRun,
  Instance
} from "@/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  History,
  Info,
  Loader2,
  Play,
  Rocket,
  XCircle,
  Zap
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

// RSS Automation settings
interface AutomationFormState {
  enabled: boolean
  runIntervalMinutes: number  // RSS Automation: interval between RSS feed polls (min: 30 minutes)
  targetInstanceIds: number[]
  targetIndexerIds: number[]
  // RSS source filtering: filter which local torrents to search when checking RSS feeds
  rssSourceCategories: string[]
  rssSourceTags: string[]
  rssSourceExcludeCategories: string[]
  rssSourceExcludeTags: string[]
}

// Global cross-seed settings (apply to both RSS Automation and Seeded Torrent Search)
interface GlobalCrossSeedSettings {
  findIndividualEpisodes: boolean
  sizeMismatchTolerancePercent: number
  useCategoryFromIndexer: boolean
  useCrossCategoryAffix: boolean
  categoryAffixMode: "prefix" | "suffix"
  categoryAffix: string
  useCustomCategory: boolean
  customCategory: string
  runExternalProgramId?: number | null
  // Gazelle (OPS/RED) cross-seed settings
  gazelleEnabled: boolean
  redactedApiKey: string
  orpheusApiKey: string
  // Source-specific tagging
  rssAutomationTags: string[]
  seededSearchTags: string[]
  completionSearchTags: string[]
  webhookTags: string[]
  inheritSourceTags: boolean
  // Skip auto-resume settings per source mode
  skipAutoResumeRss: boolean
  skipAutoResumeSeededSearch: boolean
  skipAutoResumeCompletion: boolean
  skipAutoResumeWebhook: boolean
  skipRecheck: boolean
  skipPieceBoundarySafetyCheck: boolean
  // Webhook source filtering: filter which local torrents to search when checking webhook requests
  webhookSourceCategories: string[]
  webhookSourceTags: string[]
  webhookSourceExcludeCategories: string[]
  webhookSourceExcludeTags: string[]
  // Note: Hardlink mode settings have been moved to per-instance configuration
}

// Category mode type for type-safe radio group
type CategoryMode = "reuse" | "affix" | "indexer" | "custom"

// RSS Automation constants
const MIN_RSS_INTERVAL_MINUTES = 30   // RSS: minimum interval between RSS feed polls
const DEFAULT_RSS_INTERVAL_MINUTES = 120  // RSS: default interval (2 hours)
const MIN_SEEDED_SEARCH_INTERVAL_SECONDS = 60  // Seeded Search: minimum interval between torrents
const MIN_GAZELLE_ONLY_SEARCH_INTERVAL_SECONDS = 5  // Gazelle-only seeded search: still be polite; per-torrent work can trigger multiple API calls
const MIN_SEEDED_SEARCH_COOLDOWN_MINUTES = 720  // Seeded Search: minimum cooldown (12 hours)

// RSS Automation defaults
const DEFAULT_AUTOMATION_FORM: AutomationFormState = {
  enabled: false,
  runIntervalMinutes: DEFAULT_RSS_INTERVAL_MINUTES,
  targetInstanceIds: [],
  targetIndexerIds: [],
  rssSourceCategories: [],
  rssSourceTags: [],
  rssSourceExcludeCategories: [],
  rssSourceExcludeTags: [],
}

const DEFAULT_GLOBAL_SETTINGS: GlobalCrossSeedSettings = {
  findIndividualEpisodes: false,
  sizeMismatchTolerancePercent: 5.0,
  useCategoryFromIndexer: false,
  useCrossCategoryAffix: true,
  categoryAffixMode: "suffix",
  categoryAffix: ".cross",
  useCustomCategory: false,
  customCategory: "",
  runExternalProgramId: null,
  gazelleEnabled: false,
  redactedApiKey: "",
  orpheusApiKey: "",
  // Source-specific tagging defaults
  rssAutomationTags: ["cross-seed"],
  seededSearchTags: ["cross-seed"],
  completionSearchTags: ["cross-seed"],
  webhookTags: ["cross-seed"],
  inheritSourceTags: false,
  // Skip auto-resume defaults (off = preserve existing behavior)
  skipAutoResumeRss: false,
  skipAutoResumeSeededSearch: false,
  skipAutoResumeCompletion: false,
  skipAutoResumeWebhook: false,
  skipRecheck: false,
  skipPieceBoundarySafetyCheck: true,
  // Webhook source filtering defaults - empty means no filtering (all torrents)
  webhookSourceCategories: [],
  webhookSourceTags: [],
  webhookSourceExcludeCategories: [],
  webhookSourceExcludeTags: [],
  // Note: Hardlink mode is now per-instance (configured in Instance Settings)
}

function normalizeStringList(values: string[]): string[] {
  return Array.from(new Set(values.map(item => item.trim()).filter(Boolean)))
}

function normalizeNumberList(values: Array<string | number>): number[] {
  return Array.from(new Set(
    values
      .map(value => Number(value))
      .filter(value => !Number.isNaN(value) && value > 0)
  ))
}

function isGazelleOnlyTorznabIndexer(indexerName: string, indexerID: string, baseURL: string) {
  const haystack = `${indexerName} ${indexerID} ${baseURL}`.toLowerCase()
  return /(^|[^a-z0-9])(ops|orpheus|opsfet|redacted|flacsfor)([^a-z0-9]|$)/.test(haystack)
}

function getDurationParts(ms: number): { hours: number; minutes: number; seconds: number } {
  if (ms <= 0) {
    return { hours: 0, minutes: 0, seconds: 0 }
  }
  const totalSeconds = Math.ceil(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return { hours, minutes, seconds }
}

function formatDurationShort(ms: number): string {
  const { hours, minutes, seconds } = getDurationParts(ms)
  const parts: string[] = []
  if (hours > 0) {
    parts.push(`${hours}h`)
  }
  parts.push(`${String(minutes).padStart(2, "0")}m`)
  parts.push(`${String(seconds).padStart(2, "0")}s`)
  return parts.join(" ")
}

/** Aggregate categories and tags from multiple qBittorrent instances */
function aggregateInstanceMetadata(
  results: Array<{ categories: Record<string, { name: string; savePath: string }>; tags: string[] }>
): { categories: Record<string, { name: string; savePath: string }>; tags: string[] } {
  const allCategories: Record<string, { name: string; savePath: string }> = {}
  const allTags = new Set<string>()
  for (const result of results) {
    for (const [name, cat] of Object.entries(result.categories)) {
      allCategories[name] = cat
    }
    for (const tag of result.tags) {
      allTags.add(tag)
    }
  }
  return { categories: allCategories, tags: Array.from(allTags) }
}

interface CrossSeedPageProps {
  activeTab: "auto" | "scan" | "dir-scan" | "rules" | "blocklist"
  onTabChange: (tab: "auto" | "scan" | "dir-scan" | "rules" | "blocklist") => void
}

interface RSSRunItemProps {
  run: CrossSeedRun
  formatDateValue: (date: string | undefined) => string
}

/** Single RSS run item - used for scheduled, manual, and other run lists */
function RSSRunItem({ run, formatDateValue }: RSSRunItemProps) {
  const { t } = useTranslation()
  const hasResults = run.results && run.results.length > 0
  const successResults = run.results?.filter(r => r.success) ?? []
  const failedResults = run.results?.filter(r => !r.success && r.message) ?? []

  return (
    <Collapsible>
      <CollapsibleTrigger asChild disabled={!hasResults}>
        <div className={`flex items-center justify-between gap-2 p-2 rounded bg-muted/30 text-sm ${hasResults ? "hover:bg-muted/50 cursor-pointer" : ""}`}>
          <div className="flex items-center gap-2 min-w-0">
            {run.status === "success" && <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />}
            {run.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-yellow-500 shrink-0" />}
            {run.status === "failed" && <XCircle className="h-3 w-3 text-destructive shrink-0" />}
            {run.status === "partial" && <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />}
            {run.status === "pending" && <Clock className="h-3 w-3 text-muted-foreground shrink-0" />}
            <span className="text-xs text-muted-foreground">{run.totalFeedItems} {t("crossSeed.items")}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="text-xs">+{run.torrentsAdded}</Badge>
            {run.torrentsFailed > 0 && (
              <Badge variant="destructive" className="text-xs">{run.torrentsFailed} {t("crossSeed.failed")}</Badge>
            )}
            <span className="text-xs text-muted-foreground">{formatDateValue(run.startedAt)}</span>
            {hasResults && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          </div>
        </div>
      </CollapsibleTrigger>
      {hasResults && (
        <CollapsibleContent>
          <div className="pl-5 pr-2 py-2 space-y-1 border-l-2 border-muted ml-1.5 mt-1 max-h-48 overflow-y-auto">
            {successResults.map((result, i) => (
              <div key={`${result.instanceId}-${i}`} className="flex items-center gap-2 text-xs">
                <Badge variant="default" className="text-[10px] shrink-0 w-20 justify-center truncate" title={result.instanceName}>{result.instanceName}</Badge>
                {result.indexerName && (
                  <Badge variant="secondary" className="text-[10px] shrink-0 w-24 justify-center truncate" title={result.indexerName}>{result.indexerName}</Badge>
                )}
                <span className="truncate text-muted-foreground">{result.matchedTorrentName}</span>
              </div>
            ))}
            {successResults.length === 0 && failedResults.length === 0 && run.results && run.results.length > 0 && (
              <span className="text-xs text-muted-foreground">No results with details</span>
            )}
            {failedResults.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                <span className="text-[10px] text-muted-foreground font-medium">Failed:</span>
                {failedResults.map((result, i) => (
                  <div key={`failed-${result.instanceId}-${i}`} className="flex flex-col gap-0.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-[10px] shrink-0 w-20 justify-center truncate" title={result.instanceName}>{result.instanceName}</Badge>
                      {result.indexerName && (
                        <Badge variant="secondary" className="text-[10px] shrink-0 w-24 justify-center truncate" title={result.indexerName}>{result.indexerName}</Badge>
                      )}
                    </div>
                    <span className="text-muted-foreground pl-1">{result.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

/** Per-instance hardlink/reflink mode settings component */
function HardlinkModeSettings() {
  const { t } = useTranslation()
  const { instances, updateInstance, isUpdating } = useInstances()
  const [expandedInstances, setExpandedInstances] = useState<string[]>([])
  const [dirtyMap, setDirtyMap] = useState<Record<number, boolean>>({})
  type InstanceFormState = {
    useHardlinks: boolean
    useReflinks: boolean
    hardlinkBaseDir: string
    hardlinkDirPreset: "flat" | "by-tracker" | "by-instance"
    fallbackToRegularMode: boolean
  }
  const [formMap, setFormMap] = useState<Record<number, InstanceFormState>>({})
  const [isOpen, setIsOpen] = useState<boolean | undefined>(undefined)

  const activeInstances = useMemo(
    () => (instances ?? []).filter((inst) => inst.isActive),
    [instances]
  )

  // Auto-expand when 3 or fewer instances (only on first load)
  useEffect(() => {
    if (isOpen === undefined && instances !== undefined) {
      const activeCount = (instances ?? []).filter((inst) => inst.isActive).length
      setIsOpen(activeCount <= 3)
    }
  }, [instances, isOpen])

  const getForm = useCallback((instance: Instance) => {
    return formMap[instance.id] ?? {
      useHardlinks: instance.useHardlinks,
      useReflinks: instance.useReflinks,
      hardlinkBaseDir: instance.hardlinkBaseDir || "",
      hardlinkDirPreset: instance.hardlinkDirPreset || "flat",
      fallbackToRegularMode: instance.fallbackToRegularMode ?? false,
    }
  }, [formMap])

  const handleFormChange = <K extends keyof InstanceFormState>(
    instanceId: number,
    field: K,
    value: InstanceFormState[K],
    currentForm: InstanceFormState
  ) => {
    setFormMap((prev) => ({
      ...prev,
      [instanceId]: {
        ...currentForm,
        [field]: value,
      },
    }))
    setDirtyMap((prev) => ({ ...prev, [instanceId]: true }))
  }

  const handleModeChange = (
    instanceId: number,
    mode: "regular" | "hardlink" | "reflink",
    currentForm: InstanceFormState
  ) => {
    setFormMap((prev) => ({
      ...prev,
      [instanceId]: {
        ...currentForm,
        useHardlinks: mode === "hardlink",
        useReflinks: mode === "reflink",
      },
    }))
    setDirtyMap((prev) => ({ ...prev, [instanceId]: true }))
  }

  const handleSave = (instance: Instance) => {
    const form = getForm(instance)

    // Validate before saving
    if ((form.useHardlinks || form.useReflinks) && !instance.hasLocalFilesystemAccess) {
      const mode = form.useReflinks ? t("crossSeed.reflink") : t("crossSeed.hardlink")
      toast.error(t("crossSeed.cannotEnableMode", { mode }), {
        description: t("crossSeed.noLocalAccessInstance", { name: instance.name }),
      })
      return
    }

    if ((form.useHardlinks || form.useReflinks) && !form.hardlinkBaseDir.trim()) {
      const mode = form.useReflinks ? t("crossSeed.reflink") : t("crossSeed.hardlink")
      toast.error(t("crossSeed.cannotEnableMode", { mode }), {
        description: t("crossSeed.baseDirectoryRequired"),
      })
      return
    }

    updateInstance({
      id: instance.id,
      data: {
        name: instance.name,
        host: instance.host,
        username: instance.username,
        useHardlinks: form.useHardlinks,
        useReflinks: form.useReflinks,
        hardlinkBaseDir: form.hardlinkBaseDir,
        hardlinkDirPreset: form.hardlinkDirPreset,
        fallbackToRegularMode: form.fallbackToRegularMode,
      },
    }, {
      onSuccess: () => {
        toast.success(t("crossSeed.settingsSaved"), {
          description: instance.name,
        })
        setDirtyMap((prev) => ({ ...prev, [instance.id]: false }))
      },
      onError: (error) => {
        toast.error(t("crossSeed.failedSaveSettings"), {
          description: error instanceof Error ? error.message : t("crossSeed.unknownError"),
        })
      },
    })
  }

  if (!activeInstances.length) {
    return (
      <Collapsible className="rounded-lg border border-border/70 bg-muted/40">
        <CollapsibleTrigger className="flex w-full items-center justify-between p-4 font-medium [&[data-state=open]>svg]:rotate-180">
          <span>{t("crossSeed.hardlinkReflinkMode")}</span>
          <ChevronDown className="h-4 w-4 transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border/70 p-4 pt-4">
            <p className="text-sm text-muted-foreground">{t("crossSeed.noActiveInstances")}</p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="rounded-lg border border-border/70 bg-muted/40">
      <CollapsibleTrigger className="flex w-full items-center justify-between p-4 font-medium [&[data-state=open]>svg]:rotate-180">
        <span>{t("crossSeed.hardlinkReflinkMode")}</span>
        <ChevronDown className="h-4 w-4 transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="text-xs text-muted-foreground px-4">
          {t("crossSeed.hardlinkReflinkDesc")}
          <strong>{t("crossSeed.reflinkModeNote")}</strong>{t("crossSeed.reflinkModeDesc")}
        </p>
        <div className="border-t border-border/70 p-4 space-y-4">

          <Accordion
            type="multiple"
            value={expandedInstances}
            onValueChange={setExpandedInstances}
            className="space-y-2"
          >
            {activeInstances.map((instance) => {
              const form = getForm(instance)
              const isDirty = dirtyMap[instance.id] ?? false
              const canEnableModes = instance.hasLocalFilesystemAccess

              return (
                <AccordionItem
                  key={instance.id}
                  value={String(instance.id)}
                  className="border border-border/70 rounded-lg bg-background/50"
                >
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="font-medium truncate">{instance.name}</span>
                      {form.useHardlinks && (
                        <Badge variant="outline" className="shrink-0 bg-primary/10 text-primary border-primary/30 text-xs">
                          {t("crossSeed.hardlink")}
                        </Badge>
                      )}
                      {form.useReflinks && (
                        <Badge variant="outline" className="shrink-0 bg-blue-500/10 text-blue-500 border-blue-500/30 text-xs">
                          {t("crossSeed.reflink")}
                        </Badge>
                      )}
                      {!canEnableModes && (
                        <Badge variant="outline" className="shrink-0 bg-muted text-muted-foreground border-muted-foreground/30 text-xs">
                          {t("crossSeed.noLocalAccess")}
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-4 pt-2">
                      {/* Link mode selection */}
                      <div className="space-y-2">
                        <Label className="font-medium">{t("crossSeed.crossSeedMode")}</Label>
                        {!canEnableModes && (
                          <p className="text-xs text-muted-foreground">
                            {t("crossSeed.enableLocalAccess")}
                          </p>
                        )}
                        <RadioGroup
                          value={form.useReflinks ? "reflink" : form.useHardlinks ? "hardlink" : "regular"}
                          onValueChange={(value) => handleModeChange(instance.id, value as "regular" | "hardlink" | "reflink", form)}
                          disabled={isUpdating}
                          className="space-y-2"
                        >
                          <div className="flex items-start gap-3">
                            <RadioGroupItem value="regular" id={`mode-regular-${instance.id}`} className="mt-0.5" />
                            <div className="space-y-0.5 flex-1">
                              <Label htmlFor={`mode-regular-${instance.id}`} className="font-medium cursor-pointer">{t("crossSeed.regular")}</Label>
                              <p className="text-xs text-muted-foreground">{t("crossSeed.regularDesc")}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <RadioGroupItem
                              value="hardlink"
                              id={`mode-hardlink-${instance.id}`}
                              className="mt-0.5"
                              disabled={!canEnableModes}
                            />
                            <div className="space-y-0.5 flex-1">
                              <Label htmlFor={`mode-hardlink-${instance.id}`} className={`font-medium cursor-pointer ${!canEnableModes ? "text-muted-foreground" : ""}`}>{t("crossSeed.hardlink")}</Label>
                              <p className="text-xs text-muted-foreground">{t("crossSeed.hardlinkDesc")}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <RadioGroupItem
                              value="reflink"
                              id={`mode-reflink-${instance.id}`}
                              className="mt-0.5"
                              disabled={!canEnableModes}
                            />
                            <div className="space-y-0.5 flex-1">
                              <Label htmlFor={`mode-reflink-${instance.id}`} className={`font-medium cursor-pointer ${!canEnableModes ? "text-muted-foreground" : ""}`}>{t("crossSeed.reflink")} (copy-on-write)</Label>
                              <p className="text-xs text-muted-foreground">{t("crossSeed.reflinkDesc")}</p>
                            </div>
                          </div>
                        </RadioGroup>
                      </div>

                      {(form.useHardlinks || form.useReflinks) && (
                        <>
                          <Separator />

                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>{t("crossSeed.baseDirectories")}</Label>
                              <Input
                                placeholder="/path/to/crossseed-data, /other/path/to/crossseed-data"
                                value={form.hardlinkBaseDir}
                                onChange={(e) => handleFormChange(instance.id, "hardlinkBaseDir", e.target.value, form)}
                              />
                              <p className="text-xs text-muted-foreground">
                                {t("crossSeed.baseDirectoriesDesc")}
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label>{t("crossSeed.directoryOrganization")}</Label>
                              <Select
                                value={form.hardlinkDirPreset}
                                onValueChange={(value: "flat" | "by-tracker" | "by-instance") =>
                                  handleFormChange(instance.id, "hardlinkDirPreset", value, form)
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="flat">{t("crossSeed.flat")}</SelectItem>
                                  <SelectItem value="by-tracker">{t("crossSeed.byTracker")}</SelectItem>
                                  <SelectItem value="by-instance">{t("crossSeed.byInstance")}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="flex items-start gap-3">
                              <Checkbox
                                id={`fallback-${instance.id}`}
                                checked={form.fallbackToRegularMode}
                                onCheckedChange={(checked) =>
                                  handleFormChange(instance.id, "fallbackToRegularMode", checked === true, form)
                                }
                              />
                              <div className="space-y-0.5 flex-1">
                                <Label htmlFor={`fallback-${instance.id}`} className="font-medium cursor-pointer">
                                  {t("crossSeed.fallbackToRegular")}
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                  {t("crossSeed.fallbackDesc", { mode: form.useReflinks ? t("crossSeed.reflink") : t("crossSeed.hardlink") })}
                                </p>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {isDirty && (
                        <Button
                          size="sm"
                          onClick={() => handleSave(instance)}
                          disabled={isUpdating}
                        >
                          {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {t("crossSeed.saveChanges")}
                        </Button>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function CrossSeedPage({ activeTab, onTabChange }: CrossSeedPageProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { formatDate } = useDateTimeFormatters()

  // RSS Automation state
  const [automationForm, setAutomationForm] = useState<AutomationFormState>(DEFAULT_AUTOMATION_FORM)
  const [globalSettings, setGlobalSettings] = useState<GlobalCrossSeedSettings>(DEFAULT_GLOBAL_SETTINGS)
  const [formInitialized, setFormInitialized] = useState(false)
  const [globalSettingsInitialized, setGlobalSettingsInitialized] = useState(false)
  const [dryRun, setDryRun] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // Seeded Torrent Search state (separate from RSS Automation)
  const [searchInstanceId, setSearchInstanceId] = useState<number | null>(null)
  const [searchCategories, setSearchCategories] = useState<string[]>([])
  const [searchTags, setSearchTags] = useState<string[]>([])
  const [searchIndexerIds, setSearchIndexerIds] = useState<number[]>([])
  const [seededSearchTorznabEnabled, setSeededSearchTorznabEnabled] = useState(true)
  const [searchIntervalSeconds, setSearchIntervalSeconds] = useState(MIN_SEEDED_SEARCH_INTERVAL_SECONDS)
  const [searchCooldownMinutes, setSearchCooldownMinutes] = useState(MIN_SEEDED_SEARCH_COOLDOWN_MINUTES)
  const [searchSettingsInitialized, setSearchSettingsInitialized] = useState(false)
  const [searchResultsOpen, setSearchResultsOpen] = useState(false)
  const [rssRunsOpen, setRssRunsOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const formatDateValue = useCallback((value?: string | Date | null) => {
    if (!value) {
      return "—"
    }
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) {
      return "—"
    }
    return formatDate(date)
  }, [formatDate])

  const { data: settings } = useQuery({
    queryKey: ["cross-seed", "settings"],
    queryFn: () => api.getCrossSeedSettings(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ["cross-seed", "status"],
    queryFn: () => api.getCrossSeedStatus(),
    refetchInterval: 30_000,
  })

  const { data: searchSettings } = useQuery({
    queryKey: ["cross-seed", "search", "settings"],
    queryFn: () => api.getCrossSeedSearchSettings(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })

  const { data: runs, refetch: refetchRuns } = useQuery({
    queryKey: ["cross-seed", "runs"],
    queryFn: () => api.listCrossSeedRuns({ limit: 10 }),
  })

  const { data: instances } = useQuery({
    queryKey: ["instances"],
    queryFn: () => api.getInstances(),
  })
  const activeInstances = useMemo(
    () => (instances ?? []).filter(instance => instance.isActive),
    [instances]
  )

  const { data: indexers } = useQuery({
    queryKey: ["torznab", "indexers"],
    queryFn: () => api.listTorznabIndexers(),
  })

  const enabledIndexers = useMemo(
    () => (indexers ?? []).filter(indexer => indexer.enabled),
    [indexers]
  )

  const hasEnabledIndexers = enabledIndexers.length > 0

  const notifyMissingIndexers = useCallback((context: string) => {
    toast.error(t("crossSeed.noTorznabIndexers"), {
      description: t("crossSeed.addIndexerHint", { context }),
    })
  }, [t])

  const handleIndexerError = useCallback((error: Error, context: string) => {
    const normalized = error.message?.toLowerCase?.() ?? ""
    if (normalized.includes("torznab indexers")) {
      notifyMissingIndexers(context)
      return true
    }
    return false
  }, [notifyMissingIndexers])

  const { data: externalPrograms } = useQuery({
    queryKey: ["external-programs"],
    queryFn: () => api.listExternalPrograms(),
  })
  const enabledExternalPrograms = useMemo(
    () => (externalPrograms ?? []).filter(program => program.enabled),
    [externalPrograms]
  )

  const { data: searchStatus, refetch: refetchSearchStatus } = useQuery({
    queryKey: ["cross-seed", "search-status"],
    queryFn: () => api.getCrossSeedSearchStatus(),
    refetchInterval: 5_000,
  })

  const { data: searchRuns, refetch: refetchSearchRuns } = useQuery({
    queryKey: ["cross-seed", "search-runs", searchInstanceId],
    queryFn: () => searchInstanceId ? api.listCrossSeedSearchRuns(searchInstanceId, { limit: 10 }) : Promise.resolve([]),
    enabled: !!searchInstanceId,
  })

  const { data: searchMetadata } = useQuery({
    queryKey: ["cross-seed", "search-metadata", searchInstanceId],
    queryFn: async () => {
      if (!searchInstanceId) return null
      const [categories, tags] = await Promise.all([
        api.getCategories(searchInstanceId),
        api.getTags(searchInstanceId),
      ])
      return { categories, tags }
    },
    enabled: !!searchInstanceId,
  })

  // Fetch categories/tags from all RSS Automation target instances (aggregated)
  const { data: rssSourceMetadata } = useQuery({
    queryKey: ["cross-seed", "rss-source-metadata", automationForm.targetInstanceIds],
    queryFn: async () => {
      if (automationForm.targetInstanceIds.length === 0) return null
      const results = await Promise.all(
        automationForm.targetInstanceIds.map(async (instanceId) => {
          const [categories, tags] = await Promise.all([
            api.getCategories(instanceId),
            api.getTags(instanceId),
          ])
          return { categories, tags }
        })
      )
      return aggregateInstanceMetadata(results)
    },
    enabled: automationForm.targetInstanceIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch categories/tags from ALL active instances (for webhook source filters)
  const { data: webhookSourceMetadata } = useQuery({
    queryKey: ["cross-seed", "webhook-source-metadata", activeInstances.map(i => i.id)],
    queryFn: async () => {
      if (activeInstances.length === 0) return null
      const results = await Promise.all(
        activeInstances.map(async (instance) => {
          const [categories, tags] = await Promise.all([
            api.getCategories(instance.id),
            api.getTags(instance.id),
          ])
          return { categories, tags }
        })
      )
      return aggregateInstanceMetadata(results)
    },
    enabled: activeInstances.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  const { data: searchCacheStats } = useQuery({
    queryKey: ["torznab", "search-cache", "stats", "cross-seed"],
    queryFn: () => api.getTorznabSearchCacheStats(),
    staleTime: 60 * 1000,
  })

  const formatCacheTimestamp = useCallback((value?: string | null) => {
    if (!value) {
      return "—"
    }
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return "—"
    }
    return formatDateValue(parsed)
  }, [formatDateValue])

  useEffect(() => {
    if (settings && !formInitialized) {
      setAutomationForm({
        enabled: settings.enabled,
        runIntervalMinutes: settings.runIntervalMinutes,
        targetInstanceIds: settings.targetInstanceIds,
        targetIndexerIds: settings.targetIndexerIds,
        rssSourceCategories: settings.rssSourceCategories ?? [],
        rssSourceTags: settings.rssSourceTags ?? [],
        rssSourceExcludeCategories: settings.rssSourceExcludeCategories ?? [],
        rssSourceExcludeTags: settings.rssSourceExcludeTags ?? [],
      })
      setFormInitialized(true)
    }
  }, [settings, formInitialized])

  useEffect(() => {
    if (settings && !globalSettingsInitialized) {
      // Normalize category flags: ensure exactly one mode is active (priority: custom > indexer > affix > reuse)
      const useCustomCategory = settings.useCustomCategory ?? false
      const useCategoryFromIndexer = !useCustomCategory && (settings.useCategoryFromIndexer ?? false)
      const useCrossCategoryAffix = !useCustomCategory && !useCategoryFromIndexer && (settings.useCrossCategoryAffix ?? true)

      setGlobalSettings({
        findIndividualEpisodes: settings.findIndividualEpisodes,
        sizeMismatchTolerancePercent: settings.sizeMismatchTolerancePercent ?? 5.0,
        useCategoryFromIndexer,
        useCrossCategoryAffix,
        categoryAffixMode: settings.categoryAffixMode ?? "suffix",
        categoryAffix: settings.categoryAffix ?? ".cross",
        useCustomCategory,
        customCategory: settings.customCategory ?? "",
        runExternalProgramId: settings.runExternalProgramId ?? null,
        gazelleEnabled: settings.gazelleEnabled ?? false,
        redactedApiKey: settings.redactedApiKey ?? "",
        orpheusApiKey: settings.orpheusApiKey ?? "",
        // Source-specific tagging
        rssAutomationTags: settings.rssAutomationTags ?? ["cross-seed"],
        seededSearchTags: settings.seededSearchTags ?? ["cross-seed"],
        completionSearchTags: settings.completionSearchTags ?? ["cross-seed"],
        webhookTags: settings.webhookTags ?? ["cross-seed"],
        inheritSourceTags: settings.inheritSourceTags ?? false,
        // Skip auto-resume settings
        skipAutoResumeRss: settings.skipAutoResumeRss ?? false,
        skipAutoResumeSeededSearch: settings.skipAutoResumeSeededSearch ?? false,
        skipAutoResumeCompletion: settings.skipAutoResumeCompletion ?? false,
        skipAutoResumeWebhook: settings.skipAutoResumeWebhook ?? false,
        skipRecheck: settings.skipRecheck ?? false,
        skipPieceBoundarySafetyCheck: settings.skipPieceBoundarySafetyCheck ?? true,
        // Webhook source filtering
        webhookSourceCategories: settings.webhookSourceCategories ?? [],
        webhookSourceTags: settings.webhookSourceTags ?? [],
        webhookSourceExcludeCategories: settings.webhookSourceExcludeCategories ?? [],
        webhookSourceExcludeTags: settings.webhookSourceExcludeTags ?? [],
        // Note: Hardlink mode is now per-instance (configured in Instance Settings)
      })
      setGlobalSettingsInitialized(true)
    }
  }, [settings, globalSettingsInitialized])

  useEffect(() => {
    if (!searchSettings || searchSettingsInitialized) {
      return
    }
    setSearchInstanceId(searchSettings.instanceId ?? null)
    setSearchCategories(normalizeStringList(searchSettings.categories ?? []))
    setSearchTags(normalizeStringList(searchSettings.tags ?? []))
    setSearchIndexerIds(searchSettings.indexerIds ?? [])
    setSearchIntervalSeconds(searchSettings.intervalSeconds ?? MIN_SEEDED_SEARCH_INTERVAL_SECONDS)
    setSearchCooldownMinutes(searchSettings.cooldownMinutes ?? MIN_SEEDED_SEARCH_COOLDOWN_MINUTES)
    setSearchSettingsInitialized(true)
  }, [searchSettings, searchSettingsInitialized])

  useEffect(() => {
    if (!searchInstanceId && instances && instances.length > 0) {
      setSearchInstanceId(instances[0].id)
    }
  }, [instances, searchInstanceId])

  const buildAutomationPatch = useCallback((): CrossSeedAutomationSettingsPatch | null => {
    if (!settings) return null

    const automationSource = formInitialized? automationForm: {
      enabled: settings.enabled,
      runIntervalMinutes: settings.runIntervalMinutes,
      targetInstanceIds: settings.targetInstanceIds,
      targetIndexerIds: settings.targetIndexerIds,
      rssSourceCategories: settings.rssSourceCategories ?? [],
      rssSourceTags: settings.rssSourceTags ?? [],
      rssSourceExcludeCategories: settings.rssSourceExcludeCategories ?? [],
      rssSourceExcludeTags: settings.rssSourceExcludeTags ?? [],
    }

    return {
      enabled: automationSource.enabled,
      runIntervalMinutes: automationSource.runIntervalMinutes,
      targetInstanceIds: automationSource.targetInstanceIds,
      targetIndexerIds: automationSource.targetIndexerIds,
      rssSourceCategories: automationSource.rssSourceCategories,
      rssSourceTags: automationSource.rssSourceTags,
      rssSourceExcludeCategories: automationSource.rssSourceExcludeCategories,
      rssSourceExcludeTags: automationSource.rssSourceExcludeTags,
    }
  }, [settings, automationForm, formInitialized])

  const buildGlobalPatch = useCallback((): CrossSeedAutomationSettingsPatch | null => {
    if (!settings) return null

    // Normalize category flags for fallback path (same priority as init: custom > indexer > affix > reuse)
    const fallbackCustom = settings.useCustomCategory ?? false
    const fallbackIndexer = !fallbackCustom && (settings.useCategoryFromIndexer ?? false)
    const fallbackAffix = !fallbackCustom && !fallbackIndexer && (settings.useCrossCategoryAffix ?? true)

    const globalSource = globalSettingsInitialized ? globalSettings : {
      findIndividualEpisodes: settings.findIndividualEpisodes,
      sizeMismatchTolerancePercent: settings.sizeMismatchTolerancePercent,
      useCategoryFromIndexer: fallbackIndexer,
      useCrossCategoryAffix: fallbackAffix,
      categoryAffixMode: settings.categoryAffixMode ?? "suffix",
      categoryAffix: settings.categoryAffix ?? ".cross",
      useCustomCategory: fallbackCustom,
      customCategory: settings.customCategory ?? "",
      runExternalProgramId: settings.runExternalProgramId ?? null,
      gazelleEnabled: settings.gazelleEnabled ?? false,
      redactedApiKey: settings.redactedApiKey ?? "",
      orpheusApiKey: settings.orpheusApiKey ?? "",
      rssAutomationTags: settings.rssAutomationTags ?? ["cross-seed"],
      seededSearchTags: settings.seededSearchTags ?? ["cross-seed"],
      completionSearchTags: settings.completionSearchTags ?? ["cross-seed"],
      webhookTags: settings.webhookTags ?? ["cross-seed"],
      inheritSourceTags: settings.inheritSourceTags ?? false,
      skipAutoResumeRss: settings.skipAutoResumeRss ?? false,
      skipAutoResumeSeededSearch: settings.skipAutoResumeSeededSearch ?? false,
      skipAutoResumeCompletion: settings.skipAutoResumeCompletion ?? false,
      skipAutoResumeWebhook: settings.skipAutoResumeWebhook ?? false,
      skipRecheck: settings.skipRecheck ?? false,
      skipPieceBoundarySafetyCheck: settings.skipPieceBoundarySafetyCheck ?? true,
      webhookSourceCategories: settings.webhookSourceCategories ?? [],
      webhookSourceTags: settings.webhookSourceTags ?? [],
      webhookSourceExcludeCategories: settings.webhookSourceExcludeCategories ?? [],
      webhookSourceExcludeTags: settings.webhookSourceExcludeTags ?? [],
      // Note: Hardlink mode is now per-instance
    }

    return {
      findIndividualEpisodes: globalSource.findIndividualEpisodes,
      sizeMismatchTolerancePercent: globalSource.sizeMismatchTolerancePercent,
      useCategoryFromIndexer: globalSource.useCategoryFromIndexer,
      useCrossCategoryAffix: globalSource.useCrossCategoryAffix,
      categoryAffixMode: globalSource.categoryAffixMode,
      categoryAffix: globalSource.categoryAffix,
      useCustomCategory: globalSource.useCustomCategory,
      customCategory: globalSource.customCategory,
      runExternalProgramId: globalSource.runExternalProgramId,
      gazelleEnabled: globalSource.gazelleEnabled,
      redactedApiKey: globalSource.redactedApiKey,
      orpheusApiKey: globalSource.orpheusApiKey,
      // Source-specific tagging
      rssAutomationTags: globalSource.rssAutomationTags,
      seededSearchTags: globalSource.seededSearchTags,
      completionSearchTags: globalSource.completionSearchTags,
      webhookTags: globalSource.webhookTags,
      inheritSourceTags: globalSource.inheritSourceTags,
      // Skip auto-resume settings
      skipAutoResumeRss: globalSource.skipAutoResumeRss,
      skipAutoResumeSeededSearch: globalSource.skipAutoResumeSeededSearch,
      skipAutoResumeCompletion: globalSource.skipAutoResumeCompletion,
      skipAutoResumeWebhook: globalSource.skipAutoResumeWebhook,
      skipRecheck: globalSource.skipRecheck,
      skipPieceBoundarySafetyCheck: globalSource.skipPieceBoundarySafetyCheck,
      // Webhook source filtering
      webhookSourceCategories: globalSource.webhookSourceCategories,
      webhookSourceTags: globalSource.webhookSourceTags,
      webhookSourceExcludeCategories: globalSource.webhookSourceExcludeCategories,
      webhookSourceExcludeTags: globalSource.webhookSourceExcludeTags,
      // Note: Hardlink mode is now per-instance (see Instance Settings)
    }
  }, [
    settings,
    globalSettings,
    globalSettingsInitialized,
  ])

  const patchSettingsMutation = useMutation({
    mutationFn: (payload: CrossSeedAutomationSettingsPatch) => api.patchCrossSeedSettings(payload),
    onSuccess: (data) => {
      toast.success(t("crossSeed.settingsUpdated"))
      // Don't reinitialize the form since we just saved it
      queryClient.setQueryData(["cross-seed", "settings"], data)
      refetchStatus()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const startSearchRunMutation = useMutation({
    mutationFn: (payload: Parameters<typeof api.startCrossSeedSearchRun>[0]) => api.startCrossSeedSearchRun(payload),
    onSuccess: () => {
      toast.success(t("crossSeed.searchRunStarted"))
      refetchSearchStatus()
      refetchSearchRuns()
    },
    onError: (error: Error) => {
      if (handleIndexerError(error, t("crossSeed.searchNeedTorznab"))) {
        return
      }
      toast.error(error.message)
    },
  })

  const cancelSearchRunMutation = useMutation({
    mutationFn: () => api.cancelCrossSeedSearchRun(),
    onSuccess: () => {
      toast.success(t("crossSeed.searchRunCanceled"))
      refetchSearchStatus()
      refetchSearchRuns()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const triggerRunMutation = useMutation({
    mutationFn: (payload: { dryRun?: boolean }) => api.triggerCrossSeedRun(payload),
    onSuccess: () => {
      toast.success(t("crossSeed.automationRunStarted"))
      refetchStatus()
      refetchRuns()
    },
    onError: (error: Error) => {
      if (handleIndexerError(error, t("crossSeed.rssNeedTorznab"))) {
        return
      }
      toast.error(error.message)
    },
  })

  const cancelAutomationRunMutation = useMutation({
    mutationFn: () => api.cancelCrossSeedAutomationRun(),
    onSuccess: () => {
      toast.success(t("crossSeed.rssAutomationCanceled"))
      refetchStatus()
      refetchRuns()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const [showCancelAutomationDialog, setShowCancelAutomationDialog] = useState(false)

  const handleSaveAutomation = () => {
    setValidationErrors(prev => ({ ...prev, runIntervalMinutes: "", targetInstanceIds: "" }))

    if (automationForm.enabled && automationForm.targetInstanceIds.length === 0) {
      setValidationErrors(prev => ({ ...prev, targetInstanceIds: t("crossSeed.selectInstanceForRss") }))
      return
    }

    if (automationForm.runIntervalMinutes < MIN_RSS_INTERVAL_MINUTES) {
      setValidationErrors(prev => ({ ...prev, runIntervalMinutes: t("crossSeed.minRssInterval", { min: MIN_RSS_INTERVAL_MINUTES }) }))
      return
    }

    const payload = buildAutomationPatch()
    if (!payload) return

    patchSettingsMutation.mutate(payload)
  }

  const handleSaveGlobal = () => {
    // Clear prior validation errors
    setValidationErrors(prev => ({ ...prev, customCategory: "" }))

    // Validate custom category mode has a category specified
    if (globalSettings.useCustomCategory && !globalSettings.customCategory.trim()) {
      setValidationErrors(prev => ({ ...prev, customCategory: t("crossSeed.customCategoryRequired") }))
      return
    }

    const payload = buildGlobalPatch()
    if (!payload) return

    patchSettingsMutation.mutate(payload)
  }

  const automationStatus: CrossSeedAutomationStatus | undefined = status
  const latestRun: CrossSeedRun | null | undefined = automationStatus?.lastRun
  const automationRunning = automationStatus?.running ?? false
  const effectiveRunIntervalMinutes = formInitialized? automationForm.runIntervalMinutes: settings?.runIntervalMinutes ?? DEFAULT_RSS_INTERVAL_MINUTES
  const enforcedRunIntervalMinutes = Math.max(effectiveRunIntervalMinutes, MIN_RSS_INTERVAL_MINUTES)
  const automationTargetInstanceCount = formInitialized? automationForm.targetInstanceIds.length: settings?.targetInstanceIds?.length ?? 0
  const hasAutomationTargets = automationTargetInstanceCount > 0

  const nextManualRunAt = useMemo(() => {
    if (!latestRun?.startedAt) {
      return null
    }
    const startedAt = new Date(latestRun.startedAt)
    if (Number.isNaN(startedAt.getTime())) {
      return null
    }
    const intervalMs = enforcedRunIntervalMinutes * 60 * 1000
    return new Date(startedAt.getTime() + intervalMs)
  }, [enforcedRunIntervalMinutes, latestRun?.startedAt])

  const manualCooldownRemainingMs = useMemo(() => {
    if (!nextManualRunAt) {
      return 0
    }
    const remaining = nextManualRunAt.getTime() - now
    return remaining > 0 ? remaining : 0
  }, [nextManualRunAt, now])

  const manualCooldownActive = manualCooldownRemainingMs > 0
  const manualCooldownDisplay = manualCooldownActive ? formatDurationShort(manualCooldownRemainingMs) : ""
  const runButtonDisabled = triggerRunMutation.isPending || automationRunning || manualCooldownActive || !hasEnabledIndexers || !hasAutomationTargets
  const runButtonDisabledReason = useMemo(() => {
    if (!hasEnabledIndexers) {
      return t("crossSeed.configureTorznabFirst")
    }
    if (!hasAutomationTargets) {
      return t("crossSeed.selectInstanceBeforeRun")
    }
    if (automationRunning) {
      return t("crossSeed.automationInProgress")
    }
    if (manualCooldownActive) {
      return t("crossSeed.manualRunCooldown", { interval: enforcedRunIntervalMinutes, cooldown: manualCooldownDisplay })
    }
    return undefined
  }, [automationRunning, enforcedRunIntervalMinutes, hasAutomationTargets, hasEnabledIndexers, manualCooldownActive, manualCooldownDisplay, t])

  const handleTriggerAutomationRun = () => {
    if (!hasEnabledIndexers) {
      notifyMissingIndexers(t("crossSeed.rssNeedTorznab"))
      return
    }
    if (!hasAutomationTargets) {
      setValidationErrors(prev => ({ ...prev, targetInstanceIds: t("crossSeed.selectInstanceForRss") }))
      toast.error(t("crossSeed.selectInstanceBeforeRun"))
      return
    }
    if (formInitialized && settings) {
      const savedTargets = [...(settings.targetInstanceIds ?? [])].sort((a, b) => a - b)
      const currentTargets = [...automationForm.targetInstanceIds].sort((a, b) => a - b)
      const targetsMatchSaved =
        savedTargets.length === currentTargets.length &&
        savedTargets.every((value, index) => value === currentTargets[index])
      if (!targetsMatchSaved) {
        toast.error(t("crossSeed.saveRssBeforeRun"))
        return
      }
    }
    triggerRunMutation.mutate({ dryRun })
  }

  const searchRunning = searchStatus?.running ?? false
  const activeSearchRun = searchStatus?.run

  const gazelleSavedEnabled = settings?.gazelleEnabled ?? false
  const gazelleSavedHasOpsKey = Boolean((settings?.orpheusApiKey ?? "").trim())
  const gazelleSavedHasRedKey = Boolean((settings?.redactedApiKey ?? "").trim())
  const gazelleSavedConfigured = gazelleSavedEnabled && (gazelleSavedHasOpsKey || gazelleSavedHasRedKey)
  const gazelleSavedFullyConfigured = gazelleSavedEnabled && gazelleSavedHasOpsKey && gazelleSavedHasRedKey

  const seededSearchForceGazelleOnly = useMemo(() => {
    if (!seededSearchTorznabEnabled) {
      return false
    }
    if (!gazelleSavedFullyConfigured) {
      return false
    }
    if (searchIndexerIds.length === 0) {
      return false
    }

    const selected = new Set(searchIndexerIds)
    let hasSelection = false
    for (const idx of enabledIndexers) {
      if (!selected.has(idx.id)) {
        continue
      }
      hasSelection = true
      if (!isGazelleOnlyTorznabIndexer(idx.name, idx.indexer_id, idx.base_url)) {
        return false
      }
    }
    return hasSelection
  }, [enabledIndexers, gazelleSavedFullyConfigured, searchIndexerIds, seededSearchTorznabEnabled])

  const seededSearchTorznabEffectiveEnabled = seededSearchTorznabEnabled && !seededSearchForceGazelleOnly

  const startSearchRunDisabled = !searchInstanceId || startSearchRunMutation.isPending || searchRunning || (seededSearchTorznabEffectiveEnabled ? (!hasEnabledIndexers && !gazelleSavedConfigured) : !gazelleSavedConfigured)
  const startSearchRunDisabledReason = useMemo(() => {
    if (!seededSearchTorznabEffectiveEnabled && !gazelleSavedConfigured) {
      return t("crossSeed.enableGazelleFirst")
    }
    if (!hasEnabledIndexers && !gazelleSavedConfigured) {
      return t("crossSeed.configureTorznabOrGazelle")
    }
    return undefined
  }, [gazelleSavedConfigured, hasEnabledIndexers, seededSearchTorznabEffectiveEnabled, t])
  const seededSearchIntervalMinimum = useMemo(() => {
    if (!seededSearchTorznabEffectiveEnabled && gazelleSavedConfigured) {
      return MIN_GAZELLE_ONLY_SEARCH_INTERVAL_SECONDS
    }
    return MIN_SEEDED_SEARCH_INTERVAL_SECONDS
  }, [gazelleSavedConfigured, seededSearchTorznabEffectiveEnabled])

  useEffect(() => {
    setSearchIntervalSeconds(prev => (prev < seededSearchIntervalMinimum ? seededSearchIntervalMinimum : prev))
  }, [seededSearchIntervalMinimum])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    if (!manualCooldownActive || !nextManualRunAt) {
      return
    }
    const tick = () => setNow(Date.now())
    tick()
    const interval = window.setInterval(tick, 1_000)
    return () => window.clearInterval(interval)
  }, [manualCooldownActive, nextManualRunAt])

  const instanceOptions = useMemo(
    () => activeInstances.map(instance => ({ label: instance.name, value: String(instance.id) })),
    [activeInstances]
  )

  const indexerOptions = useMemo(
    () => enabledIndexers.map(indexer => ({ label: indexer.name, value: String(indexer.id) })),
    [enabledIndexers]
  )

  const seededSearchIndexerExclusions = useMemo(() => {
    const disallowedIDs = new Set<number>()
    if (!gazelleSavedFullyConfigured) {
      return disallowedIDs
    }
    for (const idx of enabledIndexers) {
      if (isGazelleOnlyTorznabIndexer(idx.name, idx.indexer_id, idx.base_url)) {
        disallowedIDs.add(idx.id)
      }
    }
    return disallowedIDs
  }, [enabledIndexers, gazelleSavedFullyConfigured])

  const seededSearchIndexerOptions = useMemo(
    () => (gazelleSavedFullyConfigured ? enabledIndexers.filter(idx => !isGazelleOnlyTorznabIndexer(idx.name, idx.indexer_id, idx.base_url)) : enabledIndexers)
      .map(indexer => ({ label: indexer.name, value: String(indexer.id) })),
    [enabledIndexers, gazelleSavedFullyConfigured]
  )

  const seededSearchHasOnlyGazelleIndexers = useMemo(() => (
    enabledIndexers.length > 0 &&
    seededSearchIndexerOptions.length === 0 &&
    seededSearchIndexerExclusions.size > 0
  ), [enabledIndexers.length, seededSearchIndexerOptions.length, seededSearchIndexerExclusions.size])

  const seededSearchIndexerPlaceholder = useMemo(() => {
    if (!seededSearchTorznabEffectiveEnabled) {
      if (seededSearchForceGazelleOnly) {
        return t("crossSeed.torznabSkippedGazelleOnly")
      }
      return gazelleSavedConfigured ? t("crossSeed.torznabDisabledGazelleOnly") : t("crossSeed.torznabDisabledEnableGazelle")
    }
    if (seededSearchIndexerOptions.length > 0) {
      return gazelleSavedFullyConfigured ? t("crossSeed.allEnabledNonOpsRed") : t("crossSeed.allEnabledIndexers")
    }
    if (seededSearchHasOnlyGazelleIndexers) {
      return t("crossSeed.onlyOpsRedGazelle")
    }
    return t("crossSeed.noTorznabConfigured")
  }, [gazelleSavedConfigured, gazelleSavedFullyConfigured, seededSearchForceGazelleOnly, seededSearchHasOnlyGazelleIndexers, seededSearchIndexerOptions.length, seededSearchTorznabEffectiveEnabled, t])

  const seededSearchEffectiveIndexerIds = useMemo(() => {
    const allAllowed = enabledIndexers
      .filter(idx => !seededSearchIndexerExclusions.has(idx.id))
      .map(idx => idx.id)

    if (searchIndexerIds.length === 0) {
      if (seededSearchIndexerExclusions.size === 0) {
        return []
      }
      // Backend treats [] as "all enabled"; when exclusions exist, send an explicit list.
      return allAllowed
    }
    if (seededSearchIndexerExclusions.size === 0) {
      return searchIndexerIds
    }

    const filtered = searchIndexerIds.filter(id => !seededSearchIndexerExclusions.has(id))
    if (filtered.length === 0) {
      // Keep empty selection so we can preserve user intent by running Gazelle-only.
      return []
    }
    return filtered
  }, [enabledIndexers, searchIndexerIds, seededSearchIndexerExclusions])

  const seededSearchIndexerHelpText = useMemo(() => {
    if (!seededSearchTorznabEffectiveEnabled) {
      if (seededSearchForceGazelleOnly) {
        return t("crossSeed.selectedTorznabAreGazelleOnly")
      }
      if (gazelleSavedConfigured) {
        return t("crossSeed.torznabDisabledGazelleWillCheck")
      }
      return t("crossSeed.torznabDisabledEnableGazelleForSearch")
    }

    if (seededSearchIndexerOptions.length === 0) {
      if (seededSearchHasOnlyGazelleIndexers) {
        return t("crossSeed.onlyOpsRedTorznabNote")
      }

      if (gazelleSavedConfigured) {
        return t("crossSeed.noNonOpsRedTorznabNote")
      }
      return t("crossSeed.noTorznabConfiguredShort")
    }

    if (seededSearchEffectiveIndexerIds.length === 0) {
      if (gazelleSavedConfigured) {
        return t("crossSeed.allNonOpsRedTorznabWillBeQueried")
      }
      return t("crossSeed.allEnabledTorznabWillBeQueried")
    }
    if (gazelleSavedConfigured) {
      return t("crossSeed.selectedTorznabGazelleOnly", { n: seededSearchEffectiveIndexerIds.length })
    }
    return t("crossSeed.selectedIndexersOnlyShort", { n: seededSearchEffectiveIndexerIds.length })
  }, [gazelleSavedConfigured, seededSearchEffectiveIndexerIds.length, seededSearchForceGazelleOnly, seededSearchHasOnlyGazelleIndexers, seededSearchIndexerOptions.length, seededSearchTorznabEffectiveEnabled, t])

  const seededSearchGazelleStatus = useMemo(() => {
    if (!settings) {
      return t("crossSeed.gazelleLoading")
    }
    if (!settings.gazelleEnabled) {
      return t("crossSeed.gazelleDisabled")
    }
    const ops = (settings.orpheusApiKey ?? "").trim() !== ""
    const red = (settings.redactedApiKey ?? "").trim() !== ""
    if (ops && red) return t("crossSeed.gazelleEnabledBoth")
    if (ops) return t("crossSeed.gazelleEnabledOpsOnly")
    if (red) return t("crossSeed.gazelleEnabledRedOnly")
    return t("crossSeed.gazelleEnabledKeysMissing")
  }, [settings, t])

  const seededSearchGazelleOnlyMode = !seededSearchTorznabEffectiveEnabled && gazelleSavedConfigured

  const seededSearchIntervalPresets = useMemo(() => {
    if (seededSearchGazelleOnlyMode) {
      return [10, 30, 60]
    }
    return [60, 120, 300]
  }, [seededSearchGazelleOnlyMode])

  const seededSearchFlowSummary = gazelleSavedConfigured ? (gazelleSavedFullyConfigured ? t("crossSeed.gazelleChecksAll") : t("crossSeed.gazelleChecksConfigured")) : t("crossSeed.withoutGazelleNote")

  const handleJumpToGazelleSettings = useCallback(() => {
    onTabChange("rules")
    if (typeof window === "undefined") return
    window.setTimeout(() => {
      document.getElementById("gazelle-settings")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 50)
  }, [onTabChange])

  const searchTagNames = useMemo(() => searchMetadata?.tags ?? [], [searchMetadata])

  const searchCategorySelectOptions = useMemo(
    () => buildCategorySelectOptions(searchMetadata?.categories ?? {}, searchCategories),
    [searchCategories, searchMetadata?.categories]
  )

  const searchTagSelectOptions = useMemo(
    () => buildTagSelectOptions(searchTagNames, searchTags),
    [searchTagNames, searchTags]
  )

  // RSS Source filter select options (aggregated from all target instances)
  const rssSourceTagNames = useMemo(() => rssSourceMetadata?.tags ?? [], [rssSourceMetadata])

  const rssSourceCategorySelectOptions = useMemo(
    () => buildCategorySelectOptions(
      rssSourceMetadata?.categories ?? {},
      automationForm.rssSourceCategories,
      automationForm.rssSourceExcludeCategories
    ),
    [automationForm.rssSourceCategories, automationForm.rssSourceExcludeCategories, rssSourceMetadata?.categories]
  )

  const rssSourceTagSelectOptions = useMemo(
    () => buildTagSelectOptions(
      rssSourceTagNames,
      automationForm.rssSourceTags,
      automationForm.rssSourceExcludeTags
    ),
    [rssSourceTagNames, automationForm.rssSourceTags, automationForm.rssSourceExcludeTags]
  )

  // Webhook Source filter select options (aggregated from ALL active instances)
  const webhookSourceTagNames = useMemo(() => webhookSourceMetadata?.tags ?? [], [webhookSourceMetadata])

  const webhookSourceCategorySelectOptions = useMemo(
    () => buildCategorySelectOptions(
      webhookSourceMetadata?.categories ?? {},
      globalSettings.webhookSourceCategories,
      globalSettings.webhookSourceExcludeCategories
    ),
    [globalSettings.webhookSourceCategories, globalSettings.webhookSourceExcludeCategories, webhookSourceMetadata?.categories]
  )

  const webhookSourceTagSelectOptions = useMemo(
    () => buildTagSelectOptions(
      webhookSourceTagNames,
      globalSettings.webhookSourceTags,
      globalSettings.webhookSourceExcludeTags
    ),
    [webhookSourceTagNames, globalSettings.webhookSourceTags, globalSettings.webhookSourceExcludeTags]
  )

  // Custom category select options (uses all active instance categories for suggestions)
  const customCategorySelectOptions = useMemo(
    () => buildCategorySelectOptions(
      webhookSourceMetadata?.categories ?? {},
      globalSettings.customCategory ? [globalSettings.customCategory] : []
    ),
    [globalSettings.customCategory, webhookSourceMetadata?.categories]
  )

  // Helper to get current category mode from boolean flags
  const getCategoryMode = (): CategoryMode => {
    if (globalSettings.useCustomCategory) return "custom"
    if (globalSettings.useCategoryFromIndexer) return "indexer"
    if (globalSettings.useCrossCategoryAffix) return "affix"
    return "reuse"
  }

  // Helper to set category mode (updates all three boolean flags)
  const setCategoryMode = (mode: CategoryMode) => {
    setGlobalSettings(prev => ({
      ...prev,
      useCrossCategoryAffix: mode === "affix",
      useCategoryFromIndexer: mode === "indexer",
      useCustomCategory: mode === "custom",
    }))
  }

  const handleStartSearchRun = () => {
    // Clear previous validation errors
    setValidationErrors({})

    if (!seededSearchTorznabEffectiveEnabled && !gazelleSavedConfigured) {
      toast.error(t("crossSeed.seededSearchNeedsGazelle"), {
        description: t("crossSeed.enableGazelleBeforeRun"),
      })
      return
    }

    if (!hasEnabledIndexers && !gazelleSavedConfigured) {
      toast.error(t("crossSeed.seededSearchNeedsTorznabOrGazelle"), {
        description: t("crossSeed.configureTorznabOrGazelleForSearch"),
      })
      return
    }

    if (!searchInstanceId) {
      toast.error(t("crossSeed.selectInstanceToRun"))
      return
    }

    // Validate search interval and cooldown
    const errors: Record<string, string> = {}
    if (searchIntervalSeconds < seededSearchIntervalMinimum) {
      errors.searchIntervalSeconds = t("crossSeed.minSearchInterval", { min: seededSearchIntervalMinimum })
    }
    if (searchCooldownMinutes < MIN_SEEDED_SEARCH_COOLDOWN_MINUTES) {
      errors.searchCooldownMinutes = t("crossSeed.minSearchCooldown", { min: MIN_SEEDED_SEARCH_COOLDOWN_MINUTES })
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    startSearchRunMutation.mutate({
      instanceId: searchInstanceId,
      categories: searchCategories,
      tags: searchTags,
      intervalSeconds: searchIntervalSeconds,
      indexerIds: seededSearchTorznabEffectiveEnabled ? seededSearchEffectiveIndexerIds : [],
      disableTorznab: !seededSearchTorznabEffectiveEnabled,
      cooldownMinutes: searchCooldownMinutes,
    })
  }

  const estimatedCompletionInfo = useMemo(() => {
    if (!activeSearchRun) {
      return null
    }
    const total = activeSearchRun.totalTorrents ?? 0
    const interval = activeSearchRun.intervalSeconds ?? 0
    if (total === 0 || interval <= 0) {
      return null
    }
    const remaining = Math.max(total - activeSearchRun.processed, 0)
    if (remaining === 0) {
      return null
    }
    const eta = new Date(Date.now() + remaining * interval * 1000)
    return { eta, remaining, interval }
  }, [activeSearchRun])

  const automationEnabled = formInitialized ? automationForm.enabled : settings?.enabled ?? false

  const searchInstanceName = useMemo(
    () => instances?.find(instance => instance.id === searchInstanceId)?.name ?? t("crossSeed.noInstanceSelected"),
    [instances, searchInstanceId, t]
  )

  const currentSearchInstanceName = useMemo(
    () => {
      if (searchRunning && activeSearchRun) {
        return instances?.find(instance => instance.id === activeSearchRun.instanceId)?.name ?? t("crossSeed.instanceLabel", { id: activeSearchRun.instanceId })
      }
      return searchInstanceName
    },
    [instances, searchRunning, activeSearchRun, searchInstanceName, t]
  )

  const automationStatusLabel = automationRunning ? t("crossSeed.running") : automationEnabled ? t("crossSeed.scheduled") : t("crossSeed.disabled")
  const automationStatusVariant: "default" | "secondary" | "destructive" | "outline" =
    automationRunning ? "default" : automationEnabled ? "secondary" : "destructive"
  const searchStatusLabel = searchRunning ? t("crossSeed.running") : t("crossSeed.idle")
  const searchStatusVariant: "default" | "secondary" | "destructive" | "outline" =
    searchRunning ? "default" : "secondary"

  const groupedRuns = useMemo(() => {
    const result = {
      scheduled: [] as CrossSeedRun[],
      manual: [] as CrossSeedRun[],
      other: [] as CrossSeedRun[],
    }
    if (!runs) {
      return result
    }
    for (const run of runs) {
      if (run.triggeredBy === "scheduler") {
        result.scheduled.push(run)
      } else if (run.triggeredBy === "api") {
        result.manual.push(run)
      } else {
        result.other.push(run)
      }
    }
    // Limit each group to 5 most recent runs for cleaner display
    return {
      scheduled: result.scheduled.slice(0, 5),
      manual: result.manual.slice(0, 5),
      other: result.other.slice(0, 5),
    }
  }, [runs])

  const runSummaryStats = useMemo(() => {
    if (!runs || runs.length === 0) {
      return { totalAdded: 0, totalFailed: 0, totalRuns: 0 }
    }
    return {
      totalAdded: runs.reduce((sum, run) => sum + run.torrentsAdded, 0),
      totalFailed: runs.reduce((sum, run) => sum + run.torrentsFailed, 0),
      totalRuns: runs.length,
    }
  }, [runs])

  const searchRunStats = useMemo(() => {
    if (!searchRuns || searchRuns.length === 0) {
      return { totalAdded: 0, totalFailed: 0, totalRuns: 0 }
    }
    return {
      totalAdded: searchRuns.reduce((sum, run) => sum + run.torrentsAdded, 0),
      totalFailed: searchRuns.reduce((sum, run) => sum + run.torrentsFailed, 0),
      totalRuns: searchRuns.length,
    }
  }, [searchRuns])

  return (
    <div className="space-y-6 p-4 lg:p-6 pb-16">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("crossSeed.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("crossSeed.description")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={automationEnabled ? "default" : "secondary"}>
            {t("crossSeed.automation", { state: automationEnabled ? t("common.on") : t("common.off") })}
          </Badge>
        </div>
      </div>

      {!hasEnabledIndexers && (
        <Alert className="border-border rounded-xl bg-card">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle>{t("crossSeed.torznabMissing")}</AlertTitle>
          <AlertDescription className="space-y-1">
            <p>{t("crossSeed.torznabMissingDesc")}</p>
            <p>
              <Link to="/settings" search={{ tab: "indexers" }} className="font-medium text-primary underline-offset-4 hover:underline">
                {t("crossSeed.manageIndexersInSettings")}
              </Link>{" "}
              {t("crossSeed.toAddOrEnable")}
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <Card className="h-full">
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">{t("crossSeed.rssAutomation")}</CardTitle>
              <Badge variant={automationStatusVariant}>
                {automationStatusLabel}
              </Badge>
            </div>
            <CardDescription>{t("crossSeed.rssAutomationDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("crossSeed.nextRun")}</span>
              <span className="font-medium">
                {automationEnabled? automationStatus?.nextRunAt? formatDateValue(automationStatus.nextRunAt): "—": t("crossSeed.disabled")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("crossSeed.manualTrigger")}</span>
              <span className="font-medium">{manualCooldownActive ? t("crossSeed.cooldown", { display: manualCooldownDisplay }) : t("crossSeed.ready")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("crossSeed.lastRun")}</span>
              <span className="font-medium">
                {latestRun ? `${latestRun.status.toUpperCase()} • ${formatDateValue(latestRun.startedAt)}` : t("crossSeed.noRunsYet")}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">{t("crossSeed.seededTorrentSearch")}</CardTitle>
              <Badge variant={searchStatusVariant}>{searchStatusLabel}</Badge>
            </div>
            <CardDescription>{t("crossSeed.seededSearchDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("crossSeed.instance")}</span>
              <span className="font-medium truncate text-right max-w-[180px]">{currentSearchInstanceName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("crossSeed.recentRuns")}</span>
              <span className="font-medium">{searchRuns?.length ?? 0} {t("crossSeed.runs")} • +{searchRuns?.reduce((sum, run) => sum + run.torrentsAdded, 0) ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("crossSeed.now")}</span>
              <span className="font-medium">
                {searchRunning? activeSearchRun? `${activeSearchRun.processed}/${activeSearchRun.totalTorrents ?? "?"} ${t("crossSeed.scanned")}`: t("crossSeed.runningStatus"): t("crossSeed.idle")}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as typeof activeTab)} className="space-y-4">
        <TabsList className="w-full md:w-auto overflow-x-auto">
          <TabsTrigger className="shrink-0" value="auto">{t("crossSeed.auto")}</TabsTrigger>
          <TabsTrigger className="shrink-0" value="scan">{t("crossSeed.scan")}</TabsTrigger>
          <TabsTrigger className="shrink-0" value="dir-scan">{t("crossSeed.dirScan")}</TabsTrigger>
          <TabsTrigger className="shrink-0" value="rules">{t("crossSeed.rules")}</TabsTrigger>
          <TabsTrigger className="shrink-0" value="blocklist">{t("crossSeed.blocklist")}</TabsTrigger>
        </TabsList>

        <TabsContent value="auto" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("crossSeed.rssAutomationTitle")}</CardTitle>
              <CardDescription>{t("crossSeed.rssAutomationTitleDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="automation-enabled" className="flex items-center gap-2">
                    <Switch
                      id="automation-enabled"
                      checked={automationForm.enabled}
                      onCheckedChange={value => {
                        if (value && !hasEnabledIndexers) {
                          notifyMissingIndexers(t("crossSeed.configureTorznabFirst"))
                          return
                        }
                        setAutomationForm(prev => ({ ...prev, enabled: !!value }))
                        if (!value && validationErrors.targetInstanceIds) {
                          setValidationErrors(prev => ({ ...prev, targetInstanceIds: "" }))
                        }
                      }}
                    />
                    {t("crossSeed.enableRssAutomation")}
                  </Label>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="automation-interval">{t("crossSeed.rssRunInterval")}</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={t("crossSeed.rssIntervalHelp")}
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent align="start" className="max-w-xs text-xs">
                        {t("crossSeed.rssIntervalDesc", { min: MIN_RSS_INTERVAL_MINUTES })}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="automation-interval"
                    type="number"
                    min={MIN_RSS_INTERVAL_MINUTES}
                    value={automationForm.runIntervalMinutes}
                    onChange={event => {
                      setAutomationForm(prev => ({ ...prev, runIntervalMinutes: Number(event.target.value) }))
                      // Clear validation error when user changes the value
                      if (validationErrors.runIntervalMinutes) {
                        setValidationErrors(prev => ({ ...prev, runIntervalMinutes: "" }))
                      }
                    }}
                    className={validationErrors.runIntervalMinutes ? "border-destructive" : ""}
                  />
                  {validationErrors.runIntervalMinutes && (
                    <p className="text-sm text-destructive">{validationErrors.runIntervalMinutes}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("crossSeed.targetInstances")}</Label>
                  <MultiSelect
                    options={instanceOptions}
                    selected={automationForm.targetInstanceIds.map(String)}
                    onChange={values => {
                      const nextIds = normalizeNumberList(values)
                      setAutomationForm(prev => ({
                        ...prev,
                        targetInstanceIds: nextIds,
                      }))
                      if (nextIds.length > 0 && validationErrors.targetInstanceIds) {
                        setValidationErrors(prev => ({ ...prev, targetInstanceIds: "" }))
                      }
                    }}
                    placeholder={instanceOptions.length ? t("crossSeed.selectQbittorrentInstances") : t("crossSeed.noActiveInstancesAvailable")}
                    disabled={!instanceOptions.length}
                  />
                  <p className="text-xs text-muted-foreground">
                    {instanceOptions.length === 0? t("crossSeed.noInstancesAvailable"): automationForm.targetInstanceIds.length === 0? t("crossSeed.pickInstanceForCrossSeeds"): t("crossSeed.instanceSelectedCount", { n: automationForm.targetInstanceIds.length })}
                  </p>
                  {validationErrors.targetInstanceIds && (
                    <p className="text-sm text-destructive">{validationErrors.targetInstanceIds}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>{t("crossSeed.targetIndexers")}</Label>
                  <MultiSelect
                    options={indexerOptions}
                    selected={automationForm.targetIndexerIds.map(String)}
                    onChange={values => setAutomationForm(prev => ({
                      ...prev,
                      targetIndexerIds: normalizeNumberList(values),
                    }))}
                    placeholder={indexerOptions.length ? t("crossSeed.allEnabledIndexers") : t("crossSeed.noTorznabConfigured")}
                    disabled={!indexerOptions.length}
                  />
                  <p className="text-xs text-muted-foreground">
                    {indexerOptions.length === 0? t("crossSeed.noTorznabConfiguredShort"): automationForm.targetIndexerIds.length === 0? t("crossSeed.allTorznabEligible"): t("crossSeed.selectedIndexersOnly", { n: automationForm.targetIndexerIds.length })}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <Label>{t("crossSeed.includeCategories")}</Label>
                  <MultiSelect
                    options={rssSourceCategorySelectOptions}
                    selected={automationForm.rssSourceCategories}
                    onChange={values => setAutomationForm(prev => ({ ...prev, rssSourceCategories: values }))}
                    placeholder={
                      automationForm.targetInstanceIds.length > 0? rssSourceCategorySelectOptions.length ? t("crossSeed.allCategories") : t("crossSeed.typeToAddCategories"): t("crossSeed.selectInstancesToLoadCategories")
                    }
                    creatable
                    disabled={automationForm.targetInstanceIds.length === 0}
                  />
                  <p className="text-xs text-muted-foreground">
                    {automationForm.rssSourceCategories.length === 0? t("crossSeed.allCategoriesIncluded"): t("crossSeed.selectedCategoriesOnly", { n: automationForm.rssSourceCategories.length })}
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>{t("crossSeed.includeTags")}</Label>
                  <MultiSelect
                    options={rssSourceTagSelectOptions}
                    selected={automationForm.rssSourceTags}
                    onChange={values => setAutomationForm(prev => ({ ...prev, rssSourceTags: values }))}
                    placeholder={
                      automationForm.targetInstanceIds.length > 0? rssSourceTagSelectOptions.length ? t("crossSeed.allTags") : t("crossSeed.typeToAddTags"): t("crossSeed.selectInstancesToLoadTags")
                    }
                    creatable
                    disabled={automationForm.targetInstanceIds.length === 0}
                  />
                  <p className="text-xs text-muted-foreground">
                    {automationForm.rssSourceTags.length === 0? t("crossSeed.allTagsIncluded"): t("crossSeed.selectedTagsOnly", { n: automationForm.rssSourceTags.length })}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <Label>{t("crossSeed.excludeCategories")}</Label>
                  <MultiSelect
                    options={rssSourceCategorySelectOptions}
                    selected={automationForm.rssSourceExcludeCategories}
                    onChange={values => setAutomationForm(prev => ({ ...prev, rssSourceExcludeCategories: values }))}
                    placeholder={
                      automationForm.targetInstanceIds.length > 0? t("crossSeed.none"): t("crossSeed.selectInstancesToLoadCategories")
                    }
                    creatable
                    disabled={automationForm.targetInstanceIds.length === 0}
                  />
                  <p className="text-xs text-muted-foreground">
                    {automationForm.rssSourceExcludeCategories.length === 0? t("crossSeed.noCategoriesExcluded"): t("crossSeed.categoriesSkipped", { n: automationForm.rssSourceExcludeCategories.length })}
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>{t("crossSeed.excludeTags")}</Label>
                  <MultiSelect
                    options={rssSourceTagSelectOptions}
                    selected={automationForm.rssSourceExcludeTags}
                    onChange={values => setAutomationForm(prev => ({ ...prev, rssSourceExcludeTags: values }))}
                    placeholder={
                      automationForm.targetInstanceIds.length > 0? t("crossSeed.none"): t("crossSeed.selectInstancesToLoadTags")
                    }
                    creatable
                    disabled={automationForm.targetInstanceIds.length === 0}
                  />
                  <p className="text-xs text-muted-foreground">
                    {automationForm.rssSourceExcludeTags.length === 0? t("crossSeed.noTagsExcluded"): t("crossSeed.tagsSkipped", { n: automationForm.rssSourceExcludeTags.length })}
                  </p>
                </div>
              </div>

              <Separator />

              <Collapsible open={rssRunsOpen} onOpenChange={setRssRunsOpen}>
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-4 hover:cursor-pointer text-left hover:bg-muted/50 transition-colors rounded-xl">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{t("crossSeed.recentRssRuns")}</span>
                      {runs && runs.length > 0 ? (
                        <Badge variant="secondary" className="text-xs">
                          {runSummaryStats.totalRuns} {t("crossSeed.runs")} • +{runSummaryStats.totalAdded}
                          {runSummaryStats.totalFailed > 0 && ` • ${runSummaryStats.totalFailed} ${t("crossSeed.failed")}`}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("crossSeed.noRunsYet")}</span>
                      )}
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${rssRunsOpen ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-4 pb-3 space-y-3">
                      {/* Grouped runs */}
                      {runs && runs.length > 0 ? (
                        <div className="space-y-4">
                          {/* Scheduled runs */}
                          {groupedRuns.scheduled.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <Clock className="h-4 w-4 text-blue-500" />
                                {t("crossSeed.scheduledCount", { count: groupedRuns.scheduled.length })}
                              </div>
                              <div className="space-y-1">
                                {groupedRuns.scheduled.map(run => (
                                  <RSSRunItem key={run.id} run={run} formatDateValue={formatDateValue} />
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Manual runs */}
                          {groupedRuns.manual.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <Zap className="h-4 w-4 text-yellow-500" />
                                {t("crossSeed.manualCount", { count: groupedRuns.manual.length })}
                              </div>
                              <div className="space-y-1">
                                {groupedRuns.manual.map(run => (
                                  <RSSRunItem key={run.id} run={run} formatDateValue={formatDateValue} />
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Other runs */}
                          {groupedRuns.other.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <History className="h-4 w-4 text-muted-foreground" />
                                {t("crossSeed.otherCount", { count: groupedRuns.other.length })}
                              </div>
                              <div className="space-y-1">
                                {groupedRuns.other.map(run => (
                                  <RSSRunItem key={run.id} run={run} formatDateValue={formatDateValue} />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-2 text-xs text-muted-foreground">
                          {t("crossSeed.noRssRunsRecorded")}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </CardContent>
            <CardFooter className="flex flex-col-reverse gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 text-xs">
                <Switch id="automation-dry-run" checked={dryRun} onCheckedChange={value => setDryRun(!!value)} />
                <Label htmlFor="automation-dry-run">{t("crossSeed.dryRun")}</Label>
              </div>
              <div className="flex flex-col gap-2 w-full md:w-auto md:flex-row">
                {automationRunning ? (
                  <Button
                    variant="outline"
                    onClick={() => setShowCancelAutomationDialog(true)}
                    disabled={cancelAutomationRunMutation.isPending}
                  >
                    {cancelAutomationRunMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("crossSeed.stopping")}
                      </>
                    ) : (
                      <>
                        <XCircle className="mr-2 h-4 w-4" />
                        {t("crossSeed.cancel")}
                      </>
                    )}
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={handleTriggerAutomationRun}
                        disabled={runButtonDisabled}
                        className="disabled:cursor-not-allowed disabled:pointer-events-auto"
                      >
                        {triggerRunMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        {t("crossSeed.runNow")}
                      </Button>
                    </TooltipTrigger>
                    {runButtonDisabledReason && (
                      <TooltipContent align="end" className="max-w-xs text-xs">
                        {runButtonDisabledReason}
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}
                <Button
                  onClick={handleSaveAutomation}
                  disabled={patchSettingsMutation.isPending}
                >
                  {patchSettingsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("crossSeed.saveRssSettings")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    // Reset to defaults without triggering reinitialization
                    setAutomationForm(DEFAULT_AUTOMATION_FORM)
                  }}
                >
                  {t("crossSeed.reset")}
                </Button>
              </div>
            </CardFooter>
          </Card>

          <CompletionOverview />

          <Card>
            <CardHeader>
              <CardTitle>{t("crossSeed.webhookAutobrr")}</CardTitle>
              <CardDescription>{t("crossSeed.webhookDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <Label>{t("crossSeed.includeCategories")}</Label>
                  <MultiSelect
                    options={webhookSourceCategorySelectOptions}
                    selected={globalSettings.webhookSourceCategories}
                    onChange={values => setGlobalSettings(prev => ({ ...prev, webhookSourceCategories: values }))}
                    placeholder={webhookSourceCategorySelectOptions.length ? t("crossSeed.allCategories") : t("crossSeed.typeToAddCategories")}
                    creatable
                  />
                  <p className="text-xs text-muted-foreground">
                    {globalSettings.webhookSourceCategories.length === 0? t("crossSeed.allCategoriesIncluded"): t("crossSeed.selectedCategoriesOnly", { n: globalSettings.webhookSourceCategories.length })}
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>{t("crossSeed.includeTags")}</Label>
                  <MultiSelect
                    options={webhookSourceTagSelectOptions}
                    selected={globalSettings.webhookSourceTags}
                    onChange={values => setGlobalSettings(prev => ({ ...prev, webhookSourceTags: values }))}
                    placeholder={webhookSourceTagSelectOptions.length ? t("crossSeed.allTags") : t("crossSeed.typeToAddTags")}
                    creatable
                  />
                  <p className="text-xs text-muted-foreground">
                    {globalSettings.webhookSourceTags.length === 0? t("crossSeed.allTagsIncluded"): t("crossSeed.selectedTagsOnly", { n: globalSettings.webhookSourceTags.length })}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <Label>{t("crossSeed.excludeCategories")}</Label>
                  <MultiSelect
                    options={webhookSourceCategorySelectOptions}
                    selected={globalSettings.webhookSourceExcludeCategories}
                    onChange={values => setGlobalSettings(prev => ({ ...prev, webhookSourceExcludeCategories: values }))}
                    placeholder={webhookSourceCategorySelectOptions.length ? t("crossSeed.none") : t("crossSeed.typeToAddCategories")}
                    creatable
                  />
                  <p className="text-xs text-muted-foreground">
                    {globalSettings.webhookSourceExcludeCategories.length === 0? t("crossSeed.noCategoriesExcluded"): t("crossSeed.categoriesSkipped", { n: globalSettings.webhookSourceExcludeCategories.length })}
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>{t("crossSeed.excludeTags")}</Label>
                  <MultiSelect
                    options={webhookSourceTagSelectOptions}
                    selected={globalSettings.webhookSourceExcludeTags}
                    onChange={values => setGlobalSettings(prev => ({ ...prev, webhookSourceExcludeTags: values }))}
                    placeholder={webhookSourceTagSelectOptions.length ? t("crossSeed.none") : t("crossSeed.typeToAddTags")}
                    creatable
                  />
                  <p className="text-xs text-muted-foreground">
                    {globalSettings.webhookSourceExcludeTags.length === 0? t("crossSeed.noTagsExcluded"): t("crossSeed.tagsSkipped", { n: globalSettings.webhookSourceExcludeTags.length })}
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {t("crossSeed.emptyFiltersNote")}
              </p>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button
                onClick={handleSaveGlobal}
                disabled={patchSettingsMutation.isPending}
              >
                {patchSettingsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("crossSeed.saveWebhookFilters")}
              </Button>
            </CardFooter>
          </Card>

        </TabsContent>

        <TabsContent value="scan" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("crossSeed.libraryScan")}</CardTitle>
              <CardDescription>{t("crossSeed.libraryScanDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Alert className="border-destructive/20 bg-destructive/10 text-destructive mb-8">
                <AlertTriangle className="h-4 w-4 !text-destructive" />
                <AlertTitle>{t("crossSeed.runSparingly")}</AlertTitle>
                <AlertDescription>
                  {t("crossSeed.runSparinglyDesc")}
                </AlertDescription>
              </Alert>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <Label htmlFor="search-interval">{t("crossSeed.intervalBetweenTorrents")}</Label>
                  <Input
                    id="search-interval"
                    type="number"
                    min={seededSearchIntervalMinimum}
                    value={searchIntervalSeconds}
                    onChange={event => {
                      setSearchIntervalSeconds(Number(event.target.value) || seededSearchIntervalMinimum)
                      // Clear validation error when user changes the value
                      if (validationErrors.searchIntervalSeconds) {
                        setValidationErrors(prev => ({ ...prev, searchIntervalSeconds: "" }))
                      }
                    }}
                    className={validationErrors.searchIntervalSeconds ? "border-destructive" : ""}
                  />
                  {validationErrors.searchIntervalSeconds && (
                    <p className="text-sm text-destructive">{validationErrors.searchIntervalSeconds}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {seededSearchIntervalPresets.map(seconds => (
                      <Button
                        key={seconds}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSearchIntervalSeconds(seconds)}
                        disabled={seconds < seededSearchIntervalMinimum}
                      >
                        {seconds}s
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("crossSeed.intervalDesc", { min: seededSearchIntervalMinimum })}
                    {seededSearchGazelleOnlyMode && t("crossSeed.intervalRecommended")}
                  </p>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="search-cooldown">{t("crossSeed.cooldownMinutes")}</Label>
                  <Input
                    id="search-cooldown"
                    type="number"
                    min={MIN_SEEDED_SEARCH_COOLDOWN_MINUTES}
                    value={searchCooldownMinutes}
                    onChange={event => {
                      setSearchCooldownMinutes(Number(event.target.value) || MIN_SEEDED_SEARCH_COOLDOWN_MINUTES)
                      // Clear validation error when user changes the value
                      if (validationErrors.searchCooldownMinutes) {
                        setValidationErrors(prev => ({ ...prev, searchCooldownMinutes: "" }))
                      }
                    }}
                    className={validationErrors.searchCooldownMinutes ? "border-destructive" : ""}
                  />
                  {validationErrors.searchCooldownMinutes && (
                    <p className="text-sm text-destructive">{validationErrors.searchCooldownMinutes}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{t("crossSeed.cooldownDesc", { min: MIN_SEEDED_SEARCH_COOLDOWN_MINUTES })}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <Label>{t("crossSeed.categories")}</Label>
                  <MultiSelect
                    options={searchCategorySelectOptions}
                    selected={searchCategories}
                    onChange={values => setSearchCategories(normalizeStringList(values))}
                    placeholder={
                      searchInstanceId? searchCategorySelectOptions.length ? t("crossSeed.allCategories") : t("crossSeed.typeToAddCategories"): t("crossSeed.selectAnInstance")
                    }
                    creatable
                    onCreateOption={value => setSearchCategories(prev => normalizeStringList([...prev, value]))}
                    disabled={!searchInstanceId}
                  />
                  <p className="text-xs text-muted-foreground">
                    {searchInstanceId && searchCategorySelectOptions.length === 0? t("crossSeed.categoriesLoadNote"): searchCategories.length === 0? t("crossSeed.allCategoriesInScan"): t("crossSeed.selectedCategoriesInScan", { n: searchCategories.length })}
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>{t("crossSeed.tags")}</Label>
                  <MultiSelect
                    options={searchTagSelectOptions}
                    selected={searchTags}
                    onChange={values => setSearchTags(normalizeStringList(values))}
                    placeholder={
                      searchInstanceId? searchTagSelectOptions.length ? t("crossSeed.allTags") : t("crossSeed.typeToAddTags"): t("crossSeed.selectAnInstance")
                    }
                    creatable
                    onCreateOption={value => setSearchTags(prev => normalizeStringList([...prev, value]))}
                    disabled={!searchInstanceId}
                  />
                  <p className="text-xs text-muted-foreground">
                    {searchInstanceId && searchTagSelectOptions.length === 0? t("crossSeed.tagsLoadNote"): searchTags.length === 0? t("crossSeed.allTagsInScan"): t("crossSeed.selectedTagsInScan", { n: searchTags.length })}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <Label>{t("crossSeed.sourceInstance")}</Label>
                  <Select
                    value={searchInstanceId ? String(searchInstanceId) : ""}
                    onValueChange={(value) => setSearchInstanceId(Number(value))}
                    disabled={!instances?.length}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("crossSeed.selectAnInstance")} />
                    </SelectTrigger>
                    <SelectContent>
                      {instances?.map(instance => (
                        <SelectItem key={instance.id} value={String(instance.id)}>
                          {instance.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!instances?.length && (
                    <p className="text-xs text-muted-foreground">{t("crossSeed.addInstanceToSearch")}</p>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label>
                      {gazelleSavedConfigured ? t("crossSeed.torznabIndexersNonOpsRed") : t("crossSeed.torznabIndexers")}
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t("crossSeed.torznab")}</span>
                      <Switch checked={seededSearchTorznabEnabled} onCheckedChange={value => setSeededSearchTorznabEnabled(!!value)} />
                    </div>
                  </div>
                  <MultiSelect
                    options={seededSearchIndexerOptions}
                    selected={seededSearchEffectiveIndexerIds.map(String)}
                    onChange={values => setSearchIndexerIds(normalizeNumberList(values))}
                    placeholder={seededSearchIndexerPlaceholder}
                    disabled={!seededSearchIndexerOptions.length || !seededSearchTorznabEnabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    {seededSearchIndexerHelpText}
                  </p>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{seededSearchFlowSummary}</span>
                    <button
                      type="button"
                      onClick={handleJumpToGazelleSettings}
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      {seededSearchGazelleStatus}
                    </button>
                  </div>
                </div>
              </div>

              <Separator />

              {activeSearchRun && (
                <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{t("crossSeed.status")}</p>
                    <Badge variant={searchRunning ? "default" : "secondary"}>{searchRunning ? t("crossSeed.running") : t("crossSeed.idle")}</Badge>
                  </div>
                  {searchStatus?.currentTorrent && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">{t("crossSeed.currentlyProcessing")}</span>{" "}
                      <span className="font-medium">{searchStatus.currentTorrent.torrentName}</span>
                    </div>
                  )}
                  <div className="grid gap-2 text-xs">
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">{t("crossSeed.progress")}</span>
                      <span className="font-medium">{activeSearchRun.processed} / {activeSearchRun.totalTorrents || "?"} {t("crossSeed.torrentsLabel")}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">{t("crossSeed.results")}</span>
                      <span className="font-medium">
                        {activeSearchRun.torrentsAdded} {t("crossSeed.added")} • {activeSearchRun.torrentsSkipped} {t("crossSeed.skipped")} • {activeSearchRun.torrentsFailed} {t("crossSeed.failed")}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">{t("crossSeed.started")}</span>
                      <span className="font-medium">{formatDateValue(activeSearchRun.startedAt)}</span>
                    </div>
                    {estimatedCompletionInfo && (
                      <div className="flex items-center gap-4">
                        <span className="text-muted-foreground">{t("crossSeed.estCompletion")}</span>
                        <span className="font-medium">
                          {formatDateValue(estimatedCompletionInfo.eta)}
                          <span className="text-xs text-muted-foreground font-normal ml-2">
                            ≈ {estimatedCompletionInfo.remaining} {t("crossSeed.torrentsRemaining")} @ {estimatedCompletionInfo.interval}s {t("crossSeed.intervals")}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Collapsible open={searchResultsOpen} onOpenChange={setSearchResultsOpen}>
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-4 hover:cursor-pointer text-left hover:bg-muted/50 transition-colors rounded-xl">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{t("crossSeed.recentRuns")}</span>
                      {searchRunStats.totalRuns > 0 ? (
                        <Badge variant="secondary" className="text-xs">
                          {searchRunStats.totalRuns} {t("crossSeed.runs")} • +{searchRunStats.totalAdded}
                          {searchRunStats.totalFailed > 0 && ` • ${searchRunStats.totalFailed} ${t("crossSeed.failed")}`}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("crossSeed.noRunsYet")}</span>
                      )}
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${searchResultsOpen ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-4 pb-3 space-y-2">
                      {searchRuns && searchRuns.length > 0 ? (
                        <div className="space-y-1">
                          {searchRuns.map(run => {
                            const successResults = run.results?.filter(r => r.added) ?? []
                            const failedResults = run.results?.filter(r => !r.added) ?? []
                            const hasResults = (run.results?.length ?? 0) > 0
                            return (
                              <Collapsible key={run.id}>
                                <CollapsibleTrigger asChild disabled={!hasResults}>
                                  <div className={`flex items-center justify-between gap-2 p-2 rounded bg-muted/30 text-sm ${hasResults ? "hover:bg-muted/50 cursor-pointer" : ""}`}>
                                    <div className="flex items-center gap-2 min-w-0">
                                      {run.status === "success" && <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />}
                                      {run.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-yellow-500 shrink-0" />}
                                      {run.status === "failed" && <XCircle className="h-3 w-3 text-destructive shrink-0" />}
                                      {run.status === "canceled" && <Clock className="h-3 w-3 text-muted-foreground shrink-0" />}
                                      <span className="text-xs text-muted-foreground">
                                        {run.status === "running" ? `${run.processed}/${run.totalTorrents}` : run.totalTorrents} torrents
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Badge variant="secondary" className="text-xs">+{run.torrentsAdded}</Badge>
                                      {run.torrentsFailed > 0 && (
                                        <Badge variant="destructive" className="text-xs">{run.torrentsFailed} failed</Badge>
                                      )}
                                      <span className="text-xs text-muted-foreground">{formatDateValue(run.startedAt)}</span>
                                      {hasResults && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                                    </div>
                                  </div>
                                </CollapsibleTrigger>
                                {hasResults && (
                                  <CollapsibleContent>
                                    <div className="pl-5 pr-2 py-2 space-y-1 border-l-2 border-muted ml-1.5 mt-1 max-h-48 overflow-y-auto">
                                      {successResults.map((result, i) => (
                                        <div key={`success-${result.torrentHash}-${i}`} className="flex items-center gap-2 text-xs">
                                          <Badge variant="default" className="text-[10px] shrink-0 w-24 justify-center truncate" title={result.indexerName}>{result.indexerName || t("crossSeed.unknown")}</Badge>
                                          <span className="truncate text-muted-foreground">{result.torrentName}</span>
                                        </div>
                                      ))}
                                      {successResults.length === 0 && failedResults.length === 0 && run.results && run.results.length > 0 && (
                                        <span className="text-xs text-muted-foreground">{t("crossSeed.noResultsWithDetails")}</span>
                                      )}
                                      {failedResults.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                                          <span className="text-[10px] text-muted-foreground font-medium">{t("crossSeed.failedLabel")}</span>
                                          {failedResults.map((result, i) => (
                                            <div key={`failed-${result.torrentHash}-${i}`} className="flex flex-col gap-0.5 text-xs">
                                              <div className="flex items-center gap-2">
                                                <Badge variant="destructive" className="text-[10px] shrink-0 w-24 justify-center truncate" title={result.indexerName}>{result.indexerName || t("crossSeed.unknown")}</Badge>
                                                <span className="truncate text-muted-foreground">{result.torrentName}</span>
                                              </div>
                                              <span className="text-muted-foreground/70 pl-[104px] text-[10px]">{result.message || t("crossSeed.noMessageProvided")}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </CollapsibleContent>
                                )}
                              </Collapsible>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-2 text-xs text-muted-foreground">
                          {t("crossSeed.noSearchRunsRecorded")}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </CardContent>
            <CardFooter className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                {searchRunning ? (
                  <Button
                    variant="outline"
                    onClick={() => cancelSearchRunMutation.mutate()}
                    disabled={cancelSearchRunMutation.isPending}
                  >
                    {cancelSearchRunMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("crossSeed.stopping")}
                      </>
                    ) : (
                      <>
                        <XCircle className="mr-2 h-4 w-4" />
                        {t("crossSeed.cancel")}
                      </>
                    )}
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handleStartSearchRun}
                        disabled={startSearchRunDisabled}
                        className="disabled:cursor-not-allowed disabled:pointer-events-auto"
                      >
                        {startSearchRunMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                        {t("crossSeed.startRun")}
                      </Button>
                    </TooltipTrigger>
                    {startSearchRunDisabledReason && (
                      <TooltipContent align="start" className="max-w-xs text-xs">
                        {startSearchRunDisabledReason}
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}
              </div>
            </CardFooter>
          </Card>

        </TabsContent>

        <TabsContent value="rules" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("crossSeed.crossSeedRules")}</CardTitle>
              <CardDescription>{t("crossSeed.crossSeedRulesDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <HardlinkModeSettings />

              {/* Gazelle (OPS/RED) */}
              <div id="gazelle-settings" className="rounded-lg border border-border/70 bg-muted/40 p-4 space-y-3 scroll-mt-24">
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">{t("crossSeed.gazelleOpsRed")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("crossSeed.gazelleDesc")}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="gazelle-enabled" className="font-medium">{t("crossSeed.enableGazelleMatching")}</Label>
                    <p className="text-xs text-muted-foreground">{t("crossSeed.enableGazelleDesc")}</p>
                  </div>
                  <Switch
                    id="gazelle-enabled"
                    checked={globalSettings.gazelleEnabled}
                    onCheckedChange={value => setGlobalSettings(prev => ({ ...prev, gazelleEnabled: !!value }))}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2 pt-3 border-t border-border/50">
                  <div className="space-y-2">
                    <Label htmlFor="gazelle-red-api-key">{t("crossSeed.redactedApiKey")}</Label>
                    <Input
                      id="gazelle-red-api-key"
                      type="password"
                      value={globalSettings.redactedApiKey}
                      data-1p-ignore="true"
                      onChange={event => setGlobalSettings(prev => ({ ...prev, redactedApiKey: event.target.value }))}
                      placeholder={globalSettings.gazelleEnabled ? t("crossSeed.pasteRedApiKey") : t("crossSeed.enableToConfigure")}
                      disabled={!globalSettings.gazelleEnabled}
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground">{t("crossSeed.redKeyDesc")}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gazelle-ops-api-key">{t("crossSeed.orpheusApiKey")}</Label>
                    <Input
                      id="gazelle-ops-api-key"
                      type="password"
                      value={globalSettings.orpheusApiKey}
                      data-1p-ignore="true"
                      onChange={event => setGlobalSettings(prev => ({ ...prev, orpheusApiKey: event.target.value }))}
                      placeholder={globalSettings.gazelleEnabled ? t("crossSeed.pasteOpsApiKey") : t("crossSeed.enableToConfigure")}
                      disabled={!globalSettings.gazelleEnabled}
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground">{t("crossSeed.opsKeyDesc")}</p>
                  </div>
                </div>
              </div>

              {/* Matching behavior */}
              <div className="rounded-lg border border-border/70 bg-muted/40 p-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">{t("crossSeed.matchingBehavior")}</p>
                  <p className="text-xs text-muted-foreground">{t("crossSeed.matchingBehaviorDesc")}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="global-size-tolerance">{t("crossSeed.sizeMismatchTolerance")}</Label>
                  <Input
                    id="global-size-tolerance"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={globalSettings.sizeMismatchTolerancePercent}
                    onChange={event => setGlobalSettings(prev => ({
                      ...prev,
                      sizeMismatchTolerancePercent: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                    }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("crossSeed.sizeMismatchDesc")}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/50">
                  <div className="space-y-0.5">
                    <Label htmlFor="global-find-individual-episodes" className="font-medium">{t("crossSeed.crossSeedEpisodesFromPacks")}</Label>
                    <p className="text-xs text-muted-foreground">{t("crossSeed.crossSeedEpisodesDesc")}</p>
                  </div>
                  <Switch
                    id="global-find-individual-episodes"
                    checked={globalSettings.findIndividualEpisodes}
                    onCheckedChange={value => setGlobalSettings(prev => ({ ...prev, findIndividualEpisodes: !!value }))}
                  />
                </div>
              </div>

              {/* Safety & validation */}
              <div className="rounded-lg border border-border/70 bg-muted/40 p-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">{t("crossSeed.safetyValidation")}</p>
                  <p className="text-xs text-muted-foreground">{t("crossSeed.safetyValidationDesc")}</p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="skip-recheck" className="font-medium">{t("crossSeed.skipRecheckRequired")}</Label>
                    <p className="text-xs text-muted-foreground">{t("crossSeed.skipRecheckDesc")}</p>
                  </div>
                  <Switch
                    id="skip-recheck"
                    checked={globalSettings.skipRecheck}
                    onCheckedChange={value => setGlobalSettings(prev => ({ ...prev, skipRecheck: !!value }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/50">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="skip-piece-boundary-check"
                      className={`font-medium ${globalSettings.skipPieceBoundarySafetyCheck ? "text-yellow-600 dark:text-yellow-500" : "text-green-600 dark:text-green-500"}`}
                    >
                      {globalSettings.skipPieceBoundarySafetyCheck ? t("crossSeed.pieceBoundaryDisabled") : t("crossSeed.pieceBoundaryEnabled")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {globalSettings.skipPieceBoundarySafetyCheck? t("crossSeed.allowPieceBoundaryDesc"): t("crossSeed.blockPieceBoundaryDesc")}
                    </p>
                  </div>
                  <Switch
                    id="skip-piece-boundary-check"
                    checked={!globalSettings.skipPieceBoundarySafetyCheck}
                    onCheckedChange={value => setGlobalSettings(prev => ({ ...prev, skipPieceBoundarySafetyCheck: !value }))}
                  />
                </div>
              </div>

              {/* Categories */}
              <div className="rounded-lg border border-border/70 bg-muted/40 p-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">{t("crossSeed.categoriesSection")}</p>
                  <p className="text-xs text-muted-foreground">{t("crossSeed.categoriesDesc")}</p>
                </div>
                <RadioGroup
                  value={getCategoryMode()}
                  onValueChange={(value) => setCategoryMode(value as CategoryMode)}
                  className="space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="reuse" id="category-reuse" className="mt-0.5" />
                    <div className="space-y-0.5 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="category-reuse" className="font-medium cursor-pointer">{t("crossSeed.reuseMatchedCategory")}</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={t("crossSeed.reuseCategoryHelp")}>
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent align="start" className="max-w-xs text-xs">
                            {t("crossSeed.reuseCategoryDesc")}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="text-xs text-muted-foreground">{t("crossSeed.keepCategoryUnchanged")}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="affix" id="category-affix" className="mt-0.5" />
                    <div className="space-y-0.5 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="category-affix" className="font-medium cursor-pointer">{t("crossSeed.categoryAffix")}</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={t("crossSeed.categoryAffixHelp")}>
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent align="start" className="max-w-xs text-xs">
                            {t("crossSeed.categoryAffixDesc")}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="text-xs text-muted-foreground">{t("crossSeed.keepsArrSeparate")}</p>
                      {getCategoryMode() === "affix" && (
                        <div className="flex flex-wrap items-center gap-3 mt-2">
                          <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
                            <button
                              type="button"
                              onClick={() => setGlobalSettings(prev => ({ ...prev, categoryAffixMode: "prefix" }))}
                              className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${globalSettings.categoryAffixMode === "prefix" ? "bg-background text-primary shadow-sm" : "hover:bg-background/50 hover:text-foreground"}`}
                            >
                              {t("crossSeed.prefix")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setGlobalSettings(prev => ({ ...prev, categoryAffixMode: "suffix" }))}
                              className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${globalSettings.categoryAffixMode === "suffix" ? "bg-background text-primary shadow-sm" : "hover:bg-background/50 hover:text-foreground"}`}
                            >
                              {t("crossSeed.suffix")}
                            </button>
                          </div>
                          <Input
                            value={globalSettings.categoryAffix}
                            onChange={e => setGlobalSettings(prev => ({ ...prev, categoryAffix: e.target.value }))}
                            placeholder={globalSettings.categoryAffixMode === "prefix" ? "cross-seed/" : ".cross"}
                            className="max-w-[140px] h-9"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="indexer" id="category-indexer" className="mt-0.5" />
                    <div className="space-y-0.5 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="category-indexer" className="font-medium cursor-pointer">{t("crossSeed.useIndexerAsCategory")}</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={t("crossSeed.indexerCategoryHelp")}>
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent align="start" className="max-w-xs text-xs">
                            {t("crossSeed.useIndexerDesc")}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="text-xs text-muted-foreground">{t("crossSeed.setCategoryToIndexer")}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="custom" id="category-custom" className="mt-0.5" />
                    <div className="space-y-0.5 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="category-custom" className="font-medium cursor-pointer">{t("crossSeed.customCategory")}</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={t("crossSeed.customCategoryHelp")}>
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent align="start" className="max-w-xs text-xs">
                            {t("crossSeed.customCategoryDesc")}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="text-xs text-muted-foreground">{t("crossSeed.useFixedCategory")}</p>
                      {globalSettings.useCustomCategory && (
                        <>
                          <MultiSelect
                            options={customCategorySelectOptions}
                            selected={globalSettings.customCategory ? [globalSettings.customCategory] : []}
                            onChange={values => {
                              setGlobalSettings(prev => ({ ...prev, customCategory: values[0] ?? "" }))
                              setValidationErrors(prev => ({ ...prev, customCategory: "" }))
                            }}
                            placeholder={t("crossSeed.selectOrTypeCategory")}
                            className={`mt-2 max-w-xs ${validationErrors.customCategory ? "border-destructive" : ""}`}
                            creatable
                            onCreateOption={value => {
                              setGlobalSettings(prev => ({ ...prev, customCategory: value }))
                              setValidationErrors(prev => ({ ...prev, customCategory: "" }))
                            }}
                          />
                          {validationErrors.customCategory && (
                            <p className="text-sm text-destructive">{validationErrors.customCategory}</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {/* Tagging */}
              <div className="rounded-lg border border-border/70 bg-muted/40 p-4 space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">{t("crossSeed.tagging")}</p>
                  <p className="text-xs text-muted-foreground">{t("crossSeed.taggingDesc")}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="rss-automation-tags">{t("crossSeed.rssAutomationTags")}</Label>
                    <MultiSelect
                      options={[
                        { label: "cross-seed", value: "cross-seed" },
                        { label: "rss", value: "rss" },
                      ]}
                      selected={globalSettings.rssAutomationTags}
                      onChange={values => setGlobalSettings(prev => ({ ...prev, rssAutomationTags: normalizeStringList(values) }))}
                      placeholder={t("crossSeed.selectTagsForRss")}
                      creatable
                      onCreateOption={value => setGlobalSettings(prev => ({ ...prev, rssAutomationTags: normalizeStringList([...prev.rssAutomationTags, value]) }))}
                    />
                    <p className="text-xs text-muted-foreground">{t("crossSeed.rssTagsDesc")}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="seeded-search-tags">{t("crossSeed.seededSearchTags")}</Label>
                    <MultiSelect
                      options={[
                        { label: "cross-seed", value: "cross-seed" },
                        { label: "seeded-search", value: "seeded-search" },
                      ]}
                      selected={globalSettings.seededSearchTags}
                      onChange={values => setGlobalSettings(prev => ({ ...prev, seededSearchTags: normalizeStringList(values) }))}
                      placeholder={t("crossSeed.selectTagsForSeededSearch")}
                      creatable
                      onCreateOption={value => setGlobalSettings(prev => ({ ...prev, seededSearchTags: normalizeStringList([...prev.seededSearchTags, value]) }))}
                    />
                    <p className="text-xs text-muted-foreground">{t("crossSeed.seededSearchTagsDesc")}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="completion-search-tags">{t("crossSeed.completionSearchTags")}</Label>
                    <MultiSelect
                      options={[
                        { label: "cross-seed", value: "cross-seed" },
                        { label: "completion", value: "completion" },
                      ]}
                      selected={globalSettings.completionSearchTags}
                      onChange={values => setGlobalSettings(prev => ({ ...prev, completionSearchTags: normalizeStringList(values) }))}
                      placeholder={t("crossSeed.selectTagsForCompletionSearch")}
                      creatable
                      onCreateOption={value => setGlobalSettings(prev => ({ ...prev, completionSearchTags: normalizeStringList([...prev.completionSearchTags, value]) }))}
                    />
                    <p className="text-xs text-muted-foreground">{t("crossSeed.completionSearchTagsDesc")}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="webhook-tags">{t("crossSeed.webhookTags")}</Label>
                    <MultiSelect
                      options={[
                        { label: "cross-seed", value: "cross-seed" },
                        { label: "webhook", value: "webhook" },
                        { label: "autobrr", value: "autobrr" },
                      ]}
                      selected={globalSettings.webhookTags}
                      onChange={values => setGlobalSettings(prev => ({ ...prev, webhookTags: normalizeStringList(values) }))}
                      placeholder={t("crossSeed.selectTagsForWebhook")}
                      creatable
                      onCreateOption={value => setGlobalSettings(prev => ({ ...prev, webhookTags: normalizeStringList([...prev.webhookTags, value]) }))}
                    />
                    <p className="text-xs text-muted-foreground">{t("crossSeed.webhookTagsDesc")}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <div className="space-y-0.5">
                    <Label htmlFor="inherit-source-tags" className="font-medium">{t("crossSeed.inheritSourceTags")}</Label>
                    <p className="text-xs text-muted-foreground">{t("crossSeed.inheritSourceTagsDesc")}</p>
                  </div>
                  <Switch
                    id="inherit-source-tags"
                    checked={globalSettings.inheritSourceTags}
                    onCheckedChange={value => setGlobalSettings(prev => ({ ...prev, inheritSourceTags: !!value }))}
                  />
                </div>
              </div>

              {/* Post-injection behavior */}
              <div className="rounded-lg border border-border/70 bg-muted/40 p-4 space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">{t("crossSeed.postInjectionBehavior")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("crossSeed.postInjectionDesc")}
                  </p>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">{t("crossSeed.autoResumeAfterInjection")}</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="auto-resume-rss" className="font-medium">{t("crossSeed.rss")}</Label>
                        <p className="text-xs text-muted-foreground">{t("crossSeed.resumeRssAuto")}</p>
                      </div>
                      <Switch
                        id="auto-resume-rss"
                        checked={!globalSettings.skipAutoResumeRss}
                        onCheckedChange={value => setGlobalSettings(prev => ({ ...prev, skipAutoResumeRss: !value }))}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="auto-resume-seeded-search" className="font-medium">{t("crossSeed.seededSearch")}</Label>
                        <p className="text-xs text-muted-foreground">{t("crossSeed.resumeSeededSearchAuto")}</p>
                      </div>
                      <Switch
                        id="auto-resume-seeded-search"
                        checked={!globalSettings.skipAutoResumeSeededSearch}
                        onCheckedChange={value => setGlobalSettings(prev => ({ ...prev, skipAutoResumeSeededSearch: !value }))}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="auto-resume-completion" className="font-medium">{t("crossSeed.completion")}</Label>
                        <p className="text-xs text-muted-foreground">{t("crossSeed.resumeCompletionAuto")}</p>
                      </div>
                      <Switch
                        id="auto-resume-completion"
                        checked={!globalSettings.skipAutoResumeCompletion}
                        onCheckedChange={value => setGlobalSettings(prev => ({ ...prev, skipAutoResumeCompletion: !value }))}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="auto-resume-webhook" className="font-medium">{t("crossSeed.webhook")}</Label>
                        <p className="text-xs text-muted-foreground">{t("crossSeed.resumeWebhookAuto")}</p>
                      </div>
                      <Switch
                        id="auto-resume-webhook"
                        checked={!globalSettings.skipAutoResumeWebhook}
                        onCheckedChange={value => setGlobalSettings(prev => ({ ...prev, skipAutoResumeWebhook: !value }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t border-border/50">
                  <Label htmlFor="global-external-program">{t("crossSeed.runExternalProgram")}</Label>
                  <Select
                    value={globalSettings.runExternalProgramId ? String(globalSettings.runExternalProgramId) : "none"}
                    onValueChange={(value) => setGlobalSettings(prev => ({
                      ...prev,
                      runExternalProgramId: value === "none" ? null : Number(value),
                    }))}
                    disabled={!enabledExternalPrograms.length}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={
                        !enabledExternalPrograms.length? t("crossSeed.noExternalPrograms"): t("crossSeed.selectExternalProgram")
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("crossSeed.none")}</SelectItem>
                      {enabledExternalPrograms.map(program => (
                        <SelectItem key={program.id} value={String(program.id)}>
                          {program.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t("crossSeed.externalProgramDesc")}
                    {!enabledExternalPrograms.length && (
                      <> <Link to="/settings" search={{ tab: "external-programs" }} className="font-medium text-primary underline-offset-4 hover:underline">{t("crossSeed.configureExternalPrograms")}</Link> {t("crossSeed.toUseFeature")}</>
                    )}
                  </p>
                </div>
              </div>

              {searchCacheStats && (
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/60 p-3 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={searchCacheStats.enabled ? "secondary" : "outline"}>
                      {searchCacheStats.enabled ? t("crossSeed.cacheEnabled") : t("crossSeed.cacheDisabled")}
                    </Badge>
                    <span>{t("crossSeed.cacheTtl", { n: searchCacheStats.ttlMinutes })}</span>
                    <span>{searchCacheStats.entries} {t("crossSeed.cachedSearches")}</span>
                    <span>{t("crossSeed.lastUsed")} {formatCacheTimestamp(searchCacheStats.lastUsedAt)}</span>
                    <Button variant="link" size="xs" className="px-0 ml-auto" asChild>
                      <Link to="/settings" search={{ tab: "search-cache" }}>
                        {t("crossSeed.manageCacheSettings")}
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button
                onClick={handleSaveGlobal}
                disabled={patchSettingsMutation.isPending}
              >
                {patchSettingsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("crossSeed.saveGlobalSettings")}
              </Button>
            </CardFooter>
          </Card>

        </TabsContent>

        <TabsContent value="dir-scan" className="space-y-6">
          <DirScanTab instances={instances ?? []} />
        </TabsContent>
        <TabsContent value="blocklist" className="space-y-6">
          <BlocklistTab instances={instances ?? []} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={showCancelAutomationDialog} onOpenChange={setShowCancelAutomationDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("crossSeed.cancelRssRun")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("crossSeed.cancelRssRunDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("crossSeed.keepRunning")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelAutomationRunMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("crossSeed.cancelRun")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
