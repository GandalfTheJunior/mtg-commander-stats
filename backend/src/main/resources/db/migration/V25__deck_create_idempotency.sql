ALTER TABLE decks ADD COLUMN idempotency_key UUID;
ALTER TABLE decks ADD CONSTRAINT decks_owner_idempotency_key_unique UNIQUE (owner_id, idempotency_key);

ALTER TABLE deck_commanders ADD COLUMN usable_artwork_faces INTEGER CHECK (usable_artwork_faces >= 0);
ALTER TABLE deck_companions ADD COLUMN usable_artwork_faces INTEGER CHECK (usable_artwork_faces >= 0);
