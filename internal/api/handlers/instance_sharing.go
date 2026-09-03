package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/autobrr/qui/internal/models"
)

type shareRequest struct {
	UserID int `json:"userId"`
}

func (h *InstancesHandler) ListInstanceShares(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "instanceID"))
	if err != nil {
		RespondError(w, http.StatusBadRequest, "Invalid instance ID")
		return
	}
	ownerID, err := h.instanceStore.OwnerID(r.Context(), id)
	if errors.Is(err, models.ErrInstanceNotFound) {
		RespondError(w, http.StatusNotFound, "Instance not found")
		return
	}
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "Failed to authorize instance")
		return
	}
	if !isAdmin(r) && ownerID != currentUserID(r) {
		RespondError(w, http.StatusForbidden, "Instance owner permission required")
		return
	}
	shares, err := h.instanceStore.ListShares(r.Context(), id)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "Failed to list shares")
		return
	}
	RespondJSON(w, http.StatusOK, shares)
}
func (h *InstancesHandler) ShareInstance(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "instanceID"))
	if err != nil {
		RespondError(w, http.StatusBadRequest, "Invalid instance ID")
		return
	}
	var req shareRequest
	if json.NewDecoder(r.Body).Decode(&req) != nil || req.UserID <= 0 {
		RespondError(w, http.StatusBadRequest, "userId is required")
		return
	}
	ownerID, ownerErr := h.instanceStore.OwnerID(r.Context(), id)
	if errors.Is(ownerErr, models.ErrInstanceNotFound) {
		RespondError(w, http.StatusNotFound, "Instance not found")
		return
	}
	if ownerErr != nil {
		RespondError(w, http.StatusInternalServerError, "Failed to authorize instance")
		return
	}
	if !isAdmin(r) && ownerID != currentUserID(r) {
		RespondError(w, http.StatusForbidden, "Permission denied")
		return
	}
	if err := h.instanceStore.Share(r.Context(), id, req.UserID, currentUserID(r)); err != nil {
		if errors.Is(err, models.ErrInstanceShareTargetNotFound) {
			RespondError(w, http.StatusNotFound, "User not found")
			return
		}
		if errors.Is(err, models.ErrInstanceShareSelf) {
			RespondError(w, http.StatusBadRequest, "Cannot share an instance with yourself")
			return
		}
		if errors.Is(err, models.ErrInstanceNotFound) {
			RespondError(w, http.StatusNotFound, "Instance not found")
			return
		}
		if !isAdmin(r) && ownerID != currentUserID(r) {
			RespondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		RespondError(w, http.StatusBadRequest, "Failed to share instance")
		return
	}
	RespondJSON(w, http.StatusOK, map[string]string{"message": "Instance shared"})
}
func (h *InstancesHandler) UnshareInstance(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "instanceID"))
	if err != nil {
		RespondError(w, http.StatusBadRequest, "Invalid instance ID")
		return
	}
	targetID, err := strconv.Atoi(chi.URLParam(r, "userID"))
	if err != nil {
		RespondError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}
	ownerID, err := h.instanceStore.OwnerID(r.Context(), id)
	if err != nil {
		RespondError(w, http.StatusNotFound, "Instance not found")
		return
	}
	if !isAdmin(r) && ownerID != currentUserID(r) && targetID != currentUserID(r) {
		RespondError(w, http.StatusForbidden, "Permission denied")
		return
	}
	if err := h.instanceStore.Unshare(r.Context(), id, targetID); err != nil {
		RespondError(w, http.StatusInternalServerError, "Failed to remove share")
		return
	}
	RespondJSON(w, http.StatusOK, map[string]string{"message": "Instance share removed"})
}
