ALTER TABLE group_memberships DROP CONSTRAINT group_memberships_role_valid;
ALTER TABLE group_memberships ADD CONSTRAINT group_memberships_role_valid
    CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER'));
