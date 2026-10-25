package io.github.gandalfthejunior.mtgcommanderstats;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameParticipant;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CREATED;
import static org.springframework.http.HttpStatus.FORBIDDEN;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.NO_CONTENT;
import static org.springframework.http.HttpStatus.OK;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

class GroupStatisticsTest extends GameTestSupport {
    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Test
    void requiresAuthenticatedActivePathGroupMembershipAndReturnsAnEmptyHistory() throws Exception {
        Fixture f = fixture();
        String path = path(f.groupId());
        expect(null, "GET", path, "", UNAUTHORIZED.value());
        expect(null, "GET", path("invalid"), "", UNAUTHORIZED.value());
        expect(f.owner(), "GET", path("not-a-uuid"), "", BAD_REQUEST.value());
        expect(f.owner(), "GET", path(UUID.randomUUID()), "", NOT_FOUND.value());
        expect(f.outsider(), "GET", path + "?actorId=" + f.owner().id() + "&userId=" + f.owner().id(), "", FORBIDDEN.value());
        assertThat(statistics(f.member(), f.groupId())).isEqualTo(json.readTree("{\"players\":[],\"decks\":[]}"));
        groupService.leave(f.member().id(), f.groupId());
        expect(f.member(), "GET", path, "", FORBIDDEN.value());
        assertThat(games.count()).isZero();
    }

    @Test
    void matchesRepresentativeDemoRatesAndKeepsTheSamePlayersAndDecksIndependentAcrossGroups() throws Exception {
        Fixture f = fixture();
        jdbc.update("UPDATE users SET username = 'Ada' WHERE id = ?", f.owner().id());
        jdbc.update("UPDATE users SET username = 'Emil' WHERE id = ?", f.creator().id());
        UUID dragons = id(expect(f.owner(), "POST", "/api/decks",
                deckBody("Dragon Engine", "The Ur-Dragon", List.of("W", "U", "B", "R", "G")), CREATED.value()));
        UUID constructs = id(expect(f.owner(), "POST", "/api/decks",
                deckBody("Patient Constructs", "Karn, Silver Golem", List.of()), CREATED.value()));
        for (int i = 0; i < 12; i++) {
            List<GameParticipant> participants = List.of(assignment(f.owner().id(), i < 6 ? dragons : constructs),
                    assignment(f.creator().id(), f.creatorDeck()), assignment(f.member().id(), f.memberDeck()));
            UUID winner = i < 6 ? f.owner().id() : i == 6 ? f.creator().id() : null;
            expect(f.owner(), "POST", f.path(), body(participants, winner == null ? "DRAW" : "WIN", winner), CREATED.value());
        }
        UUID sunday = groupService.create(f.owner().id(), "Sunday").id();
        groupService.join(f.creator().id(), groupService.joinCode(f.owner().id(), sunday));
        List<GameParticipant> shared = List.of(assignment(f.owner().id(), dragons),
                assignment(f.creator().id(), f.creatorDeck()));
        for (int i = 0; i < 3; i++) {
            expect(f.owner(), "POST", "/api/groups/" + sunday + "/games",
                    body(shared, i == 0 ? "WIN" : "DRAW", i == 0 ? f.creator().id() : null), CREATED.value());
        }
        JsonNode friday = statistics(f.owner(), f.groupId());
        assertThat(friday.get("players").size()).isEqualTo(3);
        assertThat(friday.get("decks").size()).isEqualTo(4);
        assertThat(friday.get("players").get(0).get("username").asText()).isEqualTo("Ada");
        assertThat(friday.get("players").get(1).get("username").asText()).isEqualTo("Emil");
        assertThat(friday.get("players").get(2).get("username").asText()).isEqualTo("Same Name");
        assertThat(friday.get("decks").get(0).get("name").asText()).isEqualTo("Dragon Engine");
        assertThat(friday.get("decks").get(1).get("name").asText()).isEqualTo("Patient Constructs");
        assertThat(friday.get("decks").get(2).get("ownerUsername").asText()).isEqualTo("Emil");
        assertThat(friday.get("decks").get(3).get("ownerUsername").asText()).isEqualTo("Same Name");
        assertThat(friday.get("decks").get(0).get("commanders").get(0).get("name").asText()).isEqualTo("The Ur-Dragon");
        JsonNode manifest = json.readTree(Files.readString(Path.of("..", "tools", "demo", "expected-results.json")));
        for (String name : List.of("Ada", "Dragon Engine", "Patient Constructs", "Emil")) {
            JsonNode expected = find(manifest.get("groups").get(0).get("rows"), "name", name);
            JsonNode actual = switch (name) {
                case "Ada" -> find(friday.get("players"), "userId", f.owner().id().toString());
                case "Emil" -> find(friday.get("players"), "userId", f.creator().id().toString());
                default -> find(friday.get("decks"), "name", name);
            };
            counts(actual, expected.get("games").asLong(), expected.get("wins").asLong(), expected.get("winRatePercent").asText());
        }
        counts(find(friday.get("players"), "userId", f.member().id().toString()), 12, 0, "0");
        counts(find(friday.get("decks"), "deckId", f.memberDeck().toString()), 12, 0, "0");
        JsonNode independent = statistics(f.creator(), sunday);
        assertThat(independent.get("players").size()).isEqualTo(2);
        assertThat(independent.get("decks").size()).isEqualTo(2);
        counts(find(independent.get("players"), "userId", f.owner().id().toString()), 3, 0, "0");
        counts(find(independent.get("players"), "userId", f.creator().id().toString()), 3, 1, "33.33");
        counts(find(independent.get("decks"), "deckId", dragons.toString()), 3, 0, "0");
        counts(find(independent.get("decks"), "deckId", f.creatorDeck().toString()), 3, 1, "33.33");
        assertThat(statistics(f.owner(), f.groupId())).isEqualTo(friday);
        assertThat(friday.toString()).doesNotContain(f.ownerDeck().toString(), f.outsider().id().toString());
        expect(f.member(), "GET", path(sunday), "", FORBIDDEN.value());
    }

    @Test
    void recomputesAfterReplacementAndDeletionAndOmitsEverUsedDecksWithoutCurrentGames() throws Exception {
        Fixture f = fixture();
        UUID gameId = id(expect(f.creator(), "POST", f.path(), body(f), CREATED.value()));
        String gamePath = f.path() + "/" + gameId;
        UUID alternative = deck(f.creator());
        counts(find(statistics(f.owner(), f.groupId()).get("decks"), "deckId", f.creatorDeck().toString()), 1, 1, "100");
        List<GameParticipant> changedDeck = List.of(assignment(f.creator().id(), alternative), assignments(f).get(1));
        expect(f.creator(), "PUT", gamePath, body(changedDeck, "WIN", f.member().id()), OK.value());
        JsonNode changed = statistics(f.owner(), f.groupId());
        assertThat(changed.get("decks").size()).isEqualTo(2);
        assertThat(changed.toString()).doesNotContain(f.creatorDeck().toString());
        counts(find(changed.get("players"), "userId", f.creator().id().toString()), 1, 0, "0");
        counts(find(changed.get("decks"), "deckId", alternative.toString()), 1, 0, "0");
        counts(find(changed.get("decks"), "deckId", f.memberDeck().toString()), 1, 1, "100");
        expect(f.creator(), "PUT", gamePath, body(changedDeck, "DRAW", null), OK.value());
        JsonNode drawn = statistics(f.owner(), f.groupId());
        for (JsonNode row : drawn.get("players")) {
            counts(row, 1, 0, "0");
        }
        for (JsonNode row : drawn.get("decks")) {
            counts(row, 1, 0, "0");
        }
        List<GameParticipant> changedPlayers = List.of(assignment(f.owner().id(), f.ownerDeck()), assignments(f).get(1));
        expect(f.creator(), "PUT", gamePath, body(changedPlayers, "WIN", f.owner().id()), OK.value());
        JsonNode replaced = statistics(f.owner(), f.groupId());
        assertThat(replaced.get("players").size()).isEqualTo(2);
        assertThat(replaced.toString()).doesNotContain(f.creator().id().toString(), alternative.toString());
        counts(find(replaced.get("players"), "userId", f.owner().id().toString()), 1, 1, "100");
        counts(find(replaced.get("decks"), "deckId", f.ownerDeck().toString()), 1, 1, "100");
        expect(f.creator(), "DELETE", gamePath, "", NO_CONTENT.value());
        assertThat(statistics(f.owner(), f.groupId())).isEqualTo(json.readTree("{\"players\":[],\"decks\":[]}"));
        for (UUID deckId : List.of(f.creatorDeck(), alternative, f.ownerDeck(), f.memberDeck())) {
            assertThat(decks.findById(deckId).orElseThrow().isEverUsed()).isTrue();
        }
    }

    @Test
    void preservesFormerMembersAndArchivedDecksWithCurrentNamesStableSortingAndReadOnlyBatchedQueries() throws Exception {
        Fixture f = fixture();
        expect(f.owner(), "POST", f.path(), body(f), CREATED.value());
        Statistics sql = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        boolean previouslyEnabled = sql.isStatisticsEnabled();
        sql.setStatisticsEnabled(true);
        try {
            sql.clear();
            statistics(f.owner(), f.groupId());
            long singleStatements = sql.getPrepareStatementCount();
            assertThat(sql.getEntityUpdateCount()).isZero();
            UUID alternate = deck(f.creator());
            List<GameParticipant> participants = List.of(assignment(f.creator().id(), alternate),
                    assignments(f).get(1), assignment(f.owner().id(), f.ownerDeck()));
            for (int i = 0; i < 5; i++) {
                expect(f.owner(), "POST", f.path(), body(participants, "DRAW", null), CREATED.value());
            }
            deckService.update(f.creator().id(), f.creatorDeck(), "Current name", CommanderTestProvider.inputs("Krenko", List.of("R")));
            deckService.archive(f.member().id(), f.memberDeck());
            groupService.leave(f.member().id(), f.groupId());
            // Current directory data must win over the session's original username.
            jdbc.update("UPDATE users SET username = 'Same Name' WHERE id = ?", f.owner().id());
            sql.clear();
            JsonNode result = statistics(f.owner(), f.groupId());
            assertThat(sql.getPrepareStatementCount()).isEqualTo(singleStatements).isEqualTo(6);
            assertThat(sql.getEntityUpdateCount()).isZero();
            assertThat(sql.getEntityInsertCount()).isZero();
            assertThat(sql.getEntityDeleteCount()).isZero();
            assertThat(sql.getCollectionUpdateCount()).isZero();
            assertThat(result.size()).isEqualTo(2);
            List<UUID> playerOrder = new ArrayList<>();
            for (JsonNode row : result.get("players")) {
                assertThat(row.size()).isEqualTo(5);
                assertThat(row.get("username").asText()).isEqualTo("Same Name");
                playerOrder.add(UUID.fromString(row.get("userId").asText()));
            }
            assertThat(playerOrder).containsExactlyElementsOf(List.of(f.owner().id(), f.creator().id(), f.member().id())
                    .stream().sorted().toList());
            List<JsonNode> deckOrder = new ArrayList<>();
            for (JsonNode row : result.get("decks")) {
                assertThat(row.size()).isEqualTo(9);
                assertThat(row.get("ownerUsername").asText()).isEqualTo("Same Name");
                assertThat(row.get("commanders").get(0).get("name").asText()).isEqualTo("Krenko");
                assertThat(row.get("commanders").get(0).get("artCropUrl").isNull()).isTrue();
                assertThat(row.get("archived").isBoolean()).isTrue();
                assertThat(row.get("ownerUserId").asText()).isIn(playerOrder.stream().map(UUID::toString).toList());
                deckOrder.add(row);
            }
            assertThat(deckOrder).isSortedAccordingTo(Comparator.comparing((JsonNode row) -> row.get("ownerUsername").asText())
                    .thenComparing(row -> row.get("name").asText())
                    .thenComparing(row -> UUID.fromString(row.get("deckId").asText())));
            JsonNode formerDeck = find(result.get("decks"), "deckId", f.memberDeck().toString());
            assertThat(formerDeck.get("ownerUserId").asText()).isEqualTo(f.member().id().toString());
            assertThat(formerDeck.get("archived").asBoolean()).isTrue();
            counts(formerDeck, 6, 0, "0");
            assertThat(find(result.get("decks"), "deckId", f.creatorDeck().toString()).get("name").asText()).isEqualTo("Current name");
            assertThat(result.toString()).doesNotContain("email", "password", "joinCode", "everUsed");
            expect(f.member(), "GET", path(f.groupId()), "", FORBIDDEN.value());
            expect(f.outsider(), "GET", path(f.groupId()), "", FORBIDDEN.value());
        } finally {
            sql.setStatisticsEnabled(previouslyEnabled);
        }
    }

    private JsonNode statistics(Actor actor, UUID groupId) throws Exception {
        return expect(new Actor(actor.cookie(), null, actor.id()), "GET", path(groupId), "", OK.value());
    }

    private String path(Object groupId) {
        return "/api/groups/" + groupId + "/statistics";
    }

    private JsonNode find(JsonNode rows, String field, String value) {
        for (JsonNode row : rows) {
            if (row.get(field).asText().equals(value)) {
                return row;
            }
        }
        throw new AssertionError("Missing statistics row: " + value);
    }

    private void counts(JsonNode row, long games, long wins, String percent) {
        assertThat(row.get("games").isIntegralNumber()).isTrue();
        assertThat(row.get("wins").isIntegralNumber()).isTrue();
        assertThat(row.get("winRatePercent").isNumber()).isTrue();
        assertThat(row.get("games").asLong()).isEqualTo(games);
        assertThat(row.get("wins").asLong()).isEqualTo(wins);
        assertThat(new BigDecimal(row.get("winRatePercent").asText())).isEqualByComparingTo(percent);
    }
}
