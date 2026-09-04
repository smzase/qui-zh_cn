package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/autobrr/qui/internal/auth"
	"github.com/autobrr/qui/internal/models"
	"github.com/go-chi/chi/v5"
)

type ManagedUsersHandler struct{ authService *auth.Service }

func NewManagedUsersHandler(service *auth.Service) *ManagedUsersHandler {
	return &ManagedUsersHandler{authService: service}
}
func (h *ManagedUsersHandler) requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	if !isAdmin(r) {
		RespondError(w, http.StatusForbidden, "Administrator permission required")
		return false
	}
	return true
}
func (h *ManagedUsersHandler) List(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	users, err := h.authService.ListUsers(r.Context())
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "Failed to list users")
		return
	}
	RespondJSON(w, http.StatusOK, users)
}

// ListShareTargets returns the non-sensitive account data needed when an
// instance owner chooses users to share an instance with. Unlike List, this
// endpoint is available to every authenticated user.
func (h *ManagedUsersHandler) ListShareTargets(w http.ResponseWriter, r *http.Request) {
	users, err := h.authService.ListUsers(r.Context())
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "Failed to list users")
		return
	}
	type shareTarget struct {
		ID       int             `json:"id"`
		Username string          `json:"username"`
		Role     models.UserRole `json:"role"`
	}
	targets := make([]shareTarget, 0, len(users))
	for _, user := range users {
		targets = append(targets, shareTarget{
			ID:       user.ID,
			Username: user.Username,
			Role:     user.Role,
		})
	}
	RespondJSON(w, http.StatusOK, targets)
}

type createManagedUserRequest struct {
	Username    string                  `json:"username"`
	Password    string                  `json:"password"`
	Role        models.UserRole         `json:"role"`
	Permissions []models.UserPermission `json:"permissions"`
}

func (h *ManagedUsersHandler) Create(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	var req createManagedUserRequest
	if json.NewDecoder(r.Body).Decode(&req) != nil || req.Username == "" || req.Password == "" {
		RespondError(w, http.StatusBadRequest, "Username and password are required")
		return
	}
	user, err := h.authService.CreateManagedUser(r.Context(), req.Username, req.Password, req.Role, req.Permissions)
	if err != nil {
		if errors.Is(err, models.ErrUserAlreadyExists) {
			RespondError(w, http.StatusConflict, "Username already exists")
			return
		}
		RespondError(w, http.StatusBadRequest, err.Error())
		return
	}
	RespondJSON(w, http.StatusCreated, user)
}

type roleRequest struct {
	Role models.UserRole `json:"role"`
}

func (h *ManagedUsersHandler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		RespondError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}
	var req roleRequest
	if json.NewDecoder(r.Body).Decode(&req) != nil {
		RespondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := h.authService.UpdateUserRole(r.Context(), id, req.Role); err != nil {
		if errors.Is(err, models.ErrLastAdmin) {
			RespondError(w, http.StatusConflict, "At least one administrator must remain")
			return
		}
		if errors.Is(err, models.ErrUserNotFound) {
			RespondError(w, http.StatusNotFound, "User not found")
			return
		}
		RespondError(w, http.StatusBadRequest, err.Error())
		return
	}
	RespondJSON(w, http.StatusOK, map[string]string{"message": "User role updated"})
}

type permissionsRequest struct {
	Permissions []models.UserPermission `json:"permissions"`
}

func (h *ManagedUsersHandler) UpdatePermissions(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		RespondError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}
	var req permissionsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := h.authService.UpdateUserPermissions(r.Context(), id, req.Permissions); err != nil {
		if errors.Is(err, models.ErrUserNotFound) {
			RespondError(w, http.StatusNotFound, "User not found")
			return
		}
		RespondError(w, http.StatusBadRequest, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ManagedUsersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		RespondError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}
	if id == currentUserID(r) {
		RespondError(w, http.StatusConflict, "Cannot delete the current user")
		return
	}
	if err := h.authService.DeleteManagedUser(r.Context(), id); err != nil {
		if errors.Is(err, models.ErrLastAdmin) {
			RespondError(w, http.StatusConflict, "At least one administrator must remain")
			return
		}
		if errors.Is(err, models.ErrUserOwnsInstances) {
			RespondError(w, http.StatusConflict, "Transfer or remove the user's instances before deleting the user")
			return
		}
		if errors.Is(err, models.ErrUserNotFound) {
			RespondError(w, http.StatusNotFound, "User not found")
			return
		}
		RespondError(w, http.StatusBadRequest, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
