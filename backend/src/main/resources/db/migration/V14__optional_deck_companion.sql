-- An absent row represents no Companion. Existing decks and snapshots remain untouched.
CREATE TABLE deck_companions (
    deck_id UUID PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
    oracle_id UUID NOT NULL,
    name TEXT NOT NULL CHECK (display_text_nonblank(name)),
    gameplay_face_index INTEGER CHECK (gameplay_face_index >= 0),
    base_color_identity TEXT NOT NULL CHECK (base_color_identity ~ '^W?U?B?R?G?$'),
    scryfall_card_id UUID NOT NULL,
    artwork_face_index INTEGER CHECK (artwork_face_index >= 0),
    art_crop_url TEXT,
    illustration_id TEXT,
    artist TEXT,
    scryfall_uri TEXT
);
