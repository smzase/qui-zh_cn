// Copyright (c) 2025-2026, s0up and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

// Package transmission implements a Transmission RPC client plus a protocol
// bridge that lets qui's qBittorrent client talk to a Transmission daemon.
// The bridge (bridge.go) is an http.RoundTripper that emulates the qBittorrent
// WebUI API v2 surface qui relies on, translating every request to the
// daemon's RPC endpoints and mapping responses back to qBittorrent shapes.
package transmission

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Error codes returned by the RPC transport.
var (
	ErrUnauthorized = errors.New("transmission: unauthorized")
	ErrRPCFailure   = errors.New("transmission: rpc call failed")
)

// rpcRequest is the JSON body of every Transmission RPC call.
type rpcRequest struct {
	Method    string         `json:"method"`
	Arguments map[string]any `json:"arguments,omitempty"`
	Tag       int            `json:"tag,omitempty"`
}

// rpcResponse is the JSON envelope of every Transmission RPC reply.
type rpcResponse struct {
	Result    string          `json:"result"`
	Arguments json.RawMessage `json:"arguments"`
}

// rpcClient is a minimal Transmission RPC client: JSON over HTTP POST with
// the X-Transmission-Session-Id CSRF handshake and optional basic auth.
type rpcClient struct {
	endpoint   string
	username   string
	password   string
	httpClient *http.Client

	sessionIDMu sync.Mutex
	sessionID   string
}

// newRPIClient builds an RPC client for the given Transmission base URL.
// host is the user-facing URL (e.g. http://localhost:9091); the RPC endpoint
// is derived from it, tolerating hosts that already carry /transmission or
// /transmission/rpc paths (reverse-proxy setups).
func newRPIClient(host, username, password string, tlsSkipVerify bool, timeout time.Duration) (*rpcClient, error) {
	endpoint, err := rpcEndpoint(host)
	if err != nil {
		return nil, err
	}

	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:        10,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 10 * time.Second,
		// InsecureSkipVerify mirrors the per-instance "skip TLS verification"
		// setting the user explicitly opted into; the default transport in
		// go-qbittorrent carries the same flag.
		TLSClientConfig: &tls.Config{InsecureSkipVerify: tlsSkipVerify}, //nolint:gosec // user-configured per-instance opt-in
	}

	return &rpcClient{
		endpoint:   endpoint,
		username:   username,
		password:   password,
		httpClient: &http.Client{Timeout: timeout, Transport: transport},
	}, nil
}

// rpcEndpoint derives the /transmission/rpc endpoint from a base URL.
func rpcEndpoint(host string) (string, error) {
	trimmed := strings.TrimRight(strings.TrimSpace(host), "/")
	if trimmed == "" {
		return "", errors.New("transmission: host is empty")
	}

	if !strings.Contains(trimmed, "://") {
		trimmed = "http://" + trimmed
	}

	u, err := url.Parse(trimmed)
	if err != nil {
		return "", fmt.Errorf("transmission: invalid host %q: %w", host, err)
	}
	if u.Host == "" {
		return "", fmt.Errorf("transmission: host %q has no host part", host)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("transmission: unsupported scheme %q", u.Scheme)
	}

	path := strings.TrimRight(u.Path, "/")
	switch {
	case strings.HasSuffix(path, "/rpc"):
		// already the full endpoint (or .../transmission/rpc)
	case strings.HasSuffix(path, "/transmission"):
		path += "/rpc"
	default:
		path += "/transmission/rpc"
	}
	u.Path = path

	return u.String(), nil
}

// call performs one RPC method invocation, transparently handling the
// X-Transmission-Session-Id 409 handshake. out may be nil when the caller
// only cares about success.
func (c *rpcClient) call(ctx context.Context, method string, arguments map[string]any, out any) error {
	body, err := json.Marshal(rpcRequest{Method: method, Arguments: arguments})
	if err != nil {
		return fmt.Errorf("transmission: encode request: %w", err)
	}

	for attempt := 0; attempt < 2; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
		if err != nil {
			return fmt.Errorf("transmission: build request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")

		if c.username != "" || c.password != "" {
			req.SetBasicAuth(c.username, c.password)
		}

		c.sessionIDMu.Lock()
		sessionID := c.sessionID
		c.sessionIDMu.Unlock()
		if sessionID != "" {
			req.Header.Set("X-Transmission-Session-Id", sessionID)
		}

		resp, err := c.httpClient.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return fmt.Errorf("transmission: request failed: %w", err)
		}

		switch resp.StatusCode {
		case http.StatusOK:
			return decodeRPCResponse(resp, out)
		case http.StatusConflict:
			// CSRF handshake: adopt the new session id and retry once.
			newID := resp.Header.Get("X-Transmission-Session-Id")
			io.Copy(io.Discard, resp.Body) //nolint:errcheck
			resp.Body.Close()
			if newID == "" {
				return errors.New("transmission: 409 without session id header")
			}
			c.sessionIDMu.Lock()
			c.sessionID = newID
			c.sessionIDMu.Unlock()
			continue
		case http.StatusUnauthorized, http.StatusForbidden:
			io.Copy(io.Discard, resp.Body) //nolint:errcheck
			resp.Body.Close()
			return ErrUnauthorized
		default:
			io.Copy(io.Discard, resp.Body) //nolint:errcheck
			resp.Body.Close()
			return fmt.Errorf("%w: %s returned %d", ErrRPCFailure, method, resp.StatusCode)
		}
	}

	return fmt.Errorf("%w: %s exhausted session handshake", ErrRPCFailure, method)
}

func decodeRPCResponse(resp *http.Response, out any) error {
	defer resp.Body.Close()

	var envelope rpcResponse
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return fmt.Errorf("transmission: decode response: %w", err)
	}

	if envelope.Result != "success" {
		return fmt.Errorf("%w: %s", ErrRPCFailure, envelope.Result)
	}

	if out != nil && len(envelope.Arguments) > 0 {
		if err := json.Unmarshal(envelope.Arguments, out); err != nil {
			return fmt.Errorf("transmission: decode arguments: %w", err)
		}
	}

	return nil
}
