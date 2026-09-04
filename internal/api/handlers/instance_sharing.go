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

type batchShareRequest struct {
	InstanceIDs []int `json:"instanceIds"`
	UserIDs     []int `json:"userIds"`
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

func (h *InstancesHandler) ShareInstances(w http.ResponseWriter, r *http.Request) {
	var req batchShareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.InstanceIDs) == 0 || len(req.UserIDs) == 0 {
		RespondError(w, http.StatusBadRequest, "instanceIds and userIds are required")
		return
	}

	instanceIDs := make(map[int]struct{}, len(req.InstanceIDs))
	for _, id := range req.InstanceIDs {
		if id <= 0 {
			RespondError(w, http.StatusBadRequest, "Invalid instance ID")
			return
		}
		instanceIDs[id] = struct{}{}
	}
	userIDs := make(map[int]struct{}, len(req.UserIDs))
	for _, id := range req.UserIDs {
		if id <= 0 {
			RespondError(w, http.StatusBadRequest, "Invalid user ID")
			return
		}
		userIDs[id] = struct{}{}
	}

	owners := make(map[int]int, len(instanceIDs))
	for instanceID := range instanceIDs {
		ownerID, err := h.instanceStore.OwnerID(r.Context(), instanceID)
		if errors.Is(err, models.ErrInstanceNotFound) {
			RespondError(w, http.StatusNotFound, "Instance not found")
			return
		}
		if err != nil {
			RespondError(w, http.StatusInternalServerError, "Failed to authorize instance")
			return
		}
		if !isAdmin(r) && ownerID != currentUserID(r) {
			RespondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		owners[instanceID] = ownerID
	}

	instanceIDList := make([]int, 0, len(owners))
	for instanceID, ownerID := range owners {
		instanceIDList = append(instanceIDList, instanceID)
		for userID := range userIDs {
			if userID == ownerID {
				RespondError(w, http.StatusBadRequest, "Cannot share an instance with yourself")
				return
			}
		}
	}
	userIDList := make([]int, 0, len(userIDs))
	for userID := range userIDs {
		userIDList = append(userIDList, userID)
	}
	if err := h.instanceStore.ShareMany(r.Context(), instanceIDList, userIDList, currentUserID(r)); err != nil {
		if errors.Is(err, models.ErrInstanceShareTargetNotFound) {
			RespondError(w, http.StatusNotFound, "User not found")
			return
		}
		RespondError(w, http.StatusInternalServerError, "Failed to share instances")
		return
	}

	RespondJSON(w, http.StatusOK, map[string]string{"message": "Instances shared"})
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
