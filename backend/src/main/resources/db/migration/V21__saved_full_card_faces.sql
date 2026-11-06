-- Nullable JSON snapshots; old decks stay readable without a provider backfill.
ALTER TABLE deck_commanders ADD COLUMN card_faces TEXT;
ALTER TABLE deck_companions ADD COLUMN card_faces TEXT;
