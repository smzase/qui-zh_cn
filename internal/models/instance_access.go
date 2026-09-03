package models

import (
	"context"
	"database/sql"
	"errors"
)

var (
	ErrInstanceShareSelf           = errors.New("cannot share instance with yourself")
	ErrInstanceShareTargetNotFound = errors.New("share target user not found")
)

func (s *InstanceStore) SetOwner(ctx context.Context, instanceID, ownerID int) error {
	result, err := s.db.ExecContext(ctx, "UPDATE instances SET owner_id = ? WHERE id = ?", ownerID, instanceID)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrInstanceNotFound
	}
	return nil
}

func (s *InstanceStore) OwnerID(ctx context.Context, instanceID int) (int, error) {
	return s.ownerID(ctx, instanceID)
}

func (s *InstanceStore) ownerID(ctx context.Context, instanceID int) (int, error) {
	var ownerID int
	err := s.db.QueryRowContext(ctx, "SELECT owner_id FROM instances WHERE id = ?", instanceID).Scan(&ownerID)
	if err == sql.ErrNoRows {
		return 0, ErrInstanceNotFound
	}
	return ownerID, err
}

func (s *InstanceStore) CanAccess(ctx context.Context, instanceID, userID int, admin bool) (bool, error) {
	if admin {
		_, err := s.ownerID(ctx, instanceID)
		if errors.Is(err, ErrInstanceNotFound) {
			return false, nil
		}
		return err == nil, err
	}
	var count int
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM instances i WHERE i.id = ? AND (i.owner_id = ? OR EXISTS (SELECT 1 FROM instance_shares sh WHERE sh.instance_id = i.id AND sh.user_id = ?))", instanceID, userID, userID).Scan(&count)
	return count > 0, err
}

func (s *InstanceStore) ListForUser(ctx context.Context, userID int, admin bool) ([]*Instance, error) {
	all, err := s.List(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]*Instance, 0, len(all))
	for _, instance := range all {
		ownerID, err := s.ownerID(ctx, instance.ID)
		if err != nil {
			return nil, err
		}
		instance.OwnerID = ownerID
		allowed, err := s.CanAccess(ctx, instance.ID, userID, admin)
		if err != nil {
			return nil, err
		}
		if allowed {
			result = append(result, instance)
		}
	}
	return result, nil
}

func (s *InstanceStore) Share(ctx context.Context, instanceID, targetUserID, createdBy int) error {
	if targetUserID <= 0 {
		return ErrInstanceShareTargetNotFound
	}
	ownerID, err := s.ownerID(ctx, instanceID)
	if err != nil {
		return err
	}
	if targetUserID == ownerID {
		return ErrInstanceShareSelf
	}
	var exists int
	if err := s.db.QueryRowContext(ctx, "SELECT 1 FROM users WHERE id = ?", targetUserID).Scan(&exists); err == sql.ErrNoRows {
		return ErrInstanceShareTargetNotFound
	} else if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, "INSERT INTO instance_shares (instance_id, user_id, created_by) VALUES (?, ?, ?) ON CONFLICT (instance_id, user_id) DO NOTHING", instanceID, targetUserID, createdBy)
	return err
}

func (s *InstanceStore) Unshare(ctx context.Context, instanceID, targetUserID int) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM instance_shares WHERE instance_id = ? AND user_id = ?", instanceID, targetUserID)
	return err
}

func (s *InstanceStore) ListShares(ctx context.Context, instanceID int) ([]int, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT user_id FROM instance_shares WHERE instance_id = ? ORDER BY user_id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := make([]int, 0)
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
