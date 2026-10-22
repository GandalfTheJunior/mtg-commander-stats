-- Legacy local decks are disposable; reset a local database explicitly before upgrading.
-- Refuse populated legacy databases rather than inventing identities or deleting data.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM decks) THEN
        RAISE EXCEPTION 'Legacy decks require an explicit local/dev database reset; no automatic backfill is supported';
    END IF;
END $$;

ALTER TABLE decks DROP COLUMN commander;
CREATE TABLE deck_commanders (
    deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position IN (1, 2)),
    oracle_id UUID NOT NULL,
    name TEXT NOT NULL CHECK (display_text_nonblank(name)),
    gameplay_face_index INTEGER CHECK (gameplay_face_index >= 0),
    base_color_identity TEXT NOT NULL CHECK (base_color_identity ~ '^W?U?B?R?G?$'),
    requires_chosen_color BOOLEAN NOT NULL,
    can_be_sole_commander BOOLEAN NOT NULL,
    chosen_color CHAR(1) CHECK (chosen_color IN ('W', 'U', 'B', 'R', 'G')),
    scryfall_card_id UUID NOT NULL,
    artwork_face_index INTEGER CHECK (artwork_face_index >= 0),
    art_crop_url TEXT,
    illustration_id TEXT,
    artist TEXT,
    scryfall_uri TEXT,
    PRIMARY KEY (deck_id, position),
    UNIQUE (deck_id, oracle_id),
    CHECK (requires_chosen_color = (chosen_color IS NOT NULL))
);
