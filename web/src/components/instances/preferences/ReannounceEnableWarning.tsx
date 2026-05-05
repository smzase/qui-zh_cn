/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertTriangle } from "lucide-react"
import { useTranslation } from "react-i18next"

export function ReannounceEnableWarningAlert() {
  const { t } = useTranslation()
  return (
    <Alert variant="warning" className="border-yellow-500/40 bg-yellow-500/10 text-yellow-950 dark:text-yellow-100">
      <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
      <AlertTitle>{t("reannounce.warningTitle")}</AlertTitle>
      <AlertDescription className="space-y-1">
        <p>{t("reannounce.warningDesc1")}</p>
        <p>{t("reannounce.warningDesc2")}</p>
      </AlertDescription>
    </Alert>
  )
}

interface ReannounceEnableWarningDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  confirming?: boolean
}

export function ReannounceEnableWarningDialog({
  open,
  onOpenChange,
  onConfirm,
  confirming = false,
}: ReannounceEnableWarningDialogProps) {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("reannounce.enableConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>{t("reannounce.enableConfirmDesc1")}</p>
              <p>{t("reannounce.enableConfirmDesc2")}</p>
              <p>{t("reannounce.enableConfirmDesc3")}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirming}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={confirming}>
            {confirming ? t("reannounce.enabling") : t("reannounce.enable")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
