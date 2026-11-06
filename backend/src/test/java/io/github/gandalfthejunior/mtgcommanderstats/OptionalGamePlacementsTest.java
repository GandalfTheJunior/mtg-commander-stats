package io.github.gandalfthejunior.mtgcommanderstats;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataIntegrityViolationException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OptionalGamePlacementsTest extends GameTestSupport {
    @ParameterizedTest
    @ValueSource(ints = {2, 4, 6})
    void createsAndReplacesWinnerOnlyResultsWithoutInventingRanks(int size) throws Exception {
        Fixture f = fixture();
        ObjectNode request = normal(f, size);
        request.put("playedOn", "2000-02-29");
        JsonNode saved = expect(f.creator(), "POST", f.path(), request.toString(), 201);
        assertRead(f, request, saved);
        assertStatistics(f, saved);
        String path = f.path() + "/" + id(saved);
        // Full replacement may add a known last place, remove it, or keep it unknown.
        participant(request, 0).put("placement", size);
        JsonNode ranked = expect(f.creator(), "PUT", path, request.toString(), 200);
        assertRead(f, request, ranked);
        participant(request, 0).remove("placement");
        request.remove("playedOn");
        JsonNode unknown = expect(f.creator(), "PUT", path, request.toString(), 200);
        assertRead(f, request, unknown);
        assertThat(unknown.get("playedOn")).isEqualTo(saved.get("playedOn"));
        assertThat(unknown.get("recordedAt")).isEqualTo(saved.get("recordedAt"));
        request.putNull("playedOn");
        participant(request, 0).putNull("placement");
        JsonNode cleared = expect(f.creator(), "PUT", path, request.toString(), 200);
        assertRead(f, request, cleared);
        assertThat(cleared.get("playedOn").isNull()).isTrue();
        assertThat(cleared.get("recordedAt")).isEqualTo(saved.get("recordedAt"));
        assertStatistics(f, cleared);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM game_participants WHERE game_id = ? AND placement IS NULL",
                Integer.class, id(saved))).isEqualTo(size - 1);
        for (JsonNode p : saved.get("participants")) {
            assertThat(decks.findById(UUID.fromString(p.get("deckId").asText())).orElseThrow().isEverUsed()).isTrue();
        }
    }

    @Test
    void alternateUnknownEliminationsRoundTripAndCreditOnlyTheWinnerIncludingSeatAndColors() throws Exception {
        Fixture f = fixture();
        ObjectNode request = alternate(f);
        JsonNode saved = expect(f.owner(), "POST", f.path(), request.toString(), 201);
        assertRead(f, request, saved);
        assertStatistics(f, saved);
        // Two survivors at rank 2 require the next known rank to be at least 4.
        participant(request, 3).put("stillInGame", true).remove("placement");
        participant(request, 4).put("placement", 5);
        JsonNode replaced = expect(f.owner(), "PUT", f.path() + "/" + id(saved), request.toString(), 200);
        assertRead(f, request, replaced);
        assertStatistics(f, replaced);
        participant(request, 4).putNull("placement");
        assertRead(f, request, expect(f.owner(), "PUT", f.path() + "/" + id(saved), request.toString(), 200));
    }

    @Test
    void rejectsImpossibleRankingsMalformedValuesAndForbiddenNullFieldsAtomically() throws Exception {
        Fixture f = fixture();
        ObjectNode normal = normal(f, 6);
        JsonNode saved = expect(f.creator(), "POST", f.path(), normal.toString(), 201);
        List<ObjectNode> invalid = new ArrayList<>();
        for (String value : List.of("0", "-1", "7", "2147483648", "2.0", "2.5", "\"2\"", "true", "[]", "{}")) {
            ObjectNode wrong = normal.deepCopy();
            participant(wrong, 0).set("placement", json.readTree(value));
            invalid.add(wrong);
        }
        ObjectNode noWinner = normal.deepCopy(); participant(noWinner, 2).remove("placement"); invalid.add(noWinner);
        ObjectNode twoWinners = normal.deepCopy(); participant(twoWinners, 0).put("placement", 1); invalid.add(twoWinners);
        ObjectNode overlapping = normal.deepCopy();
        participant(overlapping, 0).put("placement", 2);
        participant(overlapping, 1).put("placement", 2);
        participant(overlapping, 3).put("placement", 3);
        invalid.add(overlapping);
        ObjectNode tooFewUnknown = normal.deepCopy();
        for (int i : List.of(0, 1, 3, 4)) { participant(tooFewUnknown, i).put("placement", 4); }
        invalid.add(tooFewUnknown);
        for (String field : List.of("winner", "stillInGame", "unknownField")) {
            ObjectNode wrong = normal.deepCopy(); participant(wrong, 0).putNull(field); invalid.add(wrong);
        }
        ObjectNode foreignWinner = normal.deepCopy(); foreignWinner.put("winnerUserId", f.outsider().id().toString()); invalid.add(foreignWinner);
        ObjectNode alt = toAlternate(normal);
        for (int index : List.of(1, 2)) {
            ObjectNode wrong = alt.deepCopy(); participant(wrong, index).putNull("placement"); invalid.add(wrong);
        }
        ObjectNode altOverlap = alt.deepCopy();
        participant(altOverlap, 3).put("stillInGame", true).remove("placement");
        participant(altOverlap, 4).put("placement", 3); invalid.add(altOverlap);
        for (String field : List.of("winner", "stillInGame")) {
            ObjectNode wrong = alt.deepCopy(); participant(wrong, 0).putNull(field); invalid.add(wrong);
        }
        ObjectNode draw = normal.deepCopy(); draw.put("result", "DRAW");
        for (JsonNode p : draw.get("participants")) {
            ((ObjectNode) p).remove("placement"); ((ObjectNode) p).put("stillInGame", true);
        }
        ObjectNode drawNull = draw.deepCopy(); participant(drawNull, 0).putNull("placement"); invalid.add(drawNull);
        ObjectNode drawAlternate = draw.deepCopy(); drawAlternate.put("alternateWinCon", true); invalid.add(drawAlternate);
        for (ObjectNode wrong : invalid) {
            expect(f.creator(), "POST", f.path(), wrong.toString(), 400);
            expect(f.creator(), "PUT", f.path() + "/" + id(saved), wrong.toString(), 400);
        }
        assertThat(games.count()).isEqualTo(1);
        assertRead(f, normal, saved);
        assertThat(decks.findById(f.outsiderDeck()).orElseThrow().isEverUsed()).isFalse();
        JsonNode drawn = expect(f.creator(), "PUT", f.path() + "/" + id(saved), draw.toString(), 200);
        assertThat(drawn.get("winnerUserId").isNull()).isTrue();
        assertRead(f, draw, drawn);
        assertStatistics(f, drawn);
    }

    @Test
    void permissionsHistoricalAssignmentsAndRollbackRemainIntactWithUnknownRanks() throws Exception {
        Fixture f = fixture();
        ObjectNode request = normal(f, 2);
        JsonNode saved = expect(f.creator(), "POST", f.path(), request.toString(), 201);
        String path = f.path() + "/" + id(saved);
        expect(f.member(), "PUT", path, request.toString(), 403);
        expect(f.outsider(), "PUT", path, request.toString(), 403);
        expect(null, "GET", path, "", 401);
        // CSRF rejection precedes authentication on a write with no session/token.
        expect(null, "PUT", path, request.toString(), 403);
        expect(new Actor(f.creator().cookie(), null, f.creator().id()), "PUT", path, request.toString(), 403);
        UUID otherGroup = id(expect(f.owner(), "POST", "/api/groups", "{\"name\":\"Other\"}", 201));
        expect(f.owner(), "PUT", "/api/groups/" + otherGroup + "/games/" + id(saved), request.toString(), 404);
        ObjectNode ineligible = request.deepCopy();
        participant(ineligible, 0).put("userId", f.outsider().id().toString()).put("deckId", f.outsiderDeck().toString());
        expect(f.owner(), "PUT", path, ineligible.toString(), 400);
        ObjectNode incomplete = request.deepCopy(); ((ArrayNode) incomplete.get("participants")).remove(0);
        expect(f.owner(), "PUT", path, incomplete.toString(), 400);
        assertRead(f, request, saved);
        expect(f.creator(), "POST", "/api/decks/" + f.creatorDeck() + "/archive", "", 200);
        groupService.leave(f.member().id(), f.groupId());
        assertRead(f, request, expect(f.creator(), "PUT", path, request.toString(), 200));
        groupService.leave(f.creator().id(), f.groupId());
        expect(f.creator(), "PUT", path, request.toString(), 403);
        JsonNode preserved = expect(f.owner(), "PUT", path, request.toString(), 200);
        assertRead(f, request, preserved);
        assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
            jdbc.update("UPDATE game_participants SET placement = NULL WHERE game_id = ?", id(saved));
            jdbc.update("UPDATE decks SET ever_used = true WHERE id = ?", f.outsiderDeck());
        })).isInstanceOf(DataIntegrityViolationException.class);
        assertRead(f, request, preserved);
        assertThat(decks.findById(f.outsiderDeck()).orElseThrow().isEverUsed()).isFalse();
    }

    @Test
    void deferredDatabaseChecksAcceptOnlyCompletablePartialRankingsAndPreserveWinnerRules() throws Exception {
        Fixture f = fixture();
        JsonNode saved = expect(f.owner(), "POST", f.path(), normal(f, 6).toString(), 201);
        UUID game = id(saved);
        for (Integer[] ranks : List.of(
                new Integer[] {1, null, null, null, null, null},
                new Integer[] {1, 2, 2, 4, 5, 6},
                new Integer[] {1, 3, 3, null, 5, null},
                new Integer[] {1, 2, 2, null, 5, null},
                new Integer[] {1, 6, null, null, null, null})) {
            assertThatCode(() -> databaseRanks(game, ranks)).doesNotThrowAnyException();
            assertThat(jdbc.queryForList("SELECT placement FROM game_participants WHERE game_id = ? ORDER BY start_position",
                    Integer.class, game)).containsExactly(ranks);
        }
        List<Integer> before = jdbc.queryForList("SELECT placement FROM game_participants WHERE game_id = ? ORDER BY start_position",
                Integer.class, game);
        for (Integer[] ranks : List.of(
                new Integer[] {1, 2, 2, 3, null, null},
                new Integer[] {1, 4, 4, 4, 4, null},
                new Integer[] {1, 1, null, null, null, null},
                new Integer[] {null, null, null, null, null, null},
                new Integer[] {1, 7, null, null, null, null},
                new Integer[] {1, 0, null, null, null, null})) {
            assertThatThrownBy(() -> databaseRanks(game, ranks)).isInstanceOf(DataIntegrityViolationException.class);
            assertThat(jdbc.queryForList("SELECT placement FROM game_participants WHERE game_id = ? ORDER BY start_position",
                    Integer.class, game)).isEqualTo(before);
        }
        transactions.executeWithoutResult(status -> {
            jdbc.update("UPDATE games SET alternate_win_con = true WHERE id = ?", game);
            jdbc.update("UPDATE game_participants SET placement = NULL, winner = CASE WHEN start_position = 1 THEN true END, "
                    + "still_in_game = CASE WHEN start_position > 1 THEN start_position IN (2, 3) END WHERE game_id = ?", game);
        });
        assertThatCode(() -> jdbc.update("UPDATE game_participants SET placement = 5 WHERE game_id = ? AND start_position = 6", game))
                .doesNotThrowAnyException();
        for (String change : List.of("placement = 3", "placement = 2", "winner = true", "winner = false", "still_in_game = NULL")) {
            assertThatThrownBy(() -> jdbc.update("UPDATE game_participants SET " + change + " WHERE game_id = ? AND start_position = 6", game))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
        assertThatThrownBy(() -> jdbc.update("UPDATE game_participants SET still_in_game = false WHERE game_id = ? AND still_in_game = true", game))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE game_participants SET placement = 2 WHERE game_id = ? AND start_position = 2", game))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE game_participants SET placement = 1 WHERE game_id = ? AND start_position = 1", game))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private void databaseRanks(UUID game, Integer[] ranks) {
        transactions.executeWithoutResult(status -> {
            for (int i = 0; i < ranks.length; i++) {
                jdbc.update("UPDATE game_participants SET placement = ? WHERE game_id = ? AND start_position = ?", ranks[i], game, i + 1);
            }
        });
    }

    private ObjectNode normal(Fixture f, int size) throws Exception {
        List<Actor> actors = new ArrayList<>(List.of(f.creator(), f.member(), f.owner()));
        List<UUID> deckIds = new ArrayList<>(List.of(f.creatorDeck(), f.memberDeck(), f.ownerDeck()));
        for (int i = 3; i < size; i++) {
            Actor actor = register("player" + i, "Player " + i);
            groupService.join(actor.id(), groupService.createInvitation(f.owner().id(), f.groupId()).code());
            actors.add(actor); deckIds.add(deck(actor));
        }
        ObjectNode request = json.createObjectNode().put("result", "WIN").put("alternateWinCon", false);
        ArrayNode participants = request.putArray("participants");
        for (int i = 0; i < size; i++) {
            ObjectNode p = participants.addObject().put("userId", actors.get(i).id().toString())
                    .put("deckId", deckIds.get(i).toString()).put("startPosition", size - i);
            if (i == Math.min(2, size - 1)) { p.put("placement", 1); }
            else if (i % 2 == 0) { p.putNull("placement"); }
        }
        return request;
    }

    private ObjectNode alternate(Fixture f) throws Exception {
        return toAlternate(normal(f, 6));
    }

    private ObjectNode toAlternate(ObjectNode normal) {
        ObjectNode request = normal.deepCopy().put("alternateWinCon", true);
        for (int i = 0; i < request.get("participants").size(); i++) {
            ObjectNode p = participant(request, i);
            p.remove("placement");
            if (i == 2) { p.put("winner", true); }
            else {
                p.put("stillInGame", i == 1);
                if (i != 1 && i % 2 == 0) { p.putNull("placement"); }
            }
        }
        return request;
    }

    private ObjectNode participant(ObjectNode request, int index) {
        return (ObjectNode) request.get("participants").get(index);
    }

    private void assertRead(Fixture f, ObjectNode request, JsonNode saved) throws Exception {
        assertThat(expect(f.owner(), "GET", f.path() + "/" + id(saved), "", 200)).isEqualTo(saved);
        assertThat(expect(f.owner(), "GET", f.path(), "", 200)).containsExactly(saved);
        boolean draw = request.get("result").asText().equals("DRAW");
        boolean alternate = request.get("alternateWinCon").asBoolean();
        for (JsonNode supplied : request.get("participants")) {
            JsonNode actual = saved.get("participants").valueStream()
                    .filter(p -> p.get("userId").equals(supplied.get("userId"))).findFirst().orElseThrow();
            assertThat(actual.get("startPosition")).isEqualTo(supplied.get("startPosition"));
            boolean winner = !draw && (alternate ? supplied.path("winner").asBoolean() : supplied.path("placement").asInt() == 1);
            if (winner) { assertThat(saved.get("winnerUserId")).isEqualTo(supplied.get("userId")); }
            Integer rank = null;
            if (!draw) {
                if (alternate && winner) { rank = 1; }
                else if (alternate && supplied.path("stillInGame").asBoolean()) { rank = 2; }
                else if (supplied.hasNonNull("placement")) { rank = supplied.get("placement").asInt(); }
            }
            assertThat(actual.has("placement")).isTrue();
            if (rank == null) { assertThat(actual.get("placement").isNull()).isTrue(); }
            else { assertThat(actual.get("placement").asInt()).isEqualTo(rank); }
            assertThat(actual.get("stillInGame").asBoolean()).isEqualTo(winner || supplied.path("stillInGame").asBoolean());
        }
    }

    private void assertStatistics(Fixture f, JsonNode game) throws Exception {
        JsonNode stats = expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", 200);
        String winner = game.get("winnerUserId").asText();
        int totalWins = game.get("result").asText().equals("WIN") ? 1 : 0;
        for (String kind : List.of("players", "decks")) {
            for (JsonNode row : stats.get(kind)) {
                boolean won = row.get(kind.equals("players") ? "userId" : "ownerUserId").asText().equals(winner);
                assertThat(row.get("games").asInt()).isEqualTo(1);
                assertThat(row.get("wins").asInt()).isEqualTo(won ? 1 : 0);
                assertThat(row.get("winRatePercent").asDouble()).isEqualTo(won ? 100 : 0);
            }
        }
        int winnerSeat = game.get("participants").valueStream().filter(p -> p.get("userId").asText().equals(winner))
                .mapToInt(p -> p.get("startPosition").asInt()).findFirst().orElse(0);
        for (JsonNode table : stats.get("startPositions")) {
            for (JsonNode seat : table.get("seats")) {
                boolean played = table.get("playerCount").asInt() == game.get("participants").size();
                assertThat(seat.get("games").asInt()).isEqualTo(played ? 1 : 0);
                assertThat(seat.get("wins").asInt()).isEqualTo(played && seat.get("startPosition").asInt() == winnerSeat ? 1 : 0);
            }
        }
        for (JsonNode color : stats.get("manaColors")) {
            boolean red = color.get("color").asText().equals("R");
            assertThat(color.get("games").asInt()).isEqualTo(red ? game.get("participants").size() : 0);
            assertThat(color.get("wins").asInt()).isEqualTo(red ? totalWins : 0);
        }
    }
}
