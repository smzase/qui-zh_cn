/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

// Translation keys for qBittorrent torrent states
const TORRENT_STATE_KEYS: Record<string, string> = {
  // Downloading related
  downloading: "torrents.downloading",
  metaDL: "torrents.fetchingMetadata",
  allocating: "torrents.allocating",
  stalledDL: "torrents.stalledDown",
  queuedDL: "torrents.queued",
  checkingDL: "torrents.checking",
  forcedDL: "torrents.forcedDownloading",

  // Uploading / Seeding related
  uploading: "torrents.seeding",
  stalledUP: "torrents.stalledUp",
  queuedUP: "torrents.queued",
  checkingUP: "torrents.checking",
  forcedUP: "torrents.forcedSeeding",

  // Paused / Stopped
  pausedDL: "torrents.paused",
  pausedUP: "torrents.completed",
  stoppedDL: "torrents.stopped",
  stoppedUP: "torrents.completed",

  // Other
  error: "torrents.errored",
  missingFiles: "torrents.missingFiles",
  checkingResumeData: "torrents.checkingResumeData",
  moving: "torrents.moving",
}

// Fallback labels for when translation is not available
const TORRENT_STATE_LABELS: Record<string, string> = {
  downloading: "Downloading",
  metaDL: "Fetching Metadata",
  allocating: "Allocating",
  stalledDL: "Stalled",
  queuedDL: "Queued",
  checkingDL: "Checking",
  forcedDL: "(F) Downloading",
  uploading: "Seeding",
  stalledUP: "Seeding",
  queuedUP: "Queued",
  checkingUP: "Checking",
  forcedUP: "(F) Seeding",
  pausedDL: "Paused",
  pausedUP: "Completed",
  stoppedDL: "Stopped",
  stoppedUP: "Completed",
  error: "Error",
  missingFiles: "Missing Files",
  checkingResumeData: "Checking Resume Data",
  moving: "Moving",
}

export function getStateLabel(state: string): string {
  return TORRENT_STATE_LABELS[state] ?? state
}

export function getStateTranslationKey(state: string): string {
  return TORRENT_STATE_KEYS[state] ?? state
}
