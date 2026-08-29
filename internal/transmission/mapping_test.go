// Copyright (c) 2025-2026, s0oup and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package transmission

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRPCEndpoint(t *testing.T) {
	tests := []struct {
		name    string
		host    string
		want    string
		wantErr bool
	}{
		{name: "plain host", host: "http://localhost:9091", want: "http://localhost:9091/transmission/rpc"},
		{name: "no scheme", host: "localhost:9091", want: "http://localhost:9091/transmission/rpc"},
		{name: "trailing slash", host: "http://localhost:9091/", want: "http://localhost:9091/transmission/rpc"},
		{name: "transmission path", host: "https://proxy.example.com/transmission", want: "https://proxy.example.com/transmission/rpc"},
		{name: "full rpc path", host: "https://proxy.example.com/transmission/rpc", want: "https://proxy.example.com/transmission/rpc"},
		{name: "subpath proxy", host: "https://proxy.example.com/tt", want: "https://proxy.example.com/tt/transmission/rpc"},
		{name: "empty host", host: "", wantErr: true},
		{name: "bad scheme", host: "ftp://example.com", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := rpcEndpoint(tt.host)
			if tt.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestMapState(t *testing.T) {
	tests := []struct {
		name string
		tr   torrent
		want string
	}{
		{name: "stopped complete", tr: torrent{Status: 0, PercentDone: 1}, want: "stoppedUP"},
		{name: "stopped incomplete", tr: torrent{Status: 0}, want: "stoppedDL"},
		{name: "stopped with local error", tr: torrent{Status: 0, Error: 3}, want: "error"},
		{name: "checking complete", tr: torrent{Status: 2, PercentDone: 1}, want: "checkingUP"},
		{name: "checking incomplete", tr: torrent{Status: 1}, want: "checkingDL"},
		{name: "queued download", tr: torrent{Status: 3}, want: "queuedDL"},
		{name: "queued seed", tr: torrent{Status: 5}, want: "queuedUP"},
		{name: "metadata", tr: torrent{Status: 4, MetadataPercentDone: 0.5}, want: "metaDL"},
		{name: "downloading", tr: torrent{Status: 4, MetadataPercentDone: 1, RateDownload: 100}, want: "downloading"},
		{name: "stalled download", tr: torrent{Status: 4, MetadataPercentDone: 1}, want: "stalledDL"},
		{name: "uploading", tr: torrent{Status: 6, PercentDone: 1, RateUpload: 50}, want: "uploading"},
		{name: "stalled upload", tr: torrent{Status: 6, PercentDone: 1}, want: "stalledUP"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, mapState(&tt.tr))
		})
	}
}

func TestSplitLabels(t *testing.T) {
	category, tags := splitLabels([]string{"tv", "hd", ""})
	assert.Equal(t, "tv", category)
	assert.Equal(t, []string{"hd"}, tags)

	category, tags = splitLabels(nil)
	assert.Empty(t, category)
	assert.Nil(t, tags)
}

func TestMapEta(t *testing.T) {
	assert.Equal(t, int64(120), mapEta(120))
	assert.Equal(t, int64(8640000), mapEta(-1))
	assert.Equal(t, int64(8640000), mapEta(-2))
}

func TestLimitBytes(t *testing.T) {
	assert.Equal(t, int64(1024), limitBytes(true, 1))
	assert.Equal(t, int64(0), limitBytes(false, 1024))
	assert.Equal(t, int64(0), limitBytes(true, 0))
}

func TestQbitTorrentFrom(t *testing.T) {
	tr := &torrent{
		HashString:          "ABCDEF0123456789ABCDEF0123456789ABCDEF01",
		Name:                "test.torrent",
		Status:              4,
		MetadataPercentDone: 1,
		RateDownload:        500,
		RateUpload:          100,
		DownloadDir:         "/data",
		TotalSize:           1000,
		SizeWhenDone:        1000,
		LeftUntilDone:       400,
		PercentDone:         0.6,
		AddedDate:           1700000000,
		DoneDate:            0,
		Labels:              []string{"movies", "hd"},
		DownloadLimited:     true,
		DownloadLimit:       500,
		SeedRatioMode:       1,
		SeedRatioLimit:      2.5,
		TrackerStats: []trackerStat{{
			Announce:              "http://tracker.example.com/announce",
			SeederCount:           10,
			LeecherCount:          3,
			AnnounceState:         1,
			LastAnnounceSucceeded: true,
		}},
	}

	qt := qbitTorrentFrom(tr)

	assert.Equal(t, "abcdef0123456789abcdef0123456789abcdef01", qt.Hash)
	assert.Equal(t, "abcdef0123456789abcdef0123456789abcdef01", qt.InfohashV1)
	assert.Equal(t, "movies", qt.Category)
	assert.Equal(t, "hd", qt.Tags)
	assert.Equal(t, "/data", qt.SavePath)
	assert.Equal(t, "/data/test.torrent", qt.ContentPath)
	assert.Equal(t, "downloading", qt.State)
	assert.Equal(t, int64(500*1024), qt.DlLimit)
	assert.InEpsilon(t, 2.5, qt.RatioLimit, 1e-9)
	assert.InEpsilon(t, 2.5, qt.MaxRatio, 1e-9)
	assert.Equal(t, int64(10), qt.NumComplete)
	assert.Equal(t, int64(3), qt.NumIncomplete)
	assert.Equal(t, "http://tracker.example.com/announce", qt.Tracker)
	assert.Equal(t, int64(0), qt.CompletionOn) // not complete yet
}

func TestTrackerDomain(t *testing.T) {
	assert.Equal(t, "tracker.example.com", trackerDomain("http://tracker.example.com/announce"))
	assert.Empty(t, trackerDomain("not a url"))
}
