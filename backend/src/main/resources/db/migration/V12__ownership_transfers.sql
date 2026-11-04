CREATE TABLE ownership_transfers (
    id uuid PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES play_groups(id) ON DELETE CASCADE,
    requester_id uuid NOT NULL REFERENCES users(id),
    target_id uuid NOT NULL REFERENCES users(id),
    state text NOT NULL CHECK (state IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED')),
    created_at timestamptz NOT NULL,
    resolved_at timestamptz,
    acknowledged_at timestamptz,
    CHECK (requester_id <> target_id),
    CHECK ((state = 'PENDING') = (resolved_at IS NULL)),
    CHECK (acknowledged_at IS NULL OR state IN ('ACCEPTED', 'DECLINED'))
);
CREATE UNIQUE INDEX ownership_transfers_one_pending ON ownership_transfers(group_id) WHERE state = 'PENDING';
CREATE INDEX ownership_transfers_notices ON ownership_transfers(group_id, requester_id, created_at, id)
    WHERE state IN ('ACCEPTED', 'DECLINED') AND acknowledged_at IS NULL;
