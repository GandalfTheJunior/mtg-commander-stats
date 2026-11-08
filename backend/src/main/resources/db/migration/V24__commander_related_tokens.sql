-- Additive, offline migration: legacy slots stay unknown and are not queued.
ALTER TABLE deck_commanders
    ADD COLUMN related_tokens TEXT,
    ADD COLUMN token_generation UUID,
    ADD COLUMN token_due_at TIMESTAMPTZ,
    ADD COLUMN token_attempts INTEGER NOT NULL DEFAULT 0 CHECK (token_attempts >= 0),
    ADD COLUMN token_claim UUID,
    ADD COLUMN token_last_failure TEXT;
CREATE INDEX deck_commanders_token_due_idx ON deck_commanders(token_due_at)
    WHERE related_tokens IS NULL AND token_due_at IS NOT NULL;
