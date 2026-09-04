/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { navigateAfterAuth } from "@/lib/add-intent"
import { APIError, api } from "@/lib/api"
import { removeSavedSwitchUser, saveSwitchUser, type SavedSwitchUser } from "@/lib/saved-switch-users"
import type { User } from "@/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

export function useAuth() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: user, isLoading, error } = useQuery({
    queryKey: ["auth", "user"],
    queryFn: () => api.checkAuth(),
    retry: false,
    staleTime: Infinity,
  })

  const loginMutation = useMutation({
    mutationFn: ({ username, password, rememberMe = false }: { username: string; password: string; rememberMe?: boolean }) =>
      api.login(username, password, rememberMe),
    onSuccess: async (data, variables) => {
      const currentUser = await api.checkAuth()
      const authenticatedUser = currentUser ?? data.user
      saveSwitchUser(authenticatedUser, variables.password)
      queryClient.setQueryData(["auth", "user"], authenticatedUser)
      // Refetch the theme catalog now that the session can unlock the full
      // premium CSS: the pre-login fetch only carried the selected theme.
      queryClient.invalidateQueries({ queryKey: ["builtin-themes"] })
      navigateAfterAuth(navigate)
    },
  })

  const setupMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      api.setup(username, password),
    onSuccess: async (data, variables) => {
      const currentUser = await api.checkAuth()
      const authenticatedUser = currentUser ?? data.user
      saveSwitchUser(authenticatedUser, variables.password)
      queryClient.setQueryData(["auth", "user"], authenticatedUser)
      queryClient.invalidateQueries({ queryKey: ["builtin-themes"] })
      navigateAfterAuth(navigate)
    },
  })

  const switchUserMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      api.addSwitchUser(username, password, true),
    onSuccess: async (data, variables) => {
      const currentUser = await api.checkAuth()
      const authenticatedUser = currentUser ?? data
      saveSwitchUser(authenticatedUser, variables.password)
      queryClient.clear()
      queryClient.setQueryData(["auth", "user"], authenticatedUser)
      navigate({ to: "/dashboard" })
    },
  })

  const switchSavedUserMutation = useMutation({
    mutationFn: (savedUser: SavedSwitchUser) =>
      api.addSwitchUser(savedUser.username, savedUser.password, true),
    onError: (error, savedUser) => {
      // A changed password invalidates the local record. The switcher will
      // prompt for the credentials again on the next selection.
      if (error instanceof APIError && error.status === 401) {
        removeSavedSwitchUser(savedUser.id)
      }
    },
    onSuccess: async (data, savedUser) => {
      const currentUser = await api.checkAuth()
      const authenticatedUser = currentUser ?? data
      saveSwitchUser(authenticatedUser, savedUser.password)
      queryClient.clear()
      queryClient.setQueryData(["auth", "user"], authenticatedUser)
      navigate({ to: "/dashboard" })
    },
  })

  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.setQueryData(["auth", "user"], null)
      queryClient.clear()
      navigate({ to: "/login" })
    },
  })

  const setIsAuthenticated = (authenticated: boolean) => {
    if (authenticated) {
      // Force refetch of user data
      queryClient.invalidateQueries({ queryKey: ["auth", "user"] })
    } else {
      queryClient.setQueryData(["auth", "user"], null)
    }
  }

  return {
    user: user as User | undefined,
    isAuthenticated: !!user,
    isLoading,
    error,
    login: loginMutation.mutate,
    setup: setupMutation.mutate,
    logout: logoutMutation.mutate,
    switchUser: switchUserMutation.mutate,
    switchUserAsync: switchUserMutation.mutateAsync,
    switchSavedUserAsync: switchSavedUserMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    isSettingUp: setupMutation.isPending,
    isSwitchingUser: switchUserMutation.isPending || switchSavedUserMutation.isPending,
    loginError: loginMutation.error,
    setupError: setupMutation.error,
    setIsAuthenticated,
  }
}
