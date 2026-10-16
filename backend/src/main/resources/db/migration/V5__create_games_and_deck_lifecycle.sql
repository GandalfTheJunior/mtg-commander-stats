ALTER TABLE decks ADD COLUMN ever_used BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE decks ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;
-- A composite FK also protects participant/deck ownership independently of the API.
ALTER TABLE decks ADD CONSTRAINT decks_id_owner_unique UNIQUE (id, owner_id);

CREATE TABLE games (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES play_groups(id),
    creator_id UUID NOT NULL REFERENCES users(id),
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    result TEXT NOT NULL,
    winner_user_id UUID,
    CONSTRAINT games_result_valid CHECK (
        (result = 'WIN' AND winner_user_id IS NOT NULL)
        OR (result = 'DRAW' AND winner_user_id IS NULL)
    )
);
CREATE INDEX games_group_history_index ON games(group_id, recorded_at DESC, id DESC);

CREATE TABLE game_participants (
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    deck_id UUID NOT NULL,
    PRIMARY KEY (game_id, user_id),
    CONSTRAINT game_participants_deck_owner_fk FOREIGN KEY (deck_id, user_id) REFERENCES decks(id, owner_id)
);
CREATE INDEX game_participants_deck_index ON game_participants(deck_id);

-- Deferred because a game and its assignments are written/replaced in one transaction.
-- At commit, a winning user must be one of this game's participants.
ALTER TABLE games ADD CONSTRAINT games_winner_participant_fk
    FOREIGN KEY (id, winner_user_id) REFERENCES game_participants(game_id, user_id)
    DEFERRABLE INITIALLY DEFERRED;
