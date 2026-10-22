-- Existing snapshots remain readable offline; reselect an unused Commander to discover its pairing roles.
-- No invented/backfilled card rules and no network work during migration.
ALTER TABLE deck_commanders ADD COLUMN pairing TEXT;
