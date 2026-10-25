package io.github.gandalfthejunior.mtgcommanderstats;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.game.domain.Game;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameParticipant;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameResult;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

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
        empty(statistics(f.member(), f.groupId()), null);
        groupService.leave(f.member().id(), f.groupId());
        expect(f.member(), "GET", path, "", FORBIDDEN.value());
        assertThat(games.count()).isZero();
    }

    @Test
    void aggregatesDedicatedFixturesAndKeepsTheSamePlayersAndDecksIndependentAcrossGroups() throws Exception {
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
        counts(find(friday.get("players"), "userId", f.owner().id().toString()), 12, 6, "50");
        counts(find(friday.get("players"), "userId", f.creator().id().toString()), 12, 1, "8.33");
        counts(find(friday.get("decks"), "deckId", dragons.toString()), 6, 6, "100");
        counts(find(friday.get("decks"), "deckId", constructs.toString()), 6, 0, "0");
        counts(find(friday.get("players"), "userId", f.member().id().toString()), 12, 0, "0");
        counts(find(friday.get("decks"), "deckId", f.memberDeck().toString()), 12, 0, "0");
        JsonNode independent = statistics(f.creator(), sunday);
        assertThat(independent.get("players").size()).isEqualTo(2);
        assertThat(independent.get("decks").size()).isEqualTo(2);
        counts(find(independent.get("players"), "userId", f.owner().id().toString()), 3, 0, "0");
        counts(find(independent.get("players"), "userId", f.creator().id().toString()), 3, 1, "33.33");
        counts(find(independent.get("decks"), "deckId", dragons.toString()), 3, 0, "0");
        counts(find(independent.get("decks"), "deckId", f.creatorDeck().toString()), 3, 1, "33.33");
        sections(friday, null);
        sections(independent, null);
        counts(friday.get("startPositions").get(1).get("seats").get(0), 12, 6, "50");
        zero(friday.get("startPositions").get(0).get("seats").get(0));
        counts(independent.get("startPositions").get(0).get("seats").get(1), 3, 1, "33.33");
        counts(find(friday.get("manaColors"), "color", "R"), 30, 7, "23.33");
        counts(find(friday.get("manaColors"), "color", "W"), 6, 6, "100");
        counts(find(friday.get("manaColors"), "color", "C"), 6, 0, "0");
        counts(find(independent.get("manaColors"), "color", "R"), 6, 1, "16.67");
        counts(find(independent.get("manaColors"), "color", "W"), 3, 0, "0");
        zero(find(independent.get("manaColors"), "color", "C"));
        empty(filtered(f.owner(), f.groupId(), 2), 2);
        empty(filtered(f.owner(), sunday, 3), 3);
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
        for (JsonNode row : drawn.get("startPositions").get(0).get("seats")) {
            counts(row, 1, 0, "0");
        }
        counts(find(drawn.get("manaColors"), "color", "R"), 2, 0, "0");
        List<GameParticipant> changedPlayers = List.of(assignment(f.owner().id(), f.ownerDeck()), assignments(f).get(1));
        expect(f.creator(), "PUT", gamePath, body(changedPlayers, "WIN", f.owner().id()), OK.value());
        JsonNode replaced = statistics(f.owner(), f.groupId());
        assertThat(replaced.get("players").size()).isEqualTo(2);
        assertThat(replaced.toString()).doesNotContain(f.creator().id().toString(), alternative.toString());
        counts(find(replaced.get("players"), "userId", f.owner().id().toString()), 1, 1, "100");
        counts(find(replaced.get("decks"), "deckId", f.ownerDeck().toString()), 1, 1, "100");
        counts(replaced.get("startPositions").get(0).get("seats").get(0), 1, 1, "100");
        counts(find(replaced.get("manaColors"), "color", "R"), 2, 1, "50");
        expect(f.creator(), "DELETE", gamePath, "", NO_CONTENT.value());
        empty(statistics(f.owner(), f.groupId()), null);
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
            assertThat(result.size()).isEqualTo(4);
            sections(result, null);
            counts(find(result.get("manaColors"), "color", "R"), 17, 1, "5.88");
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
            sql.clear();
            JsonNode filtered = filtered(f.owner(), f.groupId(), 3);
            assertThat(sql.getPrepareStatementCount()).isEqualTo(singleStatements);
            counts(find(filtered.get("decks"), "deckId", f.memberDeck().toString()), 5, 0, "0");
            counts(find(filtered.get("manaColors"), "color", "R"), 15, 0, "0");
            assertThat(sql.getEntityUpdateCount()).isZero();
            assertThat(sql.getEntityInsertCount()).isZero();
            assertThat(sql.getEntityDeleteCount()).isZero();
            assertThat(sql.getCollectionUpdateCount()).isZero();
            expect(f.member(), "GET", path(f.groupId()), "", FORBIDDEN.value());
            expect(f.outsider(), "GET", path(f.groupId()), "", FORBIDDEN.value());
        } finally {
            sql.setStatisticsEnabled(previouslyEnabled);
        }
    }

    @Test
    void rejectsMalformedOrRepeatedFiltersAndDistinguishesEmptyFilteredHistory() throws Exception {
        Fixture f = fixture();
        for (String query : List.of("playerCount", "playerCount=", "playerCount=1", "playerCount=7",
                "playerCount=0", "playerCount=-2", "playerCount=2.0", "playerCount=2e0", "playerCount=all",
                "playerCount=02", "playerCount=%202", "playerCount=2%20", "playerCount=%2B2",
                "playerCount=2147483648", "playerCount=2,3", "playerCount=2&playerCount=2",
                "playerCount=2&playerCount=3", "playerCount=&playerCount=4")) {
            expect(f.owner(), "GET", path(f.groupId()) + "?" + query, "", BAD_REQUEST.value());
        }
        for (int n = 2; n <= 6; n++) {
            empty(filtered(f.owner(), f.groupId(), n), n);
        }
        expect(f.owner(), "POST", f.path(), body(f), CREATED.value());
        for (int n = 3; n <= 6; n++) {
            empty(filtered(f.owner(), f.groupId(), n), n);
        }
        expect(f.outsider(), "GET", path(f.groupId()) + "?playerCount=4", "", FORBIDDEN.value());
        expect(null, "GET", path(f.groupId()) + "?playerCount=4", "", UNAUTHORIZED.value());
    }

    @Test
    void sharesTheTableFilterAcrossAllFourDatasetsWithNormalAlternateAndDrawResults() throws Exception {
        Fixture f = fixture();
        Actor fourth = register("fourth", "Fourth");
        Actor fifth = register("fifth", "Fifth");
        Actor sixth = register("sixth", "Sixth");
        for (Actor actor : List.of(fourth, fifth, sixth)) {
            groupService.join(actor.id(), groupService.joinCode(f.owner().id(), f.groupId()));
        }
        List<Actor> actors = List.of(f.owner(), f.creator(), f.member(), fourth, fifth, sixth);
        List<List<String>> identities = List.of(List.of("W", "U", "B", "R", "G"), List.of("U", "G"),
                List.of(), List.of("R"), List.of("W"), List.of("U"));
        List<GameParticipant> assignments = new ArrayList<>();
        for (int i = 0; i < actors.size(); i++) {
            Actor actor = actors.get(i);
            UUID deck = id(expect(actor, "POST", "/api/decks", deckBody("Colors " + i, "Commander " + i,
                    identities.get(i)), CREATED.value()));
            assignments.add(assignment(actor.id(), deck));
        }
        for (int n = 2; n <= 6; n++) {
            List<GameParticipant> table = assignments.subList(0, n);
            ObjectNode normal = (ObjectNode) json.readTree(body(table, "WIN", f.owner().id()));
            List<JsonNode> unordered = new ArrayList<>();
            normal.get("participants").forEach(unordered::add);
            normal.set("participants", json.valueToTree(unordered.reversed()));
            expect(f.owner(), "POST", f.path(), normal.toString(), CREATED.value());
            ObjectNode alternate = (ObjectNode) json.readTree(body(table, "DRAW", null));
            alternate.put("result", "WIN").put("alternateWinCon", true);
            for (int seat = 0; seat < n; seat++) {
                ObjectNode participant = (ObjectNode) alternate.get("participants").get(seat);
                if (seat == n - 1) {
                    participant.remove("stillInGame");
                    participant.put("winner", true);
                }
            }
            expect(f.owner(), "POST", f.path(), alternate.toString(), CREATED.value());
            expect(f.owner(), "POST", f.path(), body(table, "DRAW", null), CREATED.value());
        }
        JsonNode all = statistics(f.owner(), f.groupId());
        assertThat(all.size()).isEqualTo(4);
        sections(all, null);
        for (int n = 2; n <= 6; n++) {
            JsonNode subset = filtered(f.owner(), f.groupId(), n);
            assertThat(subset.size()).isEqualTo(4);
            sections(subset, n);
            assertThat(subset.get("players").size()).isEqualTo(n);
            assertThat(subset.get("decks").size()).isEqualTo(n);
            assertThat(subset.get("startPositions").get(0)).isEqualTo(all.get("startPositions").get(n - 2));
            for (int seat = 0; seat < n; seat++) {
                boolean won = seat == 0 || seat == n - 1;
                counts(subset.get("startPositions").get(0).get("seats").get(seat), 3,
                        won ? 1 : 0, won ? "33.33" : "0");
                counts(find(subset.get("players"), "userId", actors.get(seat).id().toString()), 3,
                        won ? 1 : 0, won ? "33.33" : "0");
                counts(find(subset.get("decks"), "deckId", assignments.get(seat).getDeckId().toString()), 3,
                        won ? 1 : 0, won ? "33.33" : "0");
            }
            counts(find(subset.get("manaColors"), "color", "B"), 3, 1, "33.33");
            if (n == 2) {
                zero(find(subset.get("manaColors"), "color", "C"));
            } else {
                counts(find(subset.get("manaColors"), "color", "C"), 3, n == 3 ? 1 : 0,
                        n == 3 ? "33.33" : "0");
            }
        }
        assertThat(colors(all)).containsExactly("B", "W", "R", "U", "G", "C");
        String[] orderedColors = {"W", "U", "B", "R", "G", "C"};
        long[] games = {21, 33, 15, 24, 30, 12};
        long[] wins = {6, 7, 5, 6, 6, 1};
        String[] rates = {"28.57", "21.21", "33.33", "25", "20", "8.33"};
        for (int i = 0; i < orderedColors.length; i++) {
            counts(find(all.get("manaColors"), "color", orderedColors[i]), games[i], wins[i], rates[i]);
        }
        JsonNode four = filtered(f.owner(), f.groupId(), 4);
        assertThat(colors(four)).containsExactly("R", "W", "B", "U", "G", "C");
        long[] fourGames = {3, 6, 3, 6, 6, 3};
        long[] fourWins = {1, 1, 1, 2, 1, 0};
        String[] fourRates = {"33.33", "16.67", "33.33", "33.33", "16.67", "0"};
        for (int i = 0; i < orderedColors.length; i++) {
            counts(find(four.get("manaColors"), "color", orderedColors[i]), fourGames[i], fourWins[i], fourRates[i]);
        }
        String[] playerRates = {"33.33", "6.67", "8.33", "11.11", "16.67", "33.33"};
        for (int i = 0; i < actors.size(); i++) {
            long appearances = 3L * (i < 2 ? 5 : 6 - i);
            counts(find(all.get("players"), "userId", actors.get(i).id().toString()), appearances,
                    i == 0 ? 5 : 1, playerRates[i]);
            counts(find(all.get("decks"), "deckId", assignments.get(i).getDeckId().toString()), appearances,
                    i == 0 ? 5 : 1, playerRates[i]);
        }
    }

    @Test
    void sortsColorsByUnroundedRatiosBeforeGamesAndKeepsMeasuredZeroBeforeMissingColors() throws Exception {
        Fixture f = fixture();
        UUID white = id(expect(f.owner(), "POST", "/api/decks", deckBody("White", "White commander", List.of("W")), CREATED.value()));
        UUID blue = id(expect(f.creator(), "POST", "/api/decks", deckBody("Blue", "Blue commander", List.of("U")), CREATED.value()));
        // Dedicated persisted games keep this rounding-edge fixture independent of optional demo data.
        transactions.executeWithoutResult(status -> {
            List<Game> history = new ArrayList<>();
            for (int i = 0; i < 202; i++) {
                List<GameParticipant> participants = List.of(assignment(f.owner().id(), white),
                        assignment(f.creator().id(), blue), assignment(f.member().id(), f.memberDeck()));
                if (i == 201) {
                    participants = participants.subList(1, 3);
                }
                GameResult result = i < 2 ? GameResult.WIN : GameResult.DRAW;
                UUID winner = i == 0 ? f.owner().id() : i == 1 ? f.creator().id() : null;
                history.add(new Game(f.groupId(), f.owner().id(), complete(participants, result, winner), result, false));
            }
            games.saveAll(history);
        });
        JsonNode result = statistics(f.owner(), f.groupId());
        assertThat(colors(result)).containsExactly("W", "U", "R", "B", "G", "C");
        counts(find(result.get("manaColors"), "color", "W"), 201, 1, "0.50");
        counts(find(result.get("manaColors"), "color", "U"), 202, 1, "0.50");
        counts(find(result.get("manaColors"), "color", "R"), 202, 0, "0");
        for (String color : List.of("B", "G", "C")) {
            zero(find(result.get("manaColors"), "color", color));
        }
    }

    private JsonNode filtered(Actor actor, UUID groupId, int playerCount) throws Exception {
        return expect(new Actor(actor.cookie(), null, actor.id()), "GET", path(groupId) + "?playerCount=" + playerCount, "", OK.value());
    }

    private void empty(JsonNode result, Integer playerCount) {
        assertThat(result.size()).isEqualTo(4);
        assertThat(result.get("players").isArray()).isTrue();
        assertThat(result.get("players").isEmpty()).isTrue();
        assertThat(result.get("decks").isArray()).isTrue();
        assertThat(result.get("decks").isEmpty()).isTrue();
        sections(result, playerCount);
        for (JsonNode section : result.get("startPositions")) {
            for (JsonNode seat : section.get("seats")) {
                zero(seat);
            }
        }
        assertThat(colors(result)).containsExactly("W", "U", "B", "R", "G", "C");
        for (JsonNode color : result.get("manaColors")) {
            zero(color);
        }
    }

    private void sections(JsonNode result, Integer playerCount) {
        JsonNode sections = result.get("startPositions");
        assertThat(sections.isArray()).isTrue();
        assertThat(sections.size()).isEqualTo(playerCount == null ? 5 : 1);
        for (int index = 0; index < sections.size(); index++) {
            JsonNode section = sections.get(index);
            int n = playerCount == null ? index + 2 : playerCount;
            assertThat(section.size()).isEqualTo(2);
            assertThat(section.get("playerCount").isIntegralNumber()).isTrue();
            assertThat(section.get("playerCount").asInt()).isEqualTo(n);
            assertThat(section.get("seats").isArray()).isTrue();
            assertThat(section.get("seats").size()).isEqualTo(n);
            for (int seat = 1; seat <= n; seat++) {
                JsonNode row = section.get("seats").get(seat - 1);
                assertThat(row.size()).isEqualTo(4);
                assertThat(row.get("startPosition").isIntegralNumber()).isTrue();
                assertThat(row.get("startPosition").asInt()).isEqualTo(seat);
            }
        }
        assertThat(result.get("manaColors").isArray()).isTrue();
        assertThat(result.get("manaColors").size()).isEqualTo(6);
        for (JsonNode color : result.get("manaColors")) {
            assertThat(color.size()).isEqualTo(4);
        }
    }

    private List<String> colors(JsonNode result) {
        List<String> colors = new ArrayList<>();
        for (JsonNode color : result.get("manaColors")) {
            colors.add(color.get("color").asText());
        }
        return colors;
    }

    private void zero(JsonNode row) {
        assertThat(row.get("games").isIntegralNumber()).isTrue();
        assertThat(row.get("wins").isIntegralNumber()).isTrue();
        assertThat(row.get("games").asLong()).isZero();
        assertThat(row.get("wins").asLong()).isZero();
        assertThat(row.get("winRatePercent").isNull()).isTrue();
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
