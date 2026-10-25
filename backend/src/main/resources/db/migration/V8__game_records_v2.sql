-- No reconstruction of historical gameplay facts is possible or authorized.
LOCK TABLE games, game_participants IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM games) THEN
        RAISE EXCEPTION 'Game Records v2 migration blocked: existing pre-upgrade games. Retain the database and request a migration plan, or explicitly reset an isolated disposable local demo database before retrying. No games have been changed.';
    END IF;
END $$;

ALTER TABLE games DROP CONSTRAINT games_winner_participant_fk;
ALTER TABLE games DROP CONSTRAINT games_result_valid;
ALTER TABLE games DROP COLUMN winner_user_id;
ALTER TABLE games ADD COLUMN alternate_win_con BOOLEAN NOT NULL;
ALTER TABLE games ADD CONSTRAINT games_result_valid CHECK (
    result IN ('WIN', 'DRAW') AND (result <> 'DRAW' OR NOT alternate_win_con)
);
ALTER TABLE game_participants ADD COLUMN start_position INTEGER NOT NULL;
ALTER TABLE game_participants ADD COLUMN placement INTEGER;
ALTER TABLE game_participants ADD COLUMN winner BOOLEAN;
ALTER TABLE game_participants ADD COLUMN still_in_game BOOLEAN;
ALTER TABLE game_participants ADD CONSTRAINT game_participants_seat_range CHECK (start_position BETWEEN 1 AND 6);
ALTER TABLE game_participants ADD CONSTRAINT game_participants_place_range CHECK (placement BETWEEN 1 AND 6);
ALTER TABLE game_participants ADD CONSTRAINT game_participants_winner_marker CHECK (winner IS NULL OR winner);
ALTER TABLE game_participants ADD CONSTRAINT game_participants_seat_unique UNIQUE (game_id, start_position) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE game_participants ADD CONSTRAINT game_participants_deck_unique UNIQUE (game_id, deck_id) DEFERRABLE INITIALLY DEFERRED;

-- Complete-game invariants are checked at commit, after atomic collection replacement.
CREATE FUNCTION validate_game_record_v2() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    target UUID;
    mode TEXT;
    alternate BOOLEAN;
    n INTEGER;
    winners INTEGER;
    survivors INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'games' THEN
        target := COALESCE(NEW.id, OLD.id);
    ELSE
        target := COALESCE(NEW.game_id, OLD.game_id);
    END IF;
    SELECT result, alternate_win_con INTO mode, alternate FROM games WHERE id = target;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT count(*) INTO n FROM game_participants WHERE game_id = target;
    IF n NOT BETWEEN 2 AND 6 OR EXISTS (
        SELECT 1 FROM game_participants WHERE game_id = target AND start_position > n
    ) THEN
        RAISE EXCEPTION 'Invalid complete game participants/start seats' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
        SELECT 1 FROM game_participants p WHERE game_id = target AND NOT (
            CASE WHEN mode = 'DRAW' THEN
                placement IS NULL AND winner IS NULL AND still_in_game IS NOT NULL
            WHEN NOT alternate THEN
                placement IS NOT NULL AND winner IS NULL AND still_in_game IS NULL
            WHEN winner IS TRUE THEN
                placement IS NULL AND still_in_game IS NULL
            ELSE winner IS NULL AND still_in_game IS NOT NULL AND
                ((still_in_game AND placement IS NULL) OR (NOT still_in_game AND placement > 2 AND placement IS NOT NULL))
            END
        )
    ) THEN
        RAISE EXCEPTION 'Invalid mode-specific game facts' USING ERRCODE = '23514';
    END IF;
    SELECT count(*) FILTER (WHERE CASE WHEN alternate THEN winner IS TRUE ELSE placement = 1 END),
           count(*) FILTER (WHERE still_in_game IS TRUE)
        INTO winners, survivors FROM game_participants WHERE game_id = target;
    IF (mode = 'DRAW' AND survivors = 0)
        OR (mode = 'WIN' AND (winners <> 1 OR (alternate AND survivors = 0))) THEN
        RAISE EXCEPTION 'Invalid game winner/survivors' USING ERRCODE = '23514';
    END IF;
    IF mode = 'WIN' AND EXISTS (
        WITH ranks AS (
            SELECT CASE WHEN NOT alternate THEN placement WHEN winner IS TRUE THEN 1
                WHEN still_in_game THEN 2 ELSE placement END AS place
            FROM game_participants WHERE game_id = target
        )
        SELECT 1 FROM ranks r WHERE place <> 1 + (SELECT count(*) FROM ranks better WHERE better.place < r.place)
    ) THEN
        RAISE EXCEPTION 'Invalid standard competition ranks' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER games_complete_record AFTER INSERT OR UPDATE ON games
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_game_record_v2();
CREATE CONSTRAINT TRIGGER participants_complete_record AFTER INSERT OR UPDATE OR DELETE ON game_participants
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_game_record_v2();
