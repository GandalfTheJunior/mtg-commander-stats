package io.github.gandalfthejunior.mtgcommanderstats.deck.persistence;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DeckClaimRepository {
    private final JdbcTemplate jdbc;

    public DeckClaimRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void lockOwners(UUID profileId, UUID accountId) {
        jdbc.query("SELECT id FROM decks WHERE owner_id IN (?, ?) ORDER BY id FOR UPDATE",
                (row, index) -> row.getObject(1, UUID.class), profileId, accountId);
    }

    public void move(UUID profileId, UUID accountId) {
        jdbc.execute("SET CONSTRAINTS game_participants_deck_owner_fk DEFERRED");
        jdbc.update("UPDATE decks SET owner_id = ?, idempotency_key = NULL WHERE owner_id = ?", accountId, profileId);
    }
}
