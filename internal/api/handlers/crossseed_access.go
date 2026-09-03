package handlers

import (
	"errors"
	"net/http"

	"github.com/autobrr/qui/internal/api/ctxkeys"
	"github.com/autobrr/qui/internal/models"
)

var errCrossSeedInstanceForbidden = errors.New("cross-seed instance access denied")

// adminOnly protects cross-seed operations that mutate global scheduler state.
// Instance-scoped operations use RequireInstanceAccess instead.
func adminOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if role, _ := r.Context().Value(ctxkeys.UserRole).(string); role == string(models.UserRoleAdmin) {
			next.ServeHTTP(w, r)
			return
		}
		RespondError(w, http.StatusForbidden, "Administrator permission required")
	})
}

// scopeCrossSeedInstanceIDs converts an omitted instance list into the
// current user's visible instances and rejects explicit IDs they cannot use.
// Administrators retain the service's existing empty-list semantics (all
// instances).
func (h *CrossSeedHandler) scopeCrossSeedInstanceIDs(r *http.Request, requested []int) ([]int, error) {
	if isAdmin(r) {
		return requested, nil
	}
	if h.instanceStore == nil {
		return requested, nil
	}

	if len(requested) == 0 {
		instances, err := h.instanceStore.ListForUser(r.Context(), currentUserID(r), false)
		if err != nil {
			return nil, err
		}
		if len(instances) == 0 {
			return nil, errCrossSeedInstanceForbidden
		}
		ids := make([]int, 0, len(instances))
		for _, instance := range instances {
			ids = append(ids, instance.ID)
		}
		return ids, nil
	}

	seen := make(map[int]struct{}, len(requested))
	ids := make([]int, 0, len(requested))
	for _, id := range requested {
		if id <= 0 {
			return nil, errCrossSeedInstanceForbidden
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		allowed, err := h.instanceStore.CanAccess(r.Context(), id, currentUserID(r), false)
		if err != nil {
			return nil, err
		}
		if !allowed {
			return nil, errCrossSeedInstanceForbidden
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func respondCrossSeedInstanceScopeError(w http.ResponseWriter, err error) {
	if errors.Is(err, errCrossSeedInstanceForbidden) {
		RespondError(w, http.StatusForbidden, "Instance access denied")
		return
	}
	RespondError(w, http.StatusInternalServerError, "Failed to authorize instances")
}
