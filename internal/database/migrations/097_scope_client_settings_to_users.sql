-- Store client preferences independently for each account. Existing settings
-- belong to the initial administrator (user ID 1).
CREATE TABLE client_settings_by_user (
    user_id INTEGER NOT NULL DEFAULT 1,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, key)
);

INSERT INTO client_settings_by_user (user_id, key, value, updated_at)
SELECT 1, key, value, updated_at
FROM client_settings;

DROP TABLE client_settings;
ALTER TABLE client_settings_by_user RENAME TO client_settings;
