// Copyright (c) 2025-2026, s0up and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package handlers

import (
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/autobrr/qui/internal/update"
)

const uploadedBinaryFormMemory = 32 << 20

type binaryInstaller interface {
	IsSupported() bool
	Install(source io.Reader) error
	Restart() error
}

type UpdateHandler struct {
	installer binaryInstaller
}

func NewUpdateHandler(installer binaryInstaller) *UpdateHandler {
	return &UpdateHandler{installer: installer}
}

type UploadUpdateResponse struct {
	Restarting bool `json:"restarting"`
}

func (h *UpdateHandler) UploadBinary(w http.ResponseWriter, r *http.Request) {
	if h.installer == nil || !h.installer.IsSupported() {
		RespondError(w, http.StatusConflict, "Uploading updates is only supported by standalone Linux installations")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, update.MaxUploadedBinarySize)
	if err := r.ParseMultipartForm(uploadedBinaryFormMemory); err != nil { //nolint:gosec // G120: the request body is bounded by http.MaxBytesReader before parsing; memory is bounded and the rest spools to disk
		if _, ok := errors.AsType[*http.MaxBytesError](err); ok {
			RespondError(w, http.StatusRequestEntityTooLarge, "Uploaded binary exceeds the size limit")
			return
		}

		RespondError(w, http.StatusBadRequest, "Failed to parse uploaded binary")
		return
	}
	defer func() { _ = r.MultipartForm.RemoveAll() }()

	file, _, err := r.FormFile("binary")
	if err != nil {
		RespondError(w, http.StatusBadRequest, "A Linux binary file is required")
		return
	}
	defer file.Close()

	if err := h.installer.Install(file); err != nil {
		switch {
		case errors.Is(err, update.ErrUploadedBinaryTooLarge):
			RespondError(w, http.StatusRequestEntityTooLarge, "Uploaded binary exceeds the size limit")
		case errors.Is(err, update.ErrRestartPending):
			RespondError(w, http.StatusConflict, "An update is already waiting to restart")
		case errors.Is(err, update.ErrUploadedBinaryUnsupported):
			RespondError(w, http.StatusConflict, "Uploading updates is only supported by standalone Linux installations")
		default:
			log.Error().Err(err).Msg("Failed to install uploaded binary update")
			RespondError(w, http.StatusBadRequest, "Failed to install uploaded binary")
		}
		return
	}

	RespondJSON(w, http.StatusAccepted, UploadUpdateResponse{Restarting: true})
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}

	go func() {
		time.Sleep(time.Second)
		if err := h.installer.Restart(); err != nil {
			log.Error().Err(err).Msg("Failed to restart after installing uploaded binary update")
		}
	}()
}
