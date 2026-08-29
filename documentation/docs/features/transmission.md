---
sidebar_position: 3.5
title: Transmission Support
description: Manage Transmission daemons alongside qBittorrent instances in qui.
---

# Transmission Support

qui can manage Transmission daemons in addition to qBittorrent instances. Transmission instances appear in the sidebar below the qBittorrent ones, separated by a single divider, and support the same torrent management surface: listing, filtering, sorting, live streaming updates, adding (file, URL, and magnet), pausing, resuming, rechecking, reannouncing, deleting, renaming, moving, queue priority, per-torrent speed and share limits, file selection, tracker editing, and category assignment.

## How it works

qui talks to Transmission through its RPC interface (the same one `transmission-remote` uses) and translates it to the internal data model. The URL points at the daemon itself, for example `http://localhost:9091`; hosts behind a reverse proxy path work too, as long as `/transmission/rpc` resolves under that path.

Authentication uses the daemon's RPC credentials (`rpc-username` and `rpc-password` in `settings.json`). If the daemon has `rpc-authentication-required` disabled, choose **None**.

## Daemon preferences

The instance preferences dialog shows a Transmission-specific **Daemon Preferences** tab instead of the qBittorrent preference tabs. It mirrors the daemon's own four groups:

- **Torrents**: download directory, temporary folder, start when added, appending `.part` to incomplete files, download queue size, and the stop-seeding ratio/idle limits.
- **Speed**: upload/download limits, alternative speed limits, and their scheduled times.
- **Peers**: per-torrent and global peer limits, encryption mode, PEX/DHT/LPD, and the blocklist (including a manual update button).
- **Network**: the peer listening port, port randomization, router port forwarding, uTP, and the default public trackers list.

Only the fields the daemon reports are shown, so version-specific options hide themselves automatically.

Feature availability follows what Transmission exposes, so qui hides or rejects what has no equivalent:

- **Categories** map to Transmission labels. The first label of a torrent becomes its category; additional labels surface as tags. Categories created in qui are remembered until the client restarts unless a torrent uses them, because Transmission only knows labels that are assigned to torrents.
- **Tags** cannot be created or assigned on Transmission; qBittorrent-only tag features are disabled.
- **Torrent creation** and **torrent file export** are not available.
- **Sequential download**, **first/last piece priority**, **super seeding**, **force start**, and **auto TMM** have no Transmission equivalent; actions that need them fail with a clear error or are ignored where harmless.
- **Web seeds** and the **piece map** return empty data.
- **qBittorrent RSS** is not available for Transmission instances; qui's own RSS and automation features that fetch from indexers directly still work.
- Share limits map to ratio and idle-seeding limits; Transmission has no active seeding-time limit.

## Mixed setups

Both client types can coexist:

- The sidebar groups Transmission instances below qBittorrent instances, with a divider between the groups. The divider only appears when at least one Transmission instance is active.
- The unified "all instances" view spans both client types.
- Cross-seed, automations, reannounce, and other per-instance features treat both client types the same, subject to the capability notes above.
