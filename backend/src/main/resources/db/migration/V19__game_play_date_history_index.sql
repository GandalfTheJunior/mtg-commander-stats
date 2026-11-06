-- Supports bounded history ID reads in actual play-date order, including unknown dates.
CREATE INDEX games_group_play_date_history_index
    ON games(group_id, played_on DESC NULLS LAST, recorded_at DESC, id DESC);
