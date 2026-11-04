-- Coordinated cutover only: deploy with the invitation frontend (#200), with traffic stopped.
-- Dropping the verifier permanently invalidates all reusable codes; no dual admission path exists.
ALTER TABLE play_groups DROP COLUMN join_code;

CREATE TABLE group_invitations (
    token_hash varchar(64) PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    group_id uuid NOT NULL REFERENCES play_groups(id) ON DELETE CASCADE,
    issuer_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    consumer_id uuid REFERENCES users(id),
    CHECK (expires_at = created_at + interval '24 hours'),
    CHECK ((consumed_at IS NULL) = (consumer_id IS NULL)),
    CHECK (consumed_at IS NULL OR (consumed_at >= created_at AND consumed_at < expires_at))
);
CREATE INDEX group_invitations_group_id_idx ON group_invitations(group_id);
