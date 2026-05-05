/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import type { Category } from "@/types"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

interface CreateTagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instanceId: number
}

export function CreateTagDialog({ open, onOpenChange, instanceId }: CreateTagDialogProps) {
  const { t } = useTranslation()
  const [newTag, setNewTag] = useState("")
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (tags: string[]) => api.createTags(instanceId, tags),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["tags", instanceId] })
      queryClient.refetchQueries({ queryKey: ["instance-metadata", instanceId] })
      toast.success(t("tags.createSuccess"))
      setNewTag("")
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(t("tags.createFailed"), {
        description: error.message,
      })
    },
  })

  const handleCreate = () => {
    if (newTag.trim()) {
      mutation.mutate([newTag.trim()])
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("tags.createTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("tags.createDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4 space-y-2">
          <Label htmlFor="newTag">{t("tags.tagName")}</Label>
          <Input
            id="newTag"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder={t("tags.enterTagName")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCreate()
              }
            }}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setNewTag("")}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCreate}
            disabled={!newTag.trim() || mutation.isPending}
          >
            {t("common.create")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface DeleteTagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instanceId: number
  tag: string
}

export function DeleteTagDialog({ open, onOpenChange, instanceId, tag }: DeleteTagDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => api.deleteTags(instanceId, [tag]),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["tags", instanceId] })
      queryClient.refetchQueries({ queryKey: ["instance-metadata", instanceId] })
      toast.success(t("tags.deletedSuccess"))
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(t("tags.deleteFailed"), {
        description: error.message,
      })
    },
  })

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("tags.deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("tags.deleteDesc", { tag })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface CreateCategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instanceId: number
  parent?: string
}

export function CreateCategoryDialog({ open, onOpenChange, instanceId, parent }: CreateCategoryDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [savePath, setSavePath] = useState("")
  const queryClient = useQueryClient()

  useEffect(() => {
    if (open) {
      if (parent) {
        setName(parent + "/")
      } else {
        setName("")
      }
      setSavePath("")
    }
  }, [open, parent])

  const mutation = useMutation({
    mutationFn: ({ name, savePath }: { name: string; savePath?: string }) =>
      api.createCategory(instanceId, name, savePath),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["categories", instanceId] })
      queryClient.refetchQueries({ queryKey: ["instance-metadata", instanceId] })
      toast.success(t("categories.createSuccess"))
      setName("")
      setSavePath("")
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(t("categories.createFailed"), {
        description: error.message,
      })
    },
  })

  const handleCreate = () => {
    if (name.trim()) {
      mutation.mutate({ name: name.trim(), savePath: savePath.trim() || undefined })
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{parent ? t("categories.createSubTitle") : t("categories.createTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {parent ? t("categories.createSubDesc", { parent }) : t("categories.createDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="categoryName">{parent ? t("categories.subCategoryName") : t("categories.categoryName")}</Label>
            <Input
              id="categoryName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("categories.enterName")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="savePath">{t("categories.savePathOptional")}</Label>
            <Input
              id="savePath"
              value={savePath}
              onChange={(e) => setSavePath(e.target.value)}
              placeholder="e.g. /downloads/movies"
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCreate}
            disabled={!name.trim() || mutation.isPending}
          >
            {t("common.create")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface EditCategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instanceId: number
  category: Category
}

export function EditCategoryDialog({ open, onOpenChange, instanceId, category }: EditCategoryDialogProps) {
  const { t } = useTranslation()
  const [newSavePath, setNewSavePath] = useState("")
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (savePath: string) => api.editCategory(instanceId, category.name, savePath),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["categories", instanceId] })
      queryClient.refetchQueries({ queryKey: ["instance-metadata", instanceId] })
      toast.success(t("categories.updateSuccess"))
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(t("categories.updateFailed"), {
        description: error.message,
      })
    },
  })

  const handleSave = () => {
    mutation.mutate(newSavePath.trim())
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setNewSavePath("")
    }
    onOpenChange(isOpen)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("categories.editTitle", { name: category.name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("categories.editDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4 space-y-2">
          <Label htmlFor="oldSavePath">{t("categories.currentPath")}</Label>
          <Input
            id="oldSavePath"
            value={category.savePath || t("categories.noPathConfigured")}
            className={!category.savePath ? "text-muted-foreground italic" : ""}
            disabled={!category.savePath}
            readOnly
          />
          <Label htmlFor="editSavePath">{t("categories.newPath")}</Label>
          <Input
            id="editSavePath"
            value={newSavePath}
            onChange={(e) => setNewSavePath(e.target.value)}
            placeholder="e.g. /downloads/movies"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSave()
              }
            }}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSave}
            disabled={mutation.isPending}
          >
            {t("common.save")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface DeleteCategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instanceId: number
  categoryName: string
}

export function DeleteCategoryDialog({ open, onOpenChange, instanceId, categoryName }: DeleteCategoryDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => api.removeCategories(instanceId, [categoryName]),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["categories", instanceId] })
      queryClient.refetchQueries({ queryKey: ["instance-metadata", instanceId] })
      toast.success(t("categories.deletedSuccess"))
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(t("categories.deleteFailed"), {
        description: error.message,
      })
    },
  })

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("categories.deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("categories.deleteDesc", { name: categoryName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface DeleteEmptyCategoriesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instanceId: number
  categories: Record<string, Category>
  torrentCounts?: Record<string, number>
}

export function DeleteEmptyCategoriesDialog({
  open,
  onOpenChange,
  instanceId,
  categories,
  torrentCounts = {},
}: DeleteEmptyCategoriesDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const emptyCategories = Object.keys(categories).filter(categoryName => {
    const count = torrentCounts[`category:${categoryName}`] || 0
    return count === 0
  })

  const mutation = useMutation({
    mutationFn: () => api.removeCategories(instanceId, emptyCategories),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["categories", instanceId] })
      queryClient.refetchQueries({ queryKey: ["instance-metadata", instanceId] })
      toast.success(t("categories.removeEmptySuccess", { count: emptyCategories.length, suffix: emptyCategories.length === 1 ? "y" : "ies" }))
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(t("categories.removeEmptyFailed"), {
        description: error.message,
      })
    },
  })

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("categories.removeEmptyTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {emptyCategories.length === 0 ? (
              t("categories.removeEmptyDescNone")
            ) : (
              <>
                {t("categories.removeEmptyDesc", { count: emptyCategories.length, suffix: emptyCategories.length === 1 ? "y" : "ies" })}
                <div className="mt-3 max-h-40 overflow-y-auto">
                  <div className="text-sm space-y-1">
                    {emptyCategories.map(categoryName => (
                      <div key={categoryName} className="text-muted-foreground">
                        • {categoryName}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          {emptyCategories.length > 0 && (
            <AlertDialogAction
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("categories.removeEmptyButton", { count: emptyCategories.length, suffix: emptyCategories.length === 1 ? "y" : "ies" })}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface DeleteUnusedTagsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instanceId: number
  tags: string[]
  torrentCounts?: Record<string, number>
}

export function DeleteUnusedTagsDialog({
  open,
  onOpenChange,
  instanceId,
  tags,
  torrentCounts = {},
}: DeleteUnusedTagsDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const unusedTags = tags.filter(tag => {
    const count = torrentCounts[`tag:${tag}`] || 0
    return count === 0
  })

  const mutation = useMutation({
    mutationFn: () => api.deleteTags(instanceId, unusedTags),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["tags", instanceId] })
      queryClient.refetchQueries({ queryKey: ["instance-metadata", instanceId] })
      toast.success(t("tags.deleteUnusedSuccess", { count: unusedTags.length }))
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(t("tags.deleteUnusedFailed"), {
        description: error.message,
      })
    },
  })

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("tags.deleteUnusedTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {unusedTags.length === 0 ? (
              t("tags.deleteUnusedDescNone")
            ) : (
              <>
                {t("tags.deleteUnusedDesc", { count: unusedTags.length })}
                <div className="mt-3 max-h-40 overflow-y-auto">
                  <div className="text-sm space-y-1">
                    {unusedTags.map(tag => (
                      <div key={tag} className="text-muted-foreground">
                        • {tag}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          {unusedTags.length > 0 && (
            <AlertDialogAction
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("tags.deleteUnusedButton", { count: unusedTags.length })}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
