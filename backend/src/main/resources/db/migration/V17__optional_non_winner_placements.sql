-- Extend the existing deferred checks without rewriting or backfilling game facts.
-- Existing complete rankings remain valid; unknown non-winner ranks stay NULL.
CREATE OR REPLACE FUNCTION validate_game_record_v2() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    target UUID;
    mode TEXT;
    alternate BOOLEAN;
    n INTEGER;
    winners INTEGER;
    survivors INTEGER;
    ranks INTEGER[];
    unknown_count INTEGER;
    next_rank INTEGER := 1;
    rank_group RECORD;
    gap INTEGER;
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
                winner IS NULL AND still_in_game IS NULL
            WHEN winner IS TRUE THEN
                placement IS NULL AND still_in_game IS NULL
            ELSE winner IS NULL AND still_in_game IS NOT NULL AND
                ((still_in_game AND placement IS NULL) OR (NOT still_in_game AND (placement IS NULL OR placement > 2)))
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
    IF mode = 'WIN' THEN
        SELECT array_agg(CASE WHEN NOT alternate THEN placement WHEN winner IS TRUE THEN 1
            WHEN still_in_game THEN 2 ELSE placement END)
            INTO ranks FROM game_participants WHERE game_id = target;
        SELECT count(*) INTO unknown_count FROM unnest(ranks) AS r(place) WHERE place IS NULL;
        FOR rank_group IN
            SELECT place, count(*) AS size FROM unnest(ranks) AS r(place)
            WHERE place IS NOT NULL GROUP BY place ORDER BY place
        LOOP
            -- A gap consumes unknown participants; known tie groups must never overlap.
            -- This checks existence of a completion only, without assigning missing ranks.
            gap := rank_group.place - next_rank;
            IF rank_group.place NOT BETWEEN 1 AND n OR gap < 0 OR gap > unknown_count THEN
                RAISE EXCEPTION 'Invalid partial standard competition ranks' USING ERRCODE = '23514';
            END IF;
            unknown_count := unknown_count - gap;
            next_rank := rank_group.place + rank_group.size;
        END LOOP;
    END IF;
    RETURN NULL;
END $$;
