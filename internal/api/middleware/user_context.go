package middleware

import (
	"context"
	"net/http"

	"github.com/autobrr/qui/internal/api/ctxkeys"
	"github.com/autobrr/qui/internal/auth"
	"github.com/autobrr/qui/internal/domain"
)

// PopulateUserContext resolves the authenticated username to its role and ID.
func PopulateUserContext(authService *auth.Service, configs ...*domain.Config) func(http.Handler) http.Handler {
	authDisabled := len(configs) > 0 && configs[0] != nil && configs[0].IsAuthDisabled()
	unauthorized := func(w http.ResponseWriter) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if userID, ok := r.Context().Value(ctxkeys.UserID).(int); ok && userID > 0 {
				if user, err := authService.GetUser(r.Context(), userID); err == nil {
					ctx := context.WithValue(r.Context(), ctxkeys.Username, user.Username)
					ctx = context.WithValue(ctx, ctxkeys.UserRole, string(user.Role))
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
				if authDisabled && userID == 1 {
					next.ServeHTTP(w, r)
					return
				}
				unauthorized(w)
				return
			}
			if username, ok := r.Context().Value(ctxkeys.Username).(string); ok && username != "" {
				if user, err := authService.FindUser(r.Context(), username); err == nil {
					ctx := context.WithValue(r.Context(), ctxkeys.UserID, user.ID)
					ctx = context.WithValue(ctx, ctxkeys.UserRole, string(user.Role))
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
				unauthorized(w)
				return
			}
			if authDisabled {
				next.ServeHTTP(w, r)
				return
			}
			unauthorized(w)
		})
	}
}
