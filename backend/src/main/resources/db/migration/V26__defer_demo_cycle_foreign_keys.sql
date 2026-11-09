-- Keep ordinary writes immediate; the guarded Codespaces restore defers the two
-- sides of the quick-profile/group cycle only for its own transaction.
ALTER TABLE play_groups ALTER CONSTRAINT play_groups_owner_id_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE users ALTER CONSTRAINT users_home_group_id_fkey DEFERRABLE INITIALLY IMMEDIATE;
