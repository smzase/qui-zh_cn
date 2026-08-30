/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import type { CrossInstanceTorrent, InstanceResponse, Torrent } from "@/types"

export interface TorrentTargetCapabilityOptions {
  torrents?: Torrent[]
  fallbackInstanceId: number
  instanceIds?: number[]
  isAllSelected?: boolean
  isAllInstancesView?: boolean
  instances?: InstanceResponse[]
}

export interface TorrentTargetCapabilities {
  targetInstanceIds: number[]
  hasTransmission: boolean
  hasUnknown: boolean
  supportsQbittorrentOnlyActions: boolean
}

function torrentInstanceId(torrent: Torrent, fallbackInstanceId: number): number {
  const instanceId = (torrent as Partial<CrossInstanceTorrent>).instanceId
  return typeof instanceId === "number" && instanceId > 0 ? instanceId : fallbackInstanceId
}

/**
 * Resolves the client types represented by a selection. Unknown instance
 * metadata is treated conservatively so qBittorrent-only controls are not
 * offered while the instance list is still loading.
 */
export function resolveTorrentTargetCapabilities({
  torrents = [],
  fallbackInstanceId,
  instanceIds,
  isAllSelected = false,
  isAllInstancesView = fallbackInstanceId <= 0,
  instances,
}: TorrentTargetCapabilityOptions): TorrentTargetCapabilities {
  const targetIds = new Set<number>()

  for (const torrent of torrents) {
    const instanceId = torrentInstanceId(torrent, fallbackInstanceId)
    if (instanceId > 0) {
      targetIds.add(instanceId)
    }
  }

  if (isAllSelected && isAllInstancesView) {
    if (instanceIds && instanceIds.length > 0) {
      instanceIds.forEach(id => {
        if (id > 0) targetIds.add(id)
      })
    } else {
      // An empty instanceIds value means the complete active-instance scope.
      instances?.forEach(instance => {
        if (instance.isActive && instance.id > 0) targetIds.add(instance.id)
      })
    }
  }

  if (targetIds.size === 0 && fallbackInstanceId > 0) {
    targetIds.add(fallbackInstanceId)
  }

  const knownInstances = new Map((instances ?? []).map(instance => [instance.id, instance]))
  const targetInstanceIds = Array.from(targetIds).sort((left, right) => left - right)
  const hasUnknown = targetInstanceIds.length === 0 || targetInstanceIds.some(id => !knownInstances.has(id))
  const hasTransmission = targetInstanceIds.some(id => knownInstances.get(id)?.clientType === "transmission")

  return {
    targetInstanceIds,
    hasTransmission,
    hasUnknown,
    supportsQbittorrentOnlyActions: !hasTransmission && !hasUnknown,
  }
}
