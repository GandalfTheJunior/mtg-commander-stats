package io.github.gandalfthejunior.mtgcommanderstats;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameParticipant;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.HttpStatus.CREATED;
import static org.springframework.http.HttpStatus.FORBIDDEN;
import static org.springframework.http.HttpStatus.OK;

class GameHistoryBatchingTest extends GameTestSupport {
    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Test
    void batchesHistoryReadsWithoutChangingOrderingOrHistoricalDisplay() throws Exception {
        Fixture f = fixture();
        assertThat(expect(f.owner(), "GET", f.path(), "", OK.value()).isEmpty()).isTrue();
        List<UUID> gameIds = new ArrayList<>();
        gameIds.add(id(expect(f.creator(), "POST", f.path(), body(f), CREATED.value())));

        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        boolean statisticsPreviouslyEnabled = statistics.isStatisticsEnabled();
        statistics.setStatisticsEnabled(true);
        try {
            // Each HTTP request has a fresh persistence context: a previous read cannot
            // initialize the next request's participant collections or cache its users/decks.
            statistics.clear();
            JsonNode single = expect(f.owner(), "GET", f.path(), "", OK.value());
            long singleGameStatements = statistics.getPrepareStatementCount();
            assertThat(single.size()).isEqualTo(1);
            assertThat(statistics.getEntityUpdateCount()).as("history must not write display decks").isZero();

            UUID alternateDeck = deck(f.member());
            List<GameParticipant> alternate = List.of(
                    new GameParticipant(f.owner().id(), f.ownerDeck()),
                    new GameParticipant(f.member().id(), alternateDeck));
            for (int i = 0; i < 5; i++) {
                String body = i % 2 == 0 ? body(alternate, "DRAW", null) : body(f);
                gameIds.add(id(expect(f.creator(), "POST", f.path(), body, CREATED.value())));
            }
            deckService.update(f.creator().id(), f.creatorDeck(), "Current deck name", CommanderTestProvider.inputs("Krenko", List.of("R")));
            deckService.archive(f.member().id(), f.memberDeck());
            groupService.leave(f.member().id(), f.groupId());
            jdbc.update("UPDATE users SET username = ? WHERE id = ?", "Current username", f.creator().id());
            jdbc.update("UPDATE games SET recorded_at = '2026-01-01T12:00:00Z' WHERE group_id = ?", f.groupId());
            jdbc.update("UPDATE games SET recorded_at = '2026-01-02T12:00:00Z' WHERE id = ?", gameIds.getFirst());

            Map<UUID, JsonNode> individualResponses = new HashMap<>();
            for (UUID gameId : gameIds) {
                individualResponses.put(gameId, expect(f.owner(), "GET", f.path() + "/" + gameId, "", OK.value()));
            }
            List<UUID> orderedIds = jdbc.query("""
                    SELECT id FROM games WHERE group_id = ? ORDER BY recorded_at DESC, id DESC
                    """, (row, index) -> row.getObject("id", UUID.class), f.groupId());

            statistics.clear();
            JsonNode history = expect(f.owner(), "GET", f.path(), "", OK.value());
            long multipleGameStatements = statistics.getPrepareStatementCount();
            assertThat(history.size()).isEqualTo(gameIds.size());
            assertThat(statistics.getEntityUpdateCount()).as("history must not write display decks").isZero();
            for (int i = 0; i < history.size(); i++) {
                JsonNode game = history.get(i);
                assertThat(id(game)).isEqualTo(orderedIds.get(i));
                assertThat(game).isEqualTo(individualResponses.get(id(game)));
                List<UUID> participantIds = new ArrayList<>();
                for (JsonNode participant : game.get("participants")) {
                    UUID userId = UUID.fromString(participant.get("userId").asText());
                    participantIds.add(userId);
                    if (userId.equals(f.creator().id())) {
                        assertThat(participant.get("username").asText()).isEqualTo("Current username");
                        assertThat(participant.get("deck").get("name").asText()).isEqualTo("Current deck name");
                    }
                    if (participant.get("deckId").asText().equals(f.memberDeck().toString())) {
                        assertThat(participant.get("deck").get("archived").asBoolean()).isTrue();
                    }
                }
                assertThat(participantIds).isSorted();
            }
            assertThat(history.toString()).doesNotContain("email", "password", "joinCode", "ownerId");
            assertThat(multipleGameStatements).as("SQL statements for six games versus one game")
                    .isEqualTo(singleGameStatements);
            // Group lock, requesting membership, games with participants, users, decks, Commander snapshots.
            assertThat(multipleGameStatements).isEqualTo(6);
            expect(f.member(), "GET", f.path(), "", FORBIDDEN.value());
            expect(f.outsider(), "GET", f.path(), "", FORBIDDEN.value());
        } finally {
            statistics.setStatisticsEnabled(statisticsPreviouslyEnabled);
        }
    }
}
