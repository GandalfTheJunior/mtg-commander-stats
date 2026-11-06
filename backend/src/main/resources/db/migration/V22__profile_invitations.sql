-- A claim defers this constraint only for its transaction; other writers retain immediate validation.
ALTER TABLE game_participants DROP CONSTRAINT game_participants_deck_owner_fk;
ALTER TABLE game_participants ADD CONSTRAINT game_participants_deck_owner_fk
    FOREIGN KEY (deck_id, user_id) REFERENCES decks(id, owner_id)
    DEFERRABLE INITIALLY IMMEDIATE;

CREATE TABLE profile_invitations (
    token_hash varchar(64) PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    profile_id uuid REFERENCES users(id) ON DELETE SET NULL,
    group_id uuid NOT NULL REFERENCES play_groups(id) ON DELETE CASCADE,
    issuer_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    consumer_id uuid REFERENCES users(id),
    revoked_at timestamptz,
    CHECK (expires_at = created_at + interval '1 hour'),
    CHECK ((consumed_at IS NULL) = (consumer_id IS NULL)),
    CHECK (consumed_at IS NULL OR (consumed_at >= created_at AND consumed_at < expires_at)),
    CHECK (revoked_at IS NULL OR (revoked_at >= created_at AND consumed_at IS NULL))
);
CREATE UNIQUE INDEX profile_invitations_one_open_per_profile
    ON profile_invitations(profile_id) WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX profile_invitations_group_id_idx ON profile_invitations(group_id);
CREATE TRIGGER profile_invitations_account BEFORE INSERT OR UPDATE ON profile_invitations
    FOR EACH ROW EXECUTE FUNCTION require_account_reference('issuer_id', 'consumer_id');
