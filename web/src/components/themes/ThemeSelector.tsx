/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { themes, type Theme } from "@/config/themes"
import { useCustomThemes } from "@/hooks/useCustomThemes"
import { useTheme } from "@/hooks/useTheme"
import { getThemeColors, getThemeVariation } from "@/utils/theme"
import { Check, Palette, AlertTriangle, FolderOpen, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"

interface ThemeCardProps {
  theme: Theme
  isSelected: boolean
  onSelect: () => void
  onVariationSelect: (themeId: string, variationId: string) => void
}

function ThemeCard({ theme, isSelected, onSelect, onVariationSelect }: ThemeCardProps) {
  const { t } = useTranslation("settings")
  // Get current variation for theme (validated)
  const variation = getThemeVariation(theme.id)

  // Helper to extract colors from theme
  const colors = getThemeColors(theme)

  return (
    <Card
      className={`cursor-pointer transition-all duration-200 hover:shadow-md h-full ${
        isSelected ? "ring-2 ring-primary" : ""
      }`}
      onClick={onSelect}
    >
      <CardHeader className="pb-2 sm:pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm sm:text-base flex items-center gap-1 sm:gap-2">
            {theme.name}
            {isSelected && (
              <Check className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
            )}
          </CardTitle>
        </div>
        {theme.description && (
          <CardDescription className="text-xs line-clamp-2">
            {theme.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-2 sm:space-y-3">
        {/* Theme preview colors and variations */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Preview colors */}
          <div className="flex gap-1">
            <div
              className="w-3 h-3 sm:w-4 sm:h-4 rounded-full ring-1 ring-black/10 dark:ring-white/10"
              style={{
                backgroundColor: colors.primary,
                backgroundImage: "none",
                background: colors.primary + " !important",
              }}
            />
            <div
              className="w-3 h-3 sm:w-4 sm:h-4 rounded-full ring-1 ring-black/10 dark:ring-white/10"
              style={{
                backgroundColor: colors.secondary,
                backgroundImage: "none",
                background: colors.secondary + " !important",
              }}
            />
            <div
              className="w-3 h-3 sm:w-4 sm:h-4 rounded-full ring-1 ring-black/10 dark:ring-white/10"
              style={{
                backgroundColor: colors.accent,
                backgroundImage: "none",
                background: colors.accent + " !important",
              }}
            />
          </div>

          {/* Variation colors */}
          {colors.variations && colors.variations.length > 0 && (
            <div className="flex gap-1">
              {colors.variations.map((v) => {
                const selected = variation === v.id
                return (
                  <button
                    key={v.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      onVariationSelect(theme.id, v.id)
                    }}
                    className={`w-3 h-3 sm:w-4 sm:h-4 rounded-full transition-all ${
                      selected ? "ring-2 ring-black dark:ring-white" : "ring-1 ring-black/10 dark:ring-white/10"
                    }`}
                    style={{
                      backgroundColor: v.color,
                      backgroundImage: "none",
                      background: v.color + " !important",
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1 sm:gap-2">
          {theme.isCustom && (
            <Badge variant="secondary" className="text-xs px-1.5 sm:px-2">
              <FolderOpen className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
              {t("themes.custom.badge")}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function ThemeSelector() {
  const { t } = useTranslation("settings")
  const { theme: currentTheme, setTheme, setVariation } = useTheme()
  const {
    customThemes,
    errors: customThemeErrors,
    directory: customThemesDirectory,
    isFetching: customThemesFetching,
    isError: customThemesError,
    refetch: refetchCustomThemes,
  } = useCustomThemes()

  const handleThemeSelect = (themeId: string) => {
    setTheme(themeId)
  }

  const handleVariationSelect = (themeId: string, variationId: string) => {
    setTheme(themeId)
    setVariation(variationId)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          {t("themes.selector.title")}
        </CardTitle>
        <CardDescription>
          {t("themes.selector.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* All Themes */}
        <div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
            {themes.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                isSelected={currentTheme === theme.id}
                onSelect={() => handleThemeSelect(theme.id)}
                onVariationSelect={handleVariationSelect}
              />
            ))}
          </div>
        </div>

        <Separator />

        {/* Custom Themes */}
        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              <FolderOpen className="h-3 w-3 mr-1" />
              {t("themes.custom.badge")}
            </Badge>
            {t("themes.custom.title")}
          </h4>

          <div className="space-y-3">
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">{t("themes.custom.directoryLabel")}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchCustomThemes()}
                  disabled={customThemesFetching}
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${customThemesFetching ? "animate-spin" : ""}`} />
                  {t("themes.custom.refresh")}
                </Button>
              </div>
              {customThemesDirectory && (
                <code className="block text-xs bg-muted px-2 py-1 rounded break-all">
                  {customThemesDirectory}
                </code>
              )}
              {customThemesError ? (
                <p className="text-xs font-medium text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {t("themes.custom.loadError")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("themes.custom.detectedCount", { total: customThemes.length })}
                </p>
              )}
              {customThemeErrors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {t("themes.custom.parseErrorsTitle")}
                  </p>
                  <ul className="text-xs text-destructive space-y-0.5 list-disc list-inside">
                    {customThemeErrors.map((error) => (
                      <li key={error.filename}>{error.filename}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {customThemes.length === 0 ? (
              !customThemesFetching && !customThemesError && (
                <p className="text-sm text-muted-foreground">{t("themes.custom.noneFound")}</p>
              )
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
                {customThemes.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    isSelected={currentTheme === theme.id}
                    onSelect={() => handleThemeSelect(theme.id)}
                    onVariationSelect={handleVariationSelect}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
