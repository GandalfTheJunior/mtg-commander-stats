-- Quick profiles (#223): credential-less placeholder members of exactly one playgroup.
-- Existing rows become accounts; their constraints and authentication are unchanged.
ALTER TABLE users ADD COLUMN kind TEXT NOT NULL DEFAULT 'ACCOUNT';
ALTER TABLE users ADD COLUMN home_group_id UUID REFERENCES play_groups(id) ON DELETE CASCADE;
ALTER TABLE users ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT FALSE;
-- Stable per-group number that lets clients distinguish several anonymized profiles.
ALTER TABLE users ADD COLUMN deleted_number INTEGER;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN encoded_password DROP NOT NULL;

ALTER TABLE users ADD CONSTRAINT users_kind_valid CHECK (kind IN ('ACCOUNT', 'QUICK_PROFILE'));
ALTER TABLE users ADD CONSTRAINT users_kind_credentials CHECK (
    (kind = 'ACCOUNT' AND email IS NOT NULL AND encoded_password IS NOT NULL)
    OR (kind = 'QUICK_PROFILE' AND email IS NULL AND encoded_password IS NULL)
);
ALTER TABLE users ADD CONSTRAINT users_kind_home_group CHECK ((kind = 'QUICK_PROFILE') = (home_group_id IS NOT NULL));
ALTER TABLE users ADD CONSTRAINT users_deleted_quick_profile CHECK (NOT deleted OR kind = 'QUICK_PROFILE');
ALTER TABLE users ADD CONSTRAINT users_deleted_number CHECK (
    (deleted = (deleted_number IS NOT NULL)) AND (deleted_number IS NULL OR deleted_number > 0)
);
CREATE UNIQUE INDEX users_deleted_number_key ON users (home_group_id, deleted_number) WHERE deleted;

-- Global case-insensitive uniqueness (#214) applies to accounts only. Quick-profile
-- names are unique per group among non-anonymized profiles; accounts and quick
-- profiles may share a display name in both directions.
DROP INDEX users_username_canonical_key;
CREATE UNIQUE INDEX users_username_canonical_key ON users (canonical_username(username)) WHERE kind = 'ACCOUNT';
CREATE UNIQUE INDEX users_quick_profile_name_key ON users (home_group_id, canonical_username(username))
    WHERE kind = 'QUICK_PROFILE' AND NOT deleted;

-- A user's kind and home group are permanent.
CREATE FUNCTION keep_user_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.kind IS DISTINCT FROM OLD.kind OR NEW.home_group_id IS DISTINCT FROM OLD.home_group_id THEN
        RAISE EXCEPTION 'A user''s kind and home group cannot change.'
            USING ERRCODE = '23514', CONSTRAINT = 'users_kind_immutable';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER users_keep_kind BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION keep_user_kind();

-- At commit, every quick profile has exactly one membership: MEMBER in its home
-- group, active unless the profile is anonymized. No other membership may reference it.
CREATE FUNCTION verify_quick_profile_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    checked_ids UUID[];
    checked_id UUID;
    profile RECORD;
BEGIN
    IF TG_TABLE_NAME = 'users' THEN
        checked_ids := ARRAY[NEW.id];
    ELSIF TG_OP = 'DELETE' THEN
        checked_ids := ARRAY[OLD.user_id];
    ELSIF TG_OP = 'UPDATE' THEN
        checked_ids := ARRAY[OLD.user_id, NEW.user_id];
    ELSE
        checked_ids := ARRAY[NEW.user_id];
    END IF;
    FOREACH checked_id IN ARRAY checked_ids LOOP
        SELECT kind, home_group_id, deleted INTO profile FROM users WHERE id = checked_id;
        IF FOUND AND profile.kind = 'QUICK_PROFILE' AND (
            (SELECT count(*) FROM group_memberships WHERE user_id = checked_id) <> 1
            OR NOT EXISTS (
                SELECT 1 FROM group_memberships
                WHERE user_id = checked_id AND group_id = profile.home_group_id
                  AND role = 'MEMBER' AND active = NOT profile.deleted
            )
        ) THEN
            RAISE EXCEPTION 'Quick profile % must have exactly one MEMBER membership in its home group.', checked_id
                USING ERRCODE = '23514', CONSTRAINT = 'group_memberships_quick_profile_home_group';
        END IF;
    END LOOP;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER users_verify_quick_profile_membership
    AFTER INSERT OR UPDATE ON users
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION verify_quick_profile_membership();
CREATE CONSTRAINT TRIGGER group_memberships_verify_quick_profile
    AFTER INSERT OR UPDATE OR DELETE ON group_memberships
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION verify_quick_profile_membership();

-- Quick profiles never act: they cannot own groups, create games, issue or consume
-- invitations, or take part in ownership transfers. Arguments name the checked columns.
CREATE FUNCTION require_account_reference() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    checked_column TEXT;
    referenced UUID;
BEGIN
    FOREACH checked_column IN ARRAY TG_ARGV LOOP
        EXECUTE format('SELECT ($1).%I', checked_column) INTO referenced USING NEW;
        IF referenced IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = referenced AND kind <> 'ACCOUNT') THEN
            RAISE EXCEPTION '%.% must reference an account.', TG_TABLE_NAME, checked_column
                USING ERRCODE = '23514', CONSTRAINT = TG_TABLE_NAME || '_' || checked_column || '_account';
        END IF;
    END LOOP;
    RETURN NEW;
END $$;
CREATE TRIGGER play_groups_owner_account BEFORE INSERT OR UPDATE ON play_groups
    FOR EACH ROW EXECUTE FUNCTION require_account_reference('owner_id');
CREATE TRIGGER games_creator_account BEFORE INSERT OR UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION require_account_reference('creator_id');
CREATE TRIGGER group_invitations_account BEFORE INSERT OR UPDATE ON group_invitations
    FOR EACH ROW EXECUTE FUNCTION require_account_reference('issuer_id', 'consumer_id');
CREATE TRIGGER ownership_transfers_account BEFORE INSERT OR UPDATE ON ownership_transfers
    FOR EACH ROW EXECUTE FUNCTION require_account_reference('requester_id', 'target_id');
