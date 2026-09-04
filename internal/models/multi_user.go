package models

import (
	"context"
	"database/sql"
	"errors"
)

var (
	ErrLastAdmin         = errors.New("cannot remove the last administrator")
	ErrUserOwnsInstances = errors.New("cannot remove a user who owns instances")
)

// CreateWithRole creates an account in the multi-user store.
func (s *UserStore) CreateWithRole(ctx context.Context, username, passwordHash string, role UserRole) (*User, error) {
	user := User{Permissions: []UserPermission{}}
	err := s.db.QueryRowContext(ctx, `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING id, username, password_hash, role`, username, passwordHash, role).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.Role)
	if err != nil {
		if isUniqueConstraintError(err) {
			return nil, ErrUserAlreadyExists
		}
		return nil, err
	}
	return &user, nil
}

func (s *UserStore) GetWithRole(ctx context.Context, id int) (*User, error) {
	var user User
	err := s.db.QueryRowContext(ctx, `SELECT id, username, password_hash, role FROM users WHERE id = ?`, id).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.Role)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	if err := s.populatePermissions(ctx, &user); err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *UserStore) GetByUsernameWithRole(ctx context.Context, username string) (*User, error) {
	var user User
	err := s.db.QueryRowContext(ctx, `SELECT id, username, password_hash, role FROM users WHERE username = ?`, username).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.Role)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	if err := s.populatePermissions(ctx, &user); err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *UserStore) ListAccounts(ctx context.Context) ([]*User, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, username, role FROM users ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	result := make([]*User, 0)
	for rows.Next() {
		user := &User{}
		if err := rows.Scan(&user.ID, &user.Username, &user.Role); err != nil {
			return nil, err
		}
		result = append(result, user)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	for _, user := range result {
		if err := s.populatePermissions(ctx, user); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func (s *UserStore) UpdateRole(ctx context.Context, id int, role UserRole) error {
	if role != UserRoleAdmin && role != UserRoleUser {
		return errors.New("invalid user role")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var currentRole UserRole
	if err := tx.QueryRowContext(ctx, `SELECT role FROM users WHERE id = ?`, id).Scan(&currentRole); errors.Is(err, sql.ErrNoRows) {
		return ErrUserNotFound
	} else if err != nil {
		return err
	}
	if currentRole == UserRoleAdmin && role == UserRoleUser {
		var adminCount int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE role = ?`, UserRoleAdmin).Scan(&adminCount); err != nil {
			return err
		}
		if adminCount <= 1 {
			return ErrLastAdmin
		}
	}

	result, err := tx.ExecContext(ctx, `UPDATE users SET role = ? WHERE id = ?`, role, id)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrUserNotFound
	}
	return tx.Commit()
}

func (s *UserStore) UpdatePasswordForUser(ctx context.Context, id int, passwordHash string) error {
	result, err := s.db.ExecContext(ctx, `UPDATE users SET password_hash = ? WHERE id = ?`, passwordHash, id)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (s *UserStore) DeleteAccount(ctx context.Context, id int) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var role UserRole
	if err := tx.QueryRowContext(ctx, `SELECT role FROM users WHERE id = ?`, id).Scan(&role); errors.Is(err, sql.ErrNoRows) {
		return ErrUserNotFound
	} else if err != nil {
		return err
	}
	if role == UserRoleAdmin {
		var adminCount int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE role = ?`, UserRoleAdmin).Scan(&adminCount); err != nil {
			return err
		}
		if adminCount <= 1 {
			return ErrLastAdmin
		}
	}

	var instanceCount int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM instances WHERE owner_id = ?`, id).Scan(&instanceCount); err != nil {
		return err
	}
	if instanceCount > 0 {
		return ErrUserOwnsInstances
	}

	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		return err
	}
	if count <= 1 {
		return errors.New("cannot delete the last user")
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM api_keys WHERE user_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM instance_shares WHERE user_id = ? OR created_by = ?`, id, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM dashboard_settings WHERE user_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM filter_views WHERE user_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM client_settings WHERE user_id = ?`, id); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrUserNotFound
	}
	return tx.Commit()
}
