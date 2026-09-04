/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { MultiSelect, type Option } from "@/components/ui/multi-select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/hooks/useAuth"
import { useInstances } from "@/hooks/useInstances"
import { api } from "@/lib/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

interface ShareInstancesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShareInstancesDialog({ open, onOpenChange }: ShareInstancesDialogProps) {
  const { t } = useTranslation("instances")
  const { user } = useAuth()
  const { instances } = useInstances()
  const queryClient = useQueryClient()
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [instanceIds, setInstanceIds] = useState<string[]>([])
  const [userIds, setUserIds] = useState<string[]>([])
  const usersQuery = useQuery({
    queryKey: ["share-target-users"],
    queryFn: () => api.listShareTargetUsers(),
    enabled: open,
  })

  const selectedOwnerId = ownerId ?? String(user?.id ?? "")
  const ownerOptions = useMemo<Option[]>(() => (
    (usersQuery.data ?? []).map((account) => ({
      label: account.username,
      value: String(account.id),
    }))
  ), [usersQuery.data])
  const instanceOptions = useMemo<Option[]>(() => (
    (instances ?? [])
      .filter((instance) => instance.ownerId === Number(selectedOwnerId))
      .map((instance) => ({ label: instance.name, value: String(instance.id) }))
  ), [instances, selectedOwnerId])
  const recipientOptions = useMemo<Option[]>(() => (
    (usersQuery.data ?? [])
      .filter((account) => account.id !== Number(selectedOwnerId))
      .map((account) => ({ label: account.username, value: String(account.id) }))
  ), [selectedOwnerId, usersQuery.data])

  const shareMutation = useMutation({
    mutationFn: () => api.shareInstances(instanceIds.map(Number), userIds.map(Number)),
    onSuccess: () => {
      setUserIds([])
      void queryClient.invalidateQueries({ queryKey: ["instances"] })
      void queryClient.invalidateQueries({ queryKey: ["instance-shares"] })
      toast.success(t("sharing.shared"))
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("sharing.shareFailed")),
  })

  const handleOwnerChange = (value: string) => {
    setOwnerId(value)
    setInstanceIds([])
    setUserIds([])
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setInstanceIds([])
      setUserIds([])
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("sharing.batchTitle")}</DialogTitle>
          <DialogDescription>{t("sharing.batchDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="share-instance-owner">{t("sharing.instanceOwner")}</Label>
            <Select
              value={selectedOwnerId}
              onValueChange={handleOwnerChange}
              disabled={user?.role !== "admin" || usersQuery.isLoading}
            >
              <SelectTrigger id="share-instance-owner">
                <SelectValue placeholder={t("sharing.selectUser")} />
              </SelectTrigger>
              <SelectContent>
                {ownerOptions.map((account) => (
                  <SelectItem key={account.value} value={account.value}>{account.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("sharing.selectInstances")}</Label>
            <MultiSelect
              options={instanceOptions}
              selected={instanceIds}
              onChange={setInstanceIds}
              placeholder={t("sharing.selectInstances")}
              disabled={instanceOptions.length === 0}
              title={t("sharing.selectInstances")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("sharing.selectUsers")}</Label>
            <MultiSelect
              options={recipientOptions}
              selected={userIds}
              onChange={setUserIds}
              placeholder={t("sharing.selectUsers")}
              disabled={recipientOptions.length === 0}
              title={t("sharing.selectUsers")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            {t("sharing.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => shareMutation.mutate()}
            disabled={shareMutation.isPending || instanceIds.length === 0 || userIds.length === 0}
          >
            {shareMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("sharing.share")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
