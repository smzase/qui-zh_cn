import { api } from "@/lib/api"
import type { ManagedUser } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

export function UsersManager() {
  const { t } = useTranslation("settings")
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const users = useQuery({ queryKey: ["managed-users"], queryFn: api.listUsers })
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const create = useMutation({
    mutationFn: () => api.createUser(username, password),
    onSuccess: () => { setUsername(""); setPassword(""); void queryClient.invalidateQueries({ queryKey: ["managed-users"] }); toast.success(t("users.created")) },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("users.createFailed")),
  })
  const role = useMutation({
    mutationFn: ({ id, value }: { id: number; value: ManagedUser["role"] }) => api.updateUserRole(id, value),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["managed-users"] }); toast.success(t("users.roleUpdated")) },
  })
  if (user?.role !== "admin") return <p className="text-sm text-muted-foreground">{t("users.adminOnly")}</p>

  return (
    <div className="space-y-6">
      <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
        <div className="space-y-2"><Label htmlFor="new-user-name">{t("users.username")}</Label><Input id="new-user-name" value={username} onChange={(event) => setUsername(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="new-user-password">{t("users.password")}</Label><Input id="new-user-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        <Button type="submit" disabled={create.isPending || !username || !password}>{t("users.create")}</Button>
      </form>
      <div className="divide-y rounded-md border">
        {(users.data ?? []).map((account) => (
          <div key={account.id} className="flex items-center justify-between gap-4 p-3">
            <span className="font-medium">{account.username}</span>
            <Select value={account.role} onValueChange={(value) => role.mutate({ id: account.id, value: value as ManagedUser["role"] })}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="admin">{t("users.admin")}</SelectItem><SelectItem value="user">{t("users.user")}</SelectItem></SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  )
}
