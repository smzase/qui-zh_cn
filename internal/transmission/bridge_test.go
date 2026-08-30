// Copyright (c) 2025-2026, s0oup and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package transmission

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	qbt "github.com/autobrr/go-qbittorrent"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeTransmissionDaemon is a minimal Transmission RPC implementation backed
// by in-memory state, enough to exercise the bridge end to end.
type fakeTransmissionDaemon struct {
	mu          sync.Mutex
	sessionID   string
	torrents    []torrent
	downloadDir string
	stopped     map[string]bool
	labelSets   map[string][]string
	torrentSet  map[string]any
	calls       []string
	// dropStringIDs simulates daemon builds that cannot resolve hash-string
	// ids: torrent-get with ids returns an empty list.
	dropStringIDs bool
	// sessionState backs session-get; session-set merges into it.
	sessionState map[string]any
}

func newFakeDaemon() *fakeTransmissionDaemon {
	return &fakeTransmissionDaemon{
		sessionID:   "fake-session-id",
		downloadDir: "/data",
		stopped:     make(map[string]bool),
		labelSets:   make(map[string][]string),
		sessionState: map[string]any{
			"download-dir": "/data", "incomplete-dir": "/data/tmp", "incomplete-dir-enabled": false,
			"start-added-torrents": true, "rename-partial-files": false,
			"download-queue-enabled": true, "download-queue-size": 5,
			"speed-limit-up": 100, "speed-limit-up-enabled": true,
			"speed-limit-down": 0, "speed-limit-down-enabled": false,
			"alt-speed-enabled": false, "alt-speed-up": 50, "alt-speed-down": 50,
			"alt-speed-time-enabled": false, "alt-speed-time-begin": 540,
			"alt-speed-time-end": 1020, "alt-speed-time-day": 127,
			"peer-limit-per-torrent": 60, "peer-limit-global": 400,
			"encryption": "preferred", "pex-enabled": true, "dht-enabled": true, "lpd-enabled": false,
			"blocklist-enabled": false, "blocklist-url": "", "blocklist-size": 0,
			"peer-port": 51413, "peer-port-random-on-start": false,
			"port-forwarding-enabled": true, "utp-enabled": true,
		},
		torrents: []torrent{
			{
				ID: 1, HashString: "aa00000000000000000000000000000000000001",
				Name: "first", Status: 4, PercentDone: 0.5, RateDownload: 1024,
				DownloadedEver: 100, UploadedEver: 200, TotalSize: 1000, SizeWhenDone: 1000,
				LeftUntilDone: 500, AddedDate: 1700000000, Labels: []string{"tv"}, Ratio: 1.5,
				DownloadDir:  "/data",
				TrackerStats: []trackerStat{{Announce: "http://tracker.example.com/announce", SeederCount: 5, AnnounceState: 1, LastAnnounceSucceeded: true}},
			},
			{
				ID: 2, HashString: "bb00000000000000000000000000000000000002",
				Name: "second", Status: 6, PercentDone: 1, RateUpload: 512,
				DownloadedEver: 10, UploadedEver: 20, TotalSize: 100, SizeWhenDone: 100,
				LeftUntilDone: 0, AddedDate: 1700000100, DoneDate: 1700000200, Labels: []string{"movies"},
				TrackerStats: []trackerStat{{Announce: "http://other.example.net/announce", SeederCount: 2, AnnounceState: 1, LastAnnounceSucceeded: true}},
			},
		},
	}
}

func (f *fakeTransmissionDaemon) handle(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Transmission-Session-Id") != f.sessionID {
		w.Header().Set("X-Transmission-Session-Id", f.sessionID)
		w.WriteHeader(http.StatusConflict)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	var req struct {
		Method    string         `json:"method"`
		Arguments map[string]any `json:"arguments"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	f.mu.Lock()
	f.calls = append(f.calls, req.Method)
	f.mu.Unlock()

	var arguments any
	switch req.Method {
	case "session-get":
		f.mu.Lock()
		merged := make(map[string]any, len(f.sessionState)+8)
		for k, v := range f.sessionState {
			merged[k] = v
		}
		f.mu.Unlock()
		merged["version"] = "4.0.6"
		merged["rpc-version"] = 17
		merged["download-dir"] = f.downloadDir
		merged["speed-limit-down"] = 100
		merged["speed-limit-down-enabled"] = false
		merged["speed-limit-up"] = 50
		merged["speed-limit-up-enabled"] = true
		merged["alt-speed-enabled"] = false
		merged["dht-enabled"] = true
		merged["pex-enabled"] = true
		arguments = merged
	case "session-set":
		f.mu.Lock()
		for k, v := range req.Arguments {
			f.sessionState[k] = v
		}
		f.mu.Unlock()
		arguments = map[string]any{}
	case "blocklist-update":
		f.mu.Lock()
		f.sessionState["blocklist-size"] = int64(12345)
		f.mu.Unlock()
		arguments = map[string]any{"blocklist-size": 12345}
	case "session-stats":
		arguments = map[string]any{
			"activeTorrentCount": 1, "downloadedBytes": 1000, "uploadedBytes": 2000,
			"cumulative-stats": map[string]any{"downloadedBytes": 9000, "uploadedBytes": 18000, "sessionCount": 3},
		}
	case "torrent-get":
		fields := []string{}
		if raw, ok := req.Arguments["fields"].([]any); ok {
			for _, v := range raw {
				fields = append(fields, v.(string))
			}
		}
		ids := map[string]bool{}
		if raw, ok := req.Arguments["ids"].([]any); ok {
			for _, v := range raw {
				ids[v.(string)] = true
			}
		}

		if len(ids) > 0 && f.dropStringIDs {
			arguments = map[string]any{"torrents": []any{}}
			break
		}

		f.mu.Lock()
		torrents := make([]map[string]any, 0, len(f.torrents))
		for i := range f.torrents {
			t := &f.torrents[i]
			if len(ids) > 0 && !ids[t.HashString] {
				continue
			}
			entries := map[string]any{"id": t.ID, "hashString": t.HashString}
			for _, field := range fields {
				switch field {
				case "name":
					entries["name"] = t.Name
				case "status":
					status := t.Status
					if f.stopped[t.HashString] {
						status = 0
					}
					entries["status"] = status
				case "percentDone":
					entries["percentDone"] = t.PercentDone
				case "rateDownload":
					entries["rateDownload"] = t.RateDownload
				case "rateUpload":
					entries["rateUpload"] = t.RateUpload
				case "downloadedEver":
					entries["downloadedEver"] = t.DownloadedEver
				case "uploadedEver":
					entries["uploadedEver"] = t.UploadedEver
				case "uploadRatio":
					entries["uploadRatio"] = t.Ratio
				case "downloadDir":
					entries["downloadDir"] = t.DownloadDir
				case "totalSize":
					entries["totalSize"] = t.TotalSize
				case "sizeWhenDone":
					entries["sizeWhenDone"] = t.SizeWhenDone
				case "leftUntilDone":
					entries["leftUntilDone"] = t.LeftUntilDone
				case "addedDate":
					entries["addedDate"] = t.AddedDate
				case "doneDate":
					entries["doneDate"] = t.DoneDate
				case "labels":
					if labels, ok := f.labelSets[t.HashString]; ok {
						entries["labels"] = labels
					} else {
						entries["labels"] = t.Labels
					}
				case "trackerStats":
					entries["trackerStats"] = t.TrackerStats
				case "peers":
					entries["peers"] = []torrentPeer{{
						Address: "1.2.3.4:1234", ClientName: "Transmission 4", Progress: 0.5,
						RateToClient: 100, RateToPeer: 200, IsUploadingTo: true, IsDownloadingFrom: true,
					}}
				case "files":
					entries["files"] = []torrentFile{{Name: "first/a.mkv", Length: 1000, BytesCompleted: 500}}
				case "fileStats":
					entries["fileStats"] = []fileStat{{Wanted: true, Priority: 0, BytesCompleted: 500}}
				case "metadataPercentComplete":
					entries["metadataPercentComplete"] = 1.0
				case "error":
					entries["error"] = 0
				case "errorString":
					entries["errorString"] = ""
				case "secondsDownloading":
					entries["secondsDownloading"] = t.SecondsDownloading
				case "secondsSeeding":
					entries["secondsSeeding"] = t.SecondsSeeding
				case "isPrivate":
					entries["isPrivate"] = t.IsPrivate
				default:
					if field == "peersConnected" || field == "peersSendingToUs" || field == "peersGettingFromUs" ||
						field == "queuePosition" || field == "pieceCount" || field == "pieceSize" || field == "activityDate" || field == "dateCreated" ||
						field == "eta" || field == "corruptEver" || field == "downloadLimit" || field == "uploadLimit" {
						entries[field] = 0
					}
					if field == "downloadLimited" || field == "uploadLimited" {
						entries[field] = false
					}
					if field == "seedRatioLimit" {
						entries[field] = 0.0
					}
					if field == "seedRatioMode" || field == "seedIdleMode" || field == "seedIdleLimit" ||
						field == "bandwidthPriority" {
						entries[field] = 0
					}
					if field == "magnetLink" || field == "comment" || field == "creator" || field == "errorString" {
						entries[field] = ""
					}
				}
			}
			torrents = append(torrents, entries)
		}
		f.mu.Unlock()
		arguments = map[string]any{"torrents": torrents}
	case "torrent-stop", "torrent-start", "torrent-verify", "torrent-reannounce":
		f.mu.Lock()
		if raw, ok := req.Arguments["ids"].([]any); ok {
			for _, v := range raw {
				hash := v.(string)
				switch req.Method {
				case "torrent-stop":
					f.stopped[hash] = true
				case "torrent-start":
					delete(f.stopped, hash)
				}
			}
		}
		f.mu.Unlock()
		arguments = map[string]any{}
	case "torrent-remove":
		ids := map[string]bool{}
		if raw, ok := req.Arguments["ids"].([]any); ok {
			for _, v := range raw {
				ids[v.(string)] = true
			}
		}
		f.mu.Lock()
		kept := f.torrents[:0]
		for _, t := range f.torrents {
			if !ids[t.HashString] {
				kept = append(kept, t)
			}
		}
		f.torrents = kept
		f.mu.Unlock()
		arguments = map[string]any{}
	case "torrent-set":
		f.mu.Lock()
		f.torrentSet = req.Arguments
		if raw, ok := req.Arguments["ids"].([]any); ok {
			if labels, ok := req.Arguments["labels"].([]any); ok {
				for _, v := range raw {
					hash := v.(string)
					converted := make([]string, 0, len(labels))
					for _, l := range labels {
						converted = append(converted, l.(string))
					}
					f.labelSets[hash] = converted
				}
			}
		}
		f.mu.Unlock()
		arguments = map[string]any{}
	case "free-space":
		arguments = map[string]any{"path": "/data", "size-bytes": 123456789}
	default:
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"result":"unknown method"}`))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	resp := map[string]any{"result": "success", "arguments": arguments}
	_ = json.NewEncoder(w).Encode(resp)
}

// newTestClient builds a go-qbittorrent client wired to a bridge over the
// fake daemon, mirroring how qui constructs Transmission instances.
func newTestClient(t *testing.T, daemon *fakeTransmissionDaemon) (*qbt.Client, *Bridge) {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(daemon.handle))
	t.Cleanup(server.Close)

	bridge, err := NewBridge(server.URL, "user", "pass", false, 10*time.Second)
	require.NoError(t, err)

	client := qbt.NewClient(qbt.Config{
		Host:     server.URL,
		Username: "user",
		Password: "pass",
	}).WithHTTPClient(&http.Client{Transport: bridge, Timeout: 10 * time.Second})

	return client, bridge
}

func TestBridgeLoginAndCapabilities(t *testing.T) {
	daemon := newFakeDaemon()
	client, _ := newTestClient(t, daemon)

	ctx := context.Background()
	require.NoError(t, client.LoginCtx(ctx))

	version, err := client.GetWebAPIVersionCtx(ctx)
	require.NoError(t, err)
	assert.Equal(t, "2.7.0", version)

	appVersion, err := client.GetAppVersionCtx(ctx)
	require.NoError(t, err)
	assert.Equal(t, "4.0.6", appVersion)
}

func TestBridgeMaindataSync(t *testing.T) {
	daemon := newFakeDaemon()
	client, _ := newTestClient(t, daemon)

	ctx := context.Background()
	require.NoError(t, client.LoginCtx(ctx))

	sm := client.NewSyncManager(qbt.DefaultSyncOptions())
	require.NoError(t, sm.Sync(ctx))

	data := sm.GetDataUnchecked()
	require.NotNil(t, data)
	require.Len(t, data.Torrents, 2)

	first, ok := data.Torrents["aa00000000000000000000000000000000000001"]
	require.True(t, ok)
	assert.Equal(t, "first", first.Name)
	assert.Equal(t, "downloading", string(first.State))
	assert.Empty(t, first.Category)
	assert.Equal(t, "tv", first.Tags)
	assert.Equal(t, int64(1024), first.DlSpeed)

	second := data.Torrents["bb00000000000000000000000000000000000002"]
	assert.Equal(t, "uploading", string(second.State))
	assert.Empty(t, second.Category)
	assert.Equal(t, int64(100), second.Completed)
	assert.Equal(t, int64(1700000200), second.CompletionOn)

	assert.Empty(t, data.Categories)
	assert.Contains(t, data.Tags, "tv")
	assert.Contains(t, data.Tags, "movies")
	assert.Contains(t, data.Trackers, "tracker.example.com")

	state := data.ServerState
	assert.Equal(t, int64(9000), state.AlltimeDl)
	assert.Equal(t, int64(1024+512), state.DlInfoSpeed+state.UpInfoSpeed)
	assert.Equal(t, int64(123456789), state.FreeSpaceOnDisk)

	// Delta sync: stop one torrent and add a new one, then verify the merged
	// state reflects both without a full resync.
	daemon.mu.Lock()
	daemon.stopped["aa00000000000000000000000000000000000001"] = true
	daemon.torrents = append(daemon.torrents, torrent{
		ID: 3, HashString: "cc00000000000000000000000000000000000003",
		Name: "third", Status: 0, PercentDone: 0.1, TotalSize: 10, SizeWhenDone: 10, LeftUntilDone: 9,
		AddedDate: 1700000300,
	})
	daemon.mu.Unlock()

	require.NoError(t, sm.Sync(ctx))
	data = sm.GetDataUnchecked()
	require.Len(t, data.Torrents, 3)

	first, ok = data.Torrents["aa00000000000000000000000000000000000001"]
	require.True(t, ok)
	assert.Equal(t, "stoppedDL", string(first.State))
	assert.Contains(t, data.Torrents, "cc00000000000000000000000000000000000003")
}

func TestBridgeTorrentActions(t *testing.T) {
	daemon := newFakeDaemon()
	client, bridge := newTestClient(t, daemon)

	ctx := context.Background()
	require.NoError(t, client.LoginCtx(ctx))

	sm := client.NewSyncManager(qbt.DefaultSyncOptions())
	require.NoError(t, sm.Sync(ctx))

	hash := "aa00000000000000000000000000000000000001"
	require.NoError(t, client.PauseCtx(ctx, []string{hash}))

	daemon.mu.Lock()
	assert.True(t, daemon.stopped[strings.ToUpper(hash)] || daemon.stopped[hash])
	daemon.mu.Unlock()

	// Transmission labels are exposed as qBittorrent tags.
	require.NoError(t, client.AddTagsCtx(ctx, []string{hash}, "anime"))
	daemon.mu.Lock()
	assert.Equal(t, []string{"tv", "anime"}, daemon.labelSets[hash])
	daemon.mu.Unlock()
	require.NoError(t, client.RemoveTagsCtx(ctx, []string{hash}, "tv"))
	daemon.mu.Lock()
	assert.Equal(t, []string{"anime"}, daemon.labelSets[hash])
	daemon.mu.Unlock()

	// Both APIs express idle seeding limits in minutes.
	require.NoError(t, client.SetTorrentShareLimitCtx(ctx, []string{hash}, qbt.ShareLimitOptions{
		RatioLimit:               2.5,
		SeedingTimeLimit:         -1,
		InactiveSeedingTimeLimit: 10080,
	}))
	daemon.mu.Lock()
	assert.InDelta(t, 2.5, daemon.torrentSet["seedRatioLimit"], 1e-9)
	assert.InDelta(t, 1, daemon.torrentSet["seedRatioMode"], 1e-9)
	assert.InDelta(t, 10080, daemon.torrentSet["seedIdleLimit"], 1e-9)
	assert.InDelta(t, 1, daemon.torrentSet["seedIdleMode"], 1e-9)
	daemon.mu.Unlock()

	// Trackers come back mapped with pseudo entries.
	trackers, err := client.GetTorrentTrackersCtx(ctx, hash)
	require.NoError(t, err)
	require.NotEmpty(t, trackers)
	found := false
	for _, tr := range trackers {
		if tr.Url == "http://tracker.example.com/announce" {
			found = true
			assert.Equal(t, qbt.TrackerStatusOK, tr.Status)
			assert.Equal(t, 5, tr.NumSeeds)
		}
	}
	assert.True(t, found, "announce URL missing from trackers response")

	// Files map with priority and progress.
	files, err := client.GetFilesInformationCtx(ctx, hash)
	require.NoError(t, err)
	require.Len(t, *files, 1)
	assert.Equal(t, "first/a.mkv", (*files)[0].Name)
	assert.Equal(t, int64(1000), (*files)[0].Size)

	// Peers endpoint.
	peers, err := client.GetTorrentPeersCtx(ctx, hash, 0)
	require.NoError(t, err)
	require.Contains(t, peers.Peers, "1.2.3.4:1234")

	// Torrents info with hashes filter.
	list, err := client.GetTorrentsCtx(ctx, qbt.TorrentFilterOptions{Hashes: []string{hash}})
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, "first", list[0].Name)

	_ = bridge
}

func TestBridgeTorrentProperties(t *testing.T) {
	daemon := newFakeDaemon()
	daemon.torrents[0].SecondsDownloading = 3
	daemon.torrents[0].IsPrivate = true
	client, _ := newTestClient(t, daemon)

	ctx := context.Background()
	require.NoError(t, client.LoginCtx(ctx))

	hash := "aa00000000000000000000000000000000000001"
	props, err := client.GetTorrentPropertiesCtx(ctx, hash)
	require.NoError(t, err)
	assert.Equal(t, "first", props.Name)
	assert.Equal(t, hash, props.Hash)
	assert.Equal(t, hash, props.InfohashV1)
	assert.Equal(t, "/data", props.SavePath)
	assert.Equal(t, int64(1000), props.TotalSize)
	assert.InDelta(t, 1.5, props.ShareRatio, 0.0001)
	assert.Equal(t, int64(100), props.TotalDownloaded)
	assert.Equal(t, int64(200), props.TotalUploaded)
	assert.Equal(t, 33, props.DlSpeedAvg)
	assert.Equal(t, 66, props.UpSpeedAvg)
	assert.True(t, props.IsPrivate)

	// The ratio must come from the daemon's uploadRatio field; an invalid
	// field name would decode as a silent zero.
	assert.NotZero(t, props.ShareRatio)

	// Unknown hashes surface as ErrTorrentNotFound, not an empty success.
	_, err = client.GetTorrentPropertiesCtx(ctx, "ffffffffffffffffffffffffffffffffffffffff")
	require.ErrorIs(t, err, qbt.ErrTorrentNotFound)
}

func TestBridgeTorrentPropertiesFallsBackWhenDaemonIgnoresIds(t *testing.T) {
	daemon := newFakeDaemon()
	daemon.dropStringIDs = true
	client, _ := newTestClient(t, daemon)

	ctx := context.Background()
	require.NoError(t, client.LoginCtx(ctx))

	// A daemon that cannot resolve hash-string ids must still serve
	// properties through the fetch-all fallback.
	hash := "aa00000000000000000000000000000000000001"
	props, err := client.GetTorrentPropertiesCtx(ctx, hash)
	require.NoError(t, err)
	assert.Equal(t, "first", props.Name)
	assert.InDelta(t, 1.5, props.ShareRatio, 0.0001)
}

func TestBridgeTransmissionPreferences(t *testing.T) {
	daemon := newFakeDaemon()
	_, bridge := newTestClient(t, daemon)

	ctx := context.Background()

	settings, err := bridge.GetSession(ctx)
	require.NoError(t, err)

	// Allowlisted fields pass through with the daemon's own keys.
	assert.Equal(t, "/data", settings["download-dir"])
	require.Contains(t, settings, "download-queue-size")
	assert.InDelta(t, 5, settings["download-queue-size"], 0.0001)
	require.Contains(t, settings, "peer-limit-per-torrent")
	assert.InDelta(t, 60, settings["peer-limit-per-torrent"], 0.0001)
	require.Contains(t, settings, "peer-port")
	assert.InDelta(t, 51413, settings["peer-port"], 0.0001)
	require.Contains(t, settings, "encryption")
	assert.Equal(t, "preferred", settings["encryption"])

	// Non-allowlisted session fields stay private.
	_, ok := settings["version"]
	assert.False(t, ok, "version must not leak through the preferences surface")
	_, ok = settings["rpc-version"]
	assert.False(t, ok, "rpc-version must not leak through the preferences surface")

	// Writes round-trip through session-set.
	require.NoError(t, bridge.SetSession(ctx, map[string]any{
		"peer-limit-per-torrent": 120,
		"encryption":             "required",
		"peer-port":              51410,
		"utp-enabled":            false,
		"blocklist-enabled":      true,
		"blocklist-url":          "http://example.com/blocklist",
	}))

	updated, err := bridge.GetSession(ctx)
	require.NoError(t, err)
	assert.InDelta(t, 120, updated["peer-limit-per-torrent"], 0.0001)
	assert.Equal(t, "required", updated["encryption"])
	assert.InDelta(t, 51410, updated["peer-port"], 0.0001)
	assert.Equal(t, false, updated["utp-enabled"])
	assert.Equal(t, true, updated["blocklist-enabled"])
	assert.Equal(t, "http://example.com/blocklist", updated["blocklist-url"])

	// Unknown keys are rejected instead of silently forwarded.
	err = bridge.SetSession(ctx, map[string]any{"seed-queue-size-bogus": 1})
	require.Error(t, err)
	// Read-only keys are rejected on write too.
	err = bridge.SetSession(ctx, map[string]any{"blocklist-size": 99})
	require.Error(t, err)
}

func TestBridgeTransmissionBlocklistUpdate(t *testing.T) {
	daemon := newFakeDaemon()
	_, bridge := newTestClient(t, daemon)

	size, err := bridge.UpdateBlocklist(context.Background())
	require.NoError(t, err)
	assert.Equal(t, int64(12345), size)

	settings, err := bridge.GetSession(context.Background())
	require.NoError(t, err)
	assert.InDelta(t, 12345, settings["blocklist-size"], 0.0001)
}

func TestBridgeCategories(t *testing.T) {
	daemon := newFakeDaemon()
	client, _ := newTestClient(t, daemon)

	ctx := context.Background()
	require.NoError(t, client.LoginCtx(ctx))

	require.Error(t, client.CreateCategoryCtx(ctx, "empty-cat", ""))

	categories, err := client.GetCategoriesCtx(ctx)
	require.NoError(t, err)
	assert.Empty(t, categories)

	tags, err := client.GetTagsCtx(ctx)
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"tv", "movies"}, tags)
}
