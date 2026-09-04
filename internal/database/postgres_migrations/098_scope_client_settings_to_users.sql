-- Store client preferences independently for each account. Existing settings
-- belong to the initial administrator (user ID 1).
ALTER TABLE client_settings
    ADD COLUMN user_id BIGINT NOT NULL DEFAULT 1;

ALTER TABLE client_settings
    DROP CONSTRAINT client_settings_pkey;

ALTER TABLE client_settings
    ADD PRIMARY KEY (user_id, key);
