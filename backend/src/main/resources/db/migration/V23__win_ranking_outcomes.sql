-- Keep historical partial results intact; enforce the new rule on changed games at commit.
CREATE OR REPLACE FUNCTION validate_game_record_v2() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    target UUID;
    mode TEXT;
    alternate BOOLEAN;
    n INTEGER;
    winners INTEGER;
    survivors INTEGER;
    unknown_outcomes INTEGER;
    ranks INTEGER[];
    next_rank INTEGER := 1;
    rank_group RECORD;
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
        SELECT 1 FROM game_participants WHERE game_id = target AND NOT (
            CASE WHEN mode = 'DRAW' THEN
                placement IS NULL AND winner IS NULL AND still_in_game IS NOT NULL
            WHEN NOT alternate THEN
                winner IS NULL AND still_in_game IS NULL
            WHEN winner IS TRUE THEN
                placement IS NULL AND still_in_game IS NULL
            ELSE winner IS NULL AND CASE
                WHEN still_in_game IS NULL THEN placement IS NULL
                WHEN still_in_game THEN placement IS NULL
                ELSE placement IS NULL OR placement > 2
            END
            END
        )
    ) THEN
        RAISE EXCEPTION 'Invalid mode-specific game facts' USING ERRCODE = '23514';
    END IF;
    SELECT count(*) FILTER (WHERE CASE WHEN alternate THEN winner IS TRUE ELSE placement = 1 END),
           count(*) FILTER (WHERE still_in_game IS TRUE),
           count(*) FILTER (WHERE CASE WHEN alternate THEN winner IS NOT TRUE AND still_in_game IS NULL
                                    ELSE placement IS NULL END)
        INTO winners, survivors, unknown_outcomes FROM game_participants WHERE game_id = target;
    IF (mode = 'DRAW' AND survivors = 0)
        OR (mode = 'WIN' AND (winners <> 1 OR unknown_outcomes NOT IN (0, n - 1)
            OR (alternate AND unknown_outcomes = 0 AND survivors = 0))) THEN
        RAISE EXCEPTION 'Invalid game winner/outcome' USING ERRCODE = '23514';
    END IF;
    IF mode = 'WIN' AND unknown_outcomes = 0 THEN
        SELECT array_agg(CASE WHEN NOT alternate THEN placement WHEN winner IS TRUE THEN 1
            WHEN still_in_game THEN 2 ELSE placement END)
            INTO ranks FROM game_participants WHERE game_id = target;
        IF array_position(ranks, NULL) IS NOT NULL THEN
            RAISE EXCEPTION 'Incomplete game ranking' USING ERRCODE = '23514';
        END IF;
        FOR rank_group IN
            SELECT place, count(*) AS size FROM unnest(ranks) AS r(place)
            GROUP BY place ORDER BY place
        LOOP
            IF rank_group.place <> next_rank OR rank_group.place NOT BETWEEN 1 AND n THEN
                RAISE EXCEPTION 'Invalid standard competition ranks' USING ERRCODE = '23514';
            END IF;
            next_rank := rank_group.place + rank_group.size;
        END LOOP;
    END IF;
    RETURN NULL;
END $$;
