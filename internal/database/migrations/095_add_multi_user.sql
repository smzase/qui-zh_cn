-- Copyright (c) 2026, s0up and the autobrr contributors.
-- SPDX-License-Identifier: GPL-2.0-or-later

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
SELECT id, username, password_hash, 'admin', created_at, updated_at
FROM "user"
WHERE NOT EXISTS (SELECT 1 FROM users);

CREATE TRIGGER IF NOT EXISTS update_users_updated_at
AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

ALTER TABLE instances ADD COLUMN owner_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_instances_owner_id ON instances(owner_id);

ALTER TABLE api_keys ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

CREATE TABLE IF NOT EXISTS instance_shares (
    instance_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_by INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (instance_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_instance_shares_user_id ON instance_shares(user_id);

DROP VIEW IF EXISTS instances_view;
CREATE VIEW instances_view AS
SELECT i.id, i.owner_id, i.client_type, n.value AS name, h.value AS host,
       u.value AS username, i.password_encrypted, i.api_key_encrypted,
       bu.value AS basic_username, i.basic_password_encrypted,
       i.tls_skip_verify, i.sort_order, i.is_active,
       i.has_local_filesystem_access, i.use_hardlinks, i.hardlink_base_dir,
       i.hardlink_dir_preset, i.use_reflinks, i.fallback_to_regular_mode
FROM instances i
LEFT JOIN string_pool n ON i.name_id = n.id
LEFT JOIN string_pool h ON i.host_id = h.id
LEFT JOIN string_pool u ON i.username_id = u.id
LEFT JOIN string_pool bu ON i.basic_username_id = bu.id;
