CREATE TABLE play_groups (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    join_code VARCHAR(22) NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id),
    CONSTRAINT play_groups_name_nonblank CHECK (display_text_nonblank(name)),
    CONSTRAINT play_groups_join_code_format CHECK (join_code ~ '^[A-Za-z0-9_-]{22}$'),
    CONSTRAINT play_groups_join_code_unique UNIQUE (join_code)
);

CREATE TABLE group_memberships (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES play_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    role TEXT NOT NULL,
    active BOOLEAN NOT NULL,
    CONSTRAINT group_memberships_role_valid CHECK (role IN ('OWNER', 'MEMBER')),
    CONSTRAINT group_memberships_group_user_unique UNIQUE (group_id, user_id)
);

CREATE UNIQUE INDEX group_memberships_one_active_owner
    ON group_memberships(group_id)
    WHERE active AND role = 'OWNER';
CREATE INDEX group_memberships_active_user_index ON group_memberships(user_id) WHERE active;
CREATE INDEX group_memberships_active_group_index ON group_memberships(group_id) WHERE active;

CREATE FUNCTION verify_play_group_owner() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    checked_group_ids UUID[];
    checked_group_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'play_groups' THEN
        checked_group_ids := ARRAY[NEW.id];
    ELSIF TG_OP = 'DELETE' THEN
        checked_group_ids := ARRAY[OLD.group_id];
    ELSIF TG_OP = 'UPDATE' THEN
        -- A moved membership can invalidate its previous group as well.
        checked_group_ids := ARRAY[OLD.group_id, NEW.group_id];
    ELSE
        checked_group_ids := ARRAY[NEW.group_id];
    END IF;

    SELECT play_group.id INTO checked_group_id
        FROM play_groups play_group
        WHERE play_group.id = ANY(checked_group_ids)
          AND NOT EXISTS (
              SELECT 1
              FROM group_memberships membership
              WHERE membership.group_id = play_group.id
                AND membership.user_id = play_group.owner_id
                AND membership.role = 'OWNER'
                AND membership.active
          )
        LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Group % must have its designated active owner membership.', checked_group_id
            USING ERRCODE = '23514', CONSTRAINT = 'play_groups_active_owner_required';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER play_groups_verify_owner
    AFTER INSERT OR UPDATE ON play_groups
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION verify_play_group_owner();

CREATE CONSTRAINT TRIGGER group_memberships_verify_owner
    AFTER INSERT OR UPDATE OR DELETE ON group_memberships
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION verify_play_group_owner();
