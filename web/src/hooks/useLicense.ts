/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

// All themes are free in this fork — no license checks or API calls.
// These hooks are kept as no-ops for backward compatibility with any code
// that still imports them.

export const usePremiumAccess = () => ({
  data: { hasPremiumAccess: true },
  isLoading: false,
  isError: false,
  error: null,
  refetch: () => Promise.resolve({ hasPremiumAccess: true }),
})

export const useHasPremiumAccess = () => ({
  hasPremiumAccess: true,
  isLoading: false,
  isError: false,
})
