/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import React from "react"
import { useForm } from "@tanstack/react-form"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useInstancePreferences } from "@/hooks/useInstancePreferences"
import { toast } from "sonner"
import { NumberInputWithUnlimited } from "@/components/forms/NumberInputWithUnlimited"
import { useTranslation } from "react-i18next"

import { PreferencesFormShell } from "./PreferencesFormShell"


function SwitchSetting({
  label,
  checked,
  onCheckedChange,
  description,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  description?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  )
}

interface SeedingLimitsFormProps {
  instanceId: number
  onSuccess?: () => void
}

export function SeedingLimitsForm({ instanceId, onSuccess }: SeedingLimitsFormProps) {
  const { t } = useTranslation()
  const { preferences, isLoading, updatePreferences, isUpdating } = useInstancePreferences(instanceId)

  const form = useForm({
    defaultValues: {
      max_ratio_enabled: false,
      max_ratio: 0,
      max_seeding_time_enabled: false,
      max_seeding_time: 0,
    },
    onSubmit: async ({ value }) => {
      try {
        updatePreferences(value)
        toast.success(t("instances.seedingLimitsUpdated"))
        onSuccess?.()
      } catch {
        toast.error(t("instances.seedingLimitsUpdateFailed"))
      }
    },
  })

  // Update form when preferences change
  React.useEffect(() => {
    if (preferences) {
      form.setFieldValue("max_ratio_enabled", preferences.max_ratio_enabled)
      form.setFieldValue("max_ratio", preferences.max_ratio)
      form.setFieldValue("max_seeding_time_enabled", preferences.max_seeding_time_enabled)
      form.setFieldValue("max_seeding_time", preferences.max_seeding_time)
    }
  }, [preferences, form])

  if (isLoading) {
    return (
      <div className="text-center py-8" role="status" aria-live="polite">
        <p className="text-sm text-muted-foreground">{t("instances.loadingSeedingLimits")}</p>
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
          <form.Field name="max_ratio_enabled">
            {(field) => (
              <SwitchSetting
                label={t("instances.enableShareRatioLimit")}
                checked={(field.state.value as boolean) ?? false}
                onCheckedChange={field.handleChange}
                description={t("instances.enableShareRatioLimitDesc")}
              />
            )}
          </form.Field>

          <form.Field name="max_ratio_enabled">
            {(enabledField) => (
              <form.Field name="max_ratio">
                {(field) => (
                  <NumberInputWithUnlimited
                    label={t("instances.maximumShareRatio")}
                    value={(field.state.value as number) ?? 2.0}
                    onChange={field.handleChange}
                    min={-1}
                    max={10}
                    step="0.05"
                    description={t("instances.maximumShareRatioDesc")}
                    allowUnlimited={true}
                    disabled={!(enabledField.state.value as boolean)}
                  />
                )}
              </form.Field>
            )}
          </form.Field>

          <form.Field name="max_seeding_time_enabled">
            {(field) => (
              <SwitchSetting
                label={t("instances.enableSeedingTimeLimit")}
                checked={(field.state.value as boolean) ?? false}
                onCheckedChange={field.handleChange}
                description={t("instances.enableSeedingTimeLimitDesc")}
              />
            )}
          </form.Field>

          <form.Field name="max_seeding_time_enabled">
            {(enabledField) => (
              <form.Field name="max_seeding_time">
                {(field) => (
                  <NumberInputWithUnlimited
                    label={t("instances.maximumSeedingTime")}
                    value={(field.state.value as number) ?? 1440}
                    onChange={field.handleChange}
                    min={-1}
                    max={525600}
                    description={t("instances.maximumSeedingTimeDesc")}
                    allowUnlimited={true}
                    disabled={!(enabledField.state.value as boolean)}
                  />
                )}
              </form.Field>
            )}
          </form.Field>
        </div>
      </div>
    </PreferencesFormShell>
  )
}
