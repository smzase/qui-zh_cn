package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/autobrr/qui/internal/api/ctxkeys"
	"github.com/autobrr/qui/internal/models"
)

// RequireInstanceAccess protects all routes below /instances/{instanceID}.
func (h *InstancesHandler) RequireInstanceAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		instanceID, err := strconv.Atoi(chi.URLParam(r, "instanceID"))
		if err != nil {
			RespondError(w, http.StatusBadRequest, "Invalid instance ID")
			return
		}
		userID, _ := r.Context().Value(ctxkeys.UserID).(int)
		role, _ := r.Context().Value(ctxkeys.UserRole).(string)
		if instanceID == 0 {
			if _, err := h.instanceStore.ListForUser(r.Context(), userID, role == string(models.UserRoleAdmin)); err != nil {
				RespondError(w, http.StatusInternalServerError, "Failed to authorize instances")
				return
			}
			next.ServeHTTP(w, r)
			return
		}
		allowed, err := h.instanceStore.CanAccess(r.Context(), instanceID, userID, role == "admin")
		if err != nil {
			RespondError(w, http.StatusInternalServerError, "Failed to authorize instance")
			return
		}
		if !allowed {
			RespondError(w, http.StatusNotFound, "Instance not found")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (h *InstancesHandler) RequireInstanceOwner(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		instanceID, err := strconv.Atoi(chi.URLParam(r, "instanceID"))
		if err != nil {
			RespondError(w, http.StatusBadRequest, "Invalid instance ID")
			return
		}
		role, _ := r.Context().Value(ctxkeys.UserRole).(string)
		if role == "admin" {
			next.ServeHTTP(w, r)
			return
		}
		ownerID, err := h.instanceStore.OwnerID(r.Context(), instanceID)
		if err == nil && ownerID == currentUserID(r) {
			next.ServeHTTP(w, r)
			return
		}
		RespondError(w, http.StatusForbidden, "Instance owner permission required")
	})
}
