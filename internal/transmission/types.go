// Copyright (c) 2025-2026, s0oup and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package transmission

// torrent is the subset of Transmission torrent-get fields the bridge uses.
// Field names match the Transmission RPC spec.
type torrent struct {
	ID                  int64         `json:"id"`
	HashString          string        `json:"hashString"`
	Name                string        `json:"name"`
	Status              int           `json:"status"`
	Error               int           `json:"error"`
	ErrorString         string        `json:"errorString"`
	DownloadDir         string        `json:"downloadDir"`
	TotalSize           int64         `json:"totalSize"`
	SizeWhenDone        int64         `json:"sizeWhenDone"`
	LeftUntilDone       int64         `json:"leftUntilDone"`
	PercentDone         float64       `json:"percentDone"`
	MetadataPercentDone float64       `json:"metadataPercentComplete"`
	AddedDate           int64         `json:"addedDate"`
	DoneDate            int64         `json:"doneDate"`
	ActivityDate        int64         `json:"activityDate"`
	DateCreated         int64         `json:"dateCreated"`
	Eta                 int64         `json:"eta"`
	RateDownload        int64         `json:"rateDownload"`
	RateUpload          int64         `json:"rateUpload"`
	UploadedEver        int64         `json:"uploadedEver"`
	DownloadedEver      int64         `json:"downloadedEver"`
	CorruptEver         int64         `json:"corruptEver"`
	Ratio               float64       `json:"uploadRatio"`
	PeersConnected      int64         `json:"peersConnected"`
	PeersSendingToUs    int64         `json:"peersSendingToUs"`
	PeersGettingFromUs  int64         `json:"peersGettingFromUs"`
	Trackers            []tracker     `json:"trackers"`
	TrackerStats        []trackerStat `json:"trackerStats"`
	Labels              []string      `json:"labels"`
	QueuePosition       int64         `json:"queuePosition"`
	DownloadLimit       int64         `json:"downloadLimit"`
	DownloadLimited     bool          `json:"downloadLimited"`
	UploadLimit         int64         `json:"uploadLimit"`
	UploadLimited       bool          `json:"uploadLimited"`
	SeedRatioLimit      float64       `json:"seedRatioLimit"`
	SeedRatioMode       int           `json:"seedRatioMode"`
	SeedIdleLimit       int64         `json:"seedIdleLimit"`
	SeedIdleMode        int           `json:"seedIdleMode"`
	SecondsDownloading  int64         `json:"secondsDownloading"`
	SecondsSeeding      int64         `json:"secondsSeeding"`
	IsPrivate           bool          `json:"isPrivate"`
	PieceCount          int64         `json:"pieceCount"`
	PieceSize           int64         `json:"pieceSize"`
	MagnetLink          string        `json:"magnetLink"`
	Comment             string        `json:"comment"`
	Creator             string        `json:"creator"`
	BandwidthPriority   int64         `json:"bandwidthPriority"`
	Files               []torrentFile `json:"files"`
	FileStats           []fileStat    `json:"fileStats"`
	Peers               []torrentPeer `json:"peers"`
}

// tracker is the plain announce list entry (tier + announce URL).
type tracker struct {
	Announce string `json:"announce"`
	Tier     int64  `json:"tier"`
}

// trackerStat is the per-tracker announce state inside trackerStats.
type trackerStat struct {
	Announce              string `json:"announce"`
	Tier                  int64  `json:"tier"`
	AnnounceState         int64  `json:"announceState"`
	LastAnnounceResult    string `json:"lastAnnounceResult"`
	LastAnnounceSucceeded bool   `json:"lastAnnounceSucceeded"`
	LastAnnounceTime      int64  `json:"lastAnnounceTime"`
	NextAnnounceTime      int64  `json:"nextAnnounceTime"`
	SeederCount           int64  `json:"seederCount"`
	LeecherCount          int64  `json:"leecherCount"`
	DownloadCount         int64  `json:"downloadCount"`
}

// torrentFile is one entry of torrent-get's files array.
type torrentFile struct {
	BytesCompleted int64  `json:"bytesCompleted"`
	Length         int64  `json:"length"`
	Name           string `json:"name"`
}

// fileStat is one entry of torrent-get's fileStats array.
type fileStat struct {
	BytesCompleted int64 `json:"bytesCompleted"`
	Wanted         bool  `json:"wanted"`
	Priority       int64 `json:"priority"`
}

// torrentPeer is one entry of torrent-get's peers array.
type torrentPeer struct {
	Address           string  `json:"address"`
	ClientName        string  `json:"clientName"`
	Progress          float64 `json:"progress"`
	RateToClient      int64   `json:"rateToClient"`
	RateToPeer        int64   `json:"rateToPeer"`
	IsDownloadingFrom bool    `json:"isDownloadingFrom"`
	IsUploadingTo     bool    `json:"isUploadingTo"`
	IsUTP             bool    `json:"isUTP"`
}

// torrentGetArguments is the response arguments of torrent-get.
type torrentGetArguments struct {
	Torrents []torrent `json:"torrents"`
}

// session is the subset of session-get fields the bridge maps.
type session struct {
	Version               string  `json:"version"`
	RPCVersion            int64   `json:"rpc-version"`
	DownloadDir           string  `json:"download-dir"`
	IncompleteDir         string  `json:"incomplete-dir"`
	IncompleteDirEnabled  bool    `json:"incomplete-dir-enabled"`
	SeedRatioLimit        float64 `json:"seedRatioLimit"`
	SeedRatioLimited      bool    `json:"seedRatioLimited"`
	SpeedLimitDown        int64   `json:"speed-limit-down"`
	SpeedLimitDownEnabled bool    `json:"speed-limit-down-enabled"`
	SpeedLimitUp          int64   `json:"speed-limit-up"`
	SpeedLimitUpEnabled   bool    `json:"speed-limit-up-enabled"`
	AltSpeedEnabled       bool    `json:"alt-speed-enabled"`
	AltSpeedDown          int64   `json:"alt-speed-down"`
	AltSpeedUp            int64   `json:"alt-speed-up"`
	DHTEnabled            bool    `json:"dht-enabled"`
	PexEnabled            bool    `json:"pex-enabled"`
}

// sessionStats is the response arguments of session-stats.
type sessionStats struct {
	ActiveTorrentCount int64 `json:"activeTorrentCount"`
	DownloadedBytes    int64 `json:"downloadedBytes"`
	UploadedBytes      int64 `json:"uploadedBytes"`
	CumulativeStats    struct {
		DownloadedBytes int64 `json:"downloadedBytes"`
		UploadedBytes   int64 `json:"uploadedBytes"`
		SecondsActive   int64 `json:"secondsActive"`
		SessionCount    int64 `json:"sessionCount"`
	} `json:"cumulative-stats"`
}

// torrentAddedArguments is the response arguments of torrent-add.
type torrentAddedArguments struct {
	TorrentAdded     *torrentAddedInfo `json:"torrent-added"`
	TorrentDuplicate *torrentAddedInfo `json:"torrent-duplicate"`
}

type torrentAddedInfo struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	HashString string `json:"hashString"`
}

// freeSpaceArguments is the response arguments of free-space.
type freeSpaceArguments struct {
	Path      string `json:"path"`
	SizeBytes int64  `json:"size-bytes"`
}
