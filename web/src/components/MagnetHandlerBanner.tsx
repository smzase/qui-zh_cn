/*
 * Copyright (c) 2025, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Link2 } from "lucide-react"
import { toast } from "sonner"
import {
  canRegisterProtocolHandler,
  dismissProtocolHandlerBanner,
  getMagnetHandlerRegistrationGuidance,
  isProtocolHandlerBannerDismissed,
  registerMagnetHandler,
} from "@/lib/protocol-handler"

export function MagnetHandlerBanner() {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(() => isProtocolHandlerBannerDismissed())

  // Don't show if browser doesn't support registerProtocolHandler or not HTTPS
  if (!canRegisterProtocolHandler()) {
    return null
  }

  // Don't show if user has dismissed
  if (dismissed) {
    return null
  }

  const handleRegister = () => {
    const success = registerMagnetHandler()
    if (success) {
      toast.success(t("magnetHandler.registered"), {
        description: getMagnetHandlerRegistrationGuidance(),
      })
      dismissProtocolHandlerBanner()
      setDismissed(true)
    } else {
      toast.error(t("magnetHandler.registerFailed"))
    }
  }

  const handleDismiss = () => {
    dismissProtocolHandlerBanner()
    setDismissed(true)
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-4 rounded-md bg-blue-500/10 border border-blue-500/20 px-4 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-blue-500" />
        <span>{t("magnetHandler.registerBanner")}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleRegister}>
          {t("common.register")}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDismiss}>
          {t("common.dismiss")}
        </Button>
      </div>
    </div>
  )
}
