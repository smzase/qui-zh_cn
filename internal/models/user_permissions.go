// Copyright (c) 2025-2026, s0up and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package models

import (
	"context"
	"errors"
	"slices"
)

func (s *UserStore) ListPermissions(ctx context.Context, userID int) ([]UserPermission, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT permission
		FROM user_permissions
		WHERE user_id = ?
		ORDER BY permission ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	permissions := make([]UserPermission, 0)
	for rows.Next() {
		var permission UserPermission
		if err := rows.Scan(&permission); err != nil {
			return nil, err
		}
		if IsValidUserPermission(permission) {
			permissions = append(permissions, permission)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return permissions, nil
}

func (s *UserStore) SetPermissions(ctx context.Context, userID int, permissions []UserPermission) error {
	normalized := make([]UserPermission, 0, len(permissions))
	seen := make(map[UserPermission]struct{}, len(permissions))
	for _, permission := range permissions {
		if !IsValidUserPermission(permission) {
			return errors.New("invalid user permission")
		}
		if _, ok := seen[permission]; ok {
			continue
		}
		seen[permission] = struct{}{}
		normalized = append(normalized, permission)
	}
	slices.Sort(normalized)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var exists bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id = ?)`, userID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return ErrUserNotFound
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM user_permissions WHERE user_id = ?`, userID); err != nil {
		return err
	}
	for _, permission := range normalized {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO user_permissions (user_id, permission)
			VALUES (?, ?)
		`, userID, permission); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *UserStore) HasPermission(ctx context.Context, userID int, permission UserPermission) (bool, error) {
	if !IsValidUserPermission(permission) {
		return false, errors.New("invalid user permission")
	}

	var exists bool
	err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM user_permissions
			WHERE user_id = ? AND permission = ?
		)
	`, userID, permission).Scan(&exists)
	return exists, err
}

func (s *UserStore) populatePermissions(ctx context.Context, user *User) error {
	permissions, err := s.ListPermissions(ctx, user.ID)
	if err != nil {
		return err
	}
	user.Permissions = permissions
	return nil
}
