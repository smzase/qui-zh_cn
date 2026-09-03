package handlers

import (
	"context"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/autobrr/qui/internal/api/ctxkeys"
	"github.com/autobrr/qui/internal/models"
)

func currentUserIDFromContext(ctx context.Context) int {
	if id, ok := ctx.Value(ctxkeys.UserID).(int); ok {
		return id
	}
	return 0
}

func currentUserID(r *http.Request) int {
	if id, ok := r.Context().Value(ctxkeys.UserID).(int); ok && id > 0 {
		return id
	}
	return 0
}

func currentUserRole(r *http.Request) string {
	if role, ok := r.Context().Value(ctxkeys.UserRole).(string); ok {
		return role
	}
	return string(models.UserRoleUser)
}

func instanceSharedForRequest(ctx context.Context, ownerID int) bool {
	if ownerID <= 0 {
		return false
	}
	if role, ok := ctx.Value(ctxkeys.UserRole).(string); ok && role == string(models.UserRoleAdmin) {
		return false
	}
	return ownerID != currentUserIDFromContext(ctx)
}

func isAdmin(r *http.Request) bool {
	return currentUserRole(r) == string(models.UserRoleAdmin)
}

func instanceIDParam(r *http.Request) (int, bool) {
	id, err := strconv.Atoi(chi.URLParam(r, "instanceID"))
	return id, err == nil
}
