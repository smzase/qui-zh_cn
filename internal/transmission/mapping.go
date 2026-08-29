// Copyright (c) 2025-2026, s0oup and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package transmission

import (
	"net/url"
	"strings"
)

// qbitTorrent mirrors the JSON shape of a qBittorrent API torrent object
// (go-qbittorrent domain.Torrent). The bridge emits these in sync/maindata,
// torrents/info and friends so qui's entire qBittorrent pipeline keeps
// working against a Transmission daemon.
type qbitTorrent struct {
	AddedOn                  int64   `json:"added_on"`
	AmountLeft               int64   `json:"amount_left"`
	AutoManaged              bool    `json:"auto_tmm"`
	Availability             float64 `json:"availability"`
	Category                 string  `json:"category"`
	Comment                  string  `json:"comment"`
	Completed                int64   `json:"completed"`
	CompletionOn             int64   `json:"completion_on"`
	CreatedBy                string  `json:"created_by"`
	ContentPath              string  `json:"content_path"`
	DlLimit                  int64   `json:"dl_limit"`
	DlSpeed                  int64   `json:"dlspeed"`
	DownloadPath             string  `json:"download_path"`
	Downloaded               int64   `json:"downloaded"`
	DownloadedSession        int64   `json:"downloaded_session"`
	ETA                      int64   `json:"eta"`
	FirstLastPiecePrio       bool    `json:"f_l_piece_prio"`
	ForceStart               bool    `json:"force_start"`
	Hash                     string  `json:"hash"`
	InfohashV1               string  `json:"infohash_v1"`
	InfohashV2               string  `json:"infohash_v2"`
	Popularity               float64 `json:"popularity"`
	Private                  bool    `json:"private"`
	LastActivity             int64   `json:"last_activity"`
	MagnetURI                string  `json:"magnet_uri"`
	MaxRatio                 float64 `json:"max_ratio"`
	MaxSeedingTime           int64   `json:"max_seeding_time"`
	MaxInactiveSeedingTime   int64   `json:"max_inactive_seeding_time"`
	Name                     string  `json:"name"`
	NumComplete              int64   `json:"num_complete"`
	NumIncomplete            int64   `json:"num_incomplete"`
	NumLeechs                int64   `json:"num_leechs"`
	NumSeeds                 int64   `json:"num_seeds"`
	Priority                 int64   `json:"priority"`
	Progress                 float64 `json:"progress"`
	Ratio                    float64 `json:"ratio"`
	RatioLimit               float64 `json:"ratio_limit"`
	Reannounce               int64   `json:"reannounce"`
	SavePath                 string  `json:"save_path"`
	SeedingTime              int64   `json:"seeding_time"`
	SeedingTimeLimit         int64   `json:"seeding_time_limit"`
	InactiveSeedingTimeLimit int64   `json:"inactive_seeding_time_limit"`
	ShareLimitAction         string  `json:"share_limit_action"`
	ShareLimitsMode          string  `json:"share_limits_mode"`
	SeenComplete             int64   `json:"seen_complete"`
	SequentialDownload       bool    `json:"seq_dl"`
	Size                     int64   `json:"size"`
	State                    string  `json:"state"`
	SuperSeeding             bool    `json:"super_seeding"`
	Tags                     string  `json:"tags"`
	TimeActive               int64   `json:"time_active"`
	TotalSize                int64   `json:"total_size"`
	Tracker                  string  `json:"tracker"`
	TrackersCount            int64   `json:"trackers_count"`
	UpLimit                  int64   `json:"up_limit"`
	Uploaded                 int64   `json:"uploaded"`
	UploadedSession          int64   `json:"uploaded_session"`
	UpSpeed                  int64   `json:"upspeed"`
}

// qbitTorrentFrom maps one Transmission torrent to the qBittorrent shape.
// seedRatioLimit modes: 0 = use global limit, 1 = use torrent limit, 2 = unlimited.
func qbitTorrentFrom(t *torrent) qbitTorrent {
	hash := strings.ToLower(t.HashString)

	category, tags := splitLabels(t.Labels)

	qt := qbitTorrent{
		AddedOn:      t.AddedDate,
		AmountLeft:   t.LeftUntilDone,
		Availability: -1,
		Category:     category,
		Comment:      t.Comment,
		CreatedBy:    t.Creator,
		ContentPath:  joinPath(t.DownloadDir, t.Name),
		DlLimit:      limitBytes(t.DownloadLimited, t.DownloadLimit),
		DlSpeed:      t.RateDownload,
		DownloadPath: "",
		Downloaded:   t.DownloadedEver,
		ETA:          mapEta(t.Eta),
		Hash:         hash,
		InfohashV1:   hash,
		InfohashV2:   "",
		LastActivity: t.ActivityDate,
		MagnetURI:    t.MagnetLink,
		Name:         t.Name,
		NumLeechs:    t.PeersGettingFromUs,
		NumSeeds:     t.PeersSendingToUs,
		Priority:     t.QueuePosition,
		Progress:     t.PercentDone,
		Ratio:        t.Ratio,
		SavePath:     t.DownloadDir,
		SeedingTime:  t.SecondsSeeding,
		SeenComplete: t.DoneDate,
		Size:         t.TotalSize,
		State:        mapState(t),
		Tags:         strings.Join(tags, ", "),
		TimeActive:   t.SecondsDownloading + t.SecondsSeeding,
		TotalSize:    t.SizeWhenDone,
		UpLimit:      limitBytes(t.UploadLimited, t.UploadLimit),
		UpSpeed:      t.RateUpload,
		Uploaded:     t.UploadedEver,
	}

	if t.DoneDate > 0 {
		qt.CompletionOn = t.DoneDate
		qt.Completed = t.DoneDate
		qt.SeenComplete = t.DoneDate
	} else {
		qt.CompletionOn = 0
		qt.Completed = 0
		qt.SeenComplete = 0
	}

	// Transmission has no active seeding-time limit; -2 keeps the
	// qBittorrent "use global" convention.
	qt.SeedingTimeLimit = -2

	switch t.SeedRatioMode {
	case 1:
		qt.RatioLimit = t.SeedRatioLimit
		qt.MaxRatio = t.SeedRatioLimit
	case 2:
		qt.RatioLimit = -1
		qt.MaxRatio = -1
	default:
		qt.RatioLimit = -2
		qt.MaxRatio = -2
	}

	switch t.SeedIdleMode {
	case 1:
		qt.InactiveSeedingTimeLimit = t.SeedIdleLimit
	case 2:
		qt.InactiveSeedingTimeLimit = -1
	default:
		qt.InactiveSeedingTimeLimit = -2
	}

	qt.Private = t.IsPrivate
	qt.Popularity = 0

	// Swarm totals from the healthiest tracker stat; current tracker is the
	// first announce URL that is not disabled.
	if len(t.TrackerStats) > 0 {
		for i := range t.TrackerStats {
			ts := &t.TrackerStats[i]
			if ts.SeederCount > qt.NumComplete {
				qt.NumComplete = ts.SeederCount
			}
			if ts.LeecherCount > qt.NumIncomplete {
				qt.NumIncomplete = ts.LeecherCount
			}
		}
		qt.Reannounce = 0
		qt.TrackersCount = int64(len(t.TrackerStats))
		for i := range t.TrackerStats {
			if t.TrackerStats[i].AnnounceState != 0 && t.TrackerStats[i].Announce != "" {
				qt.Tracker = t.TrackerStats[i].Announce
				break
			}
		}
		if qt.Tracker == "" && t.TrackerStats[0].Announce != "" {
			qt.Tracker = t.TrackerStats[0].Announce
		}
	} else if len(t.Trackers) > 0 {
		qt.TrackersCount = int64(len(t.Trackers))
		qt.Tracker = t.Trackers[0].Announce
	}

	return qt
}

// splitLabels maps Transmission labels onto qBittorrent's category + tags:
// the first label becomes the category, the remaining ones become tags.
func splitLabels(labels []string) (category string, tags []string) {
	var nonEmpty []string
	for _, l := range labels {
		if l != "" {
			nonEmpty = append(nonEmpty, l)
		}
	}
	if len(nonEmpty) == 0 {
		return "", nil
	}
	return nonEmpty[0], nonEmpty[1:]
}

// limitBytes converts a Transmission KB/s limit to the qBittorrent bytes/s
// convention; a disabled limit is 0 (unlimited in qBittorrent terms).
func limitBytes(limited bool, limitKBps int64) int64 {
	if limited && limitKBps > 0 {
		return limitKBps * 1024
	}
	return 0
}

// mapEta converts Transmission's eta (-1 unknown, -2 incomplete) to the
// qBittorrent convention where 8640000 means "not computable".
func mapEta(eta int64) int64 {
	switch {
	case eta >= 0:
		return eta
	default:
		return 8640000
	}
}

// mapState maps Transmission's status enum (0 stopped .. 6 seeding) plus the
// error flags onto qBittorrent torrent states.
func mapState(t *torrent) string {
	switch t.Status {
	case 1, 2: // check pending, checking
		if t.PercentDone >= 1 {
			return "checkingUP"
		}
		return "checkingDL"
	case 3:
		return "queuedDL"
	case 4:
		if t.MetadataPercentDone < 1 {
			return "metaDL"
		}
		if t.RateDownload <= 0 {
			return "stalledDL"
		}
		return "downloading"
	case 5:
		return "queuedUP"
	case 6:
		if t.RateUpload <= 0 {
			return "stalledUP"
		}
		return "uploading"
	default: // 0 stopped
		if t.Error == 3 {
			// local error, e.g. missing data
			return "error"
		}
		if t.PercentDone >= 1 {
			return "stoppedUP"
		}
		return "stoppedDL"
	}
}

// joinPath appends name to a download dir without inventing separators.
func joinPath(dir, name string) string {
	if dir == "" {
		return name
	}
	return strings.TrimRight(dir, "/") + "/" + name
}

// trackerDomain extracts a display domain from an announce URL, matching
// qBittorrent's maindata trackers map (domain -> hashes).
func trackerDomain(announceURL string) string {
	u, err := url.Parse(announceURL)
	if err != nil || u.Host == "" {
		return ""
	}
	return u.Host
}
