package io.github.gandalfthejunior.mtgcommanderstats;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;

class GameRecordsV2Test extends GameTestSupport {
    @Test
    void roundTripsAllModesWithExplicitSeatsRanksAndNullKeysAndKeepsHistoricalAssignments() throws Exception {
        Fixture f = fixture();
        List<Map<String, Object>> pairs = new ArrayList<>();
        pairs.add(Map.of("userId", f.creator().id(), "deckId", f.creatorDeck(), "startPosition", 3, "placement", 1));
        pairs.add(Map.of("userId", f.member().id(), "deckId", f.memberDeck(), "startPosition", 1, "placement", 2));
        pairs.add(Map.of("userId", f.owner().id(), "deckId", f.ownerDeck(), "startPosition", 2, "placement", 2));
        Actor extra = register("fourth", "Fourth");
        groupService.join(extra.id(), groupService.joinCode(f.owner().id(), f.groupId()));
        pairs.add(Map.of("userId", extra.id(), "deckId", deck(extra), "startPosition", 4, "placement", 4));
        ObjectNode normal = (ObjectNode) json.valueToTree(Map.of("result", "WIN", "alternateWinCon", false, "participants", pairs));
        JsonNode saved = expect(f.owner(), "POST", f.path(), normal.toString(), 201);
        assertThat(saved.get("alternateWinCon").asBoolean()).isFalse();
        checkRead(f, saved);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM game_participants WHERE game_id = ? AND (winner IS NOT NULL OR still_in_game IS NOT NULL)", Long.class, id(saved))).isZero();
        for (JsonNode p : saved.get("participants")) {
            assertThat(p.get("stillInGame").asBoolean()).isEqualTo(p.get("placement").asInt() == 1);
        }
        expect(f.creator(), "POST", "/api/decks/" + f.creatorDeck() + "/archive", "", 200);
        groupService.leave(f.member().id(), f.groupId());
        String path = f.path() + "/" + id(saved);
        // Changing seats and winner must not reselect archived/former-member assignments.
        ObjectNode changed = normal.deepCopy();
        ((ObjectNode) changed.get("participants").get(0)).put("placement", 2).put("startPosition", 1);
        ((ObjectNode) changed.get("participants").get(1)).put("placement", 1).put("startPosition", 3);
        ((ObjectNode) changed.get("participants").get(2)).put("placement", 3);
        checkRead(f, expect(f.owner(), "PUT", path, changed.toString(), 200));

        ObjectNode alternate = normal.deepCopy();
        alternate.put("alternateWinCon", true);
        for (int i = 0; i < 3; i++) {
            ObjectNode p = (ObjectNode) alternate.get("participants").get(i);
            p.remove("placement");
            if (i == 0) { p.put("winner", true); }
            else { p.put("stillInGame", true); }
        }
        ((ObjectNode) alternate.get("participants").get(3)).put("stillInGame", false);
        JsonNode alt = expect(f.owner(), "PUT", path, alternate.toString(), 200);
        assertThat(alt.get("winnerUserId").asText()).isEqualTo(f.creator().id().toString());
        for (JsonNode p : alt.get("participants")) {
            int place = p.get("placement").asInt();
            assertThat(place).isIn(1, 2, 4);
            assertThat(p.get("stillInGame").asBoolean()).isEqualTo(place != 4);
        }
        checkRead(f, alt);
        JsonNode statistics = expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", 200);
        for (JsonNode player : statistics.get("players")) {
            assertThat(player.get("games").asInt()).isEqualTo(1);
            assertThat(player.get("wins").asInt()).isEqualTo(player.get("userId").asText().equals(f.creator().id().toString()) ? 1 : 0);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM game_participants WHERE game_id = ? AND placement IS NOT NULL", Long.class, id(alt))).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM game_participants WHERE game_id = ? AND winner IS TRUE AND still_in_game IS NULL", Long.class, id(alt))).isEqualTo(1);
        ObjectNode draw = alternate.deepCopy();
        draw.put("result", "DRAW").put("alternateWinCon", false);
        for (JsonNode item : draw.get("participants")) {
            ObjectNode p = (ObjectNode) item;
            p.remove("winner");
            p.remove("placement");
            p.put("stillInGame", p.get("startPosition").asInt() == 3);
        }
        JsonNode drawn = expect(f.owner(), "PUT", path, draw.toString(), 200);
        assertThat(drawn.has("winnerUserId")).isTrue();
        assertThat(drawn.get("winnerUserId").isNull()).isTrue();
        for (JsonNode p : drawn.get("participants")) {
            assertThat(p.has("placement")).isTrue();
            assertThat(p.get("placement").isNull()).isTrue();
        }
        checkRead(f, drawn);
        JsonNode drawnStatistics = expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", 200);
        for (JsonNode player : drawnStatistics.get("players")) {
            assertThat(player.get("wins").asInt()).isZero();
            assertThat(player.get("winRatePercent").asDouble()).isZero();
        }
    }

    @Test
    void rejectsIncompleteExtraneousAndWronglyTypedFieldsOnBothWriteRoutesAtomically() throws Exception {
        Fixture f = fixture();
        ObjectNode valid = (ObjectNode) json.readTree(body(f));
        JsonNode saved = expect(f.owner(), "POST", f.path(), valid.toString(), 201);
        List<ObjectNode> invalid = new ArrayList<>();
        for (String field : List.of("alternateWinCon", "result")) {
            ObjectNode missing = valid.deepCopy(); missing.remove(field); invalid.add(missing);
        }
        for (String value : List.of("null", "0", "\"false\"")) {
            ObjectNode wrongFlag = valid.deepCopy(); wrongFlag.set("alternateWinCon", json.readTree(value)); invalid.add(wrongFlag);
        }
        for (String field : List.of("winner", "stillInGame", "placement", "startPosition")) {
            for (String value : List.of("null", "false", "true", "1.5", "\"1\"", "0", "7")) {
                ObjectNode body = valid.deepCopy();
                ((ObjectNode) body.get("participants").get(0)).set(field, json.readTree(value));
                invalid.add(body);
            }
        }
        ObjectNode noSeat = valid.deepCopy(); ((ObjectNode) noSeat.get("participants").get(0)).remove("startPosition"); invalid.add(noSeat);
        ObjectNode seats = valid.deepCopy(); ((ObjectNode) seats.get("participants").get(0)).put("startPosition", 2); invalid.add(seats);
        ObjectNode winners = valid.deepCopy(); ((ObjectNode) winners.get("participants").get(1)).put("placement", 1); invalid.add(winners);
        ObjectNode oldWinner = valid.deepCopy(); oldWinner.putNull("winnerUserId"); invalid.add(oldWinner);
        ObjectNode draw = valid.deepCopy(); draw.put("result", "DRAW"); invalid.add(draw);
        ObjectNode alternate = valid.deepCopy(); alternate.put("alternateWinCon", true); invalid.add(alternate);
        ObjectNode altValid = valid.deepCopy();
        altValid.put("alternateWinCon", true);
        ObjectNode altWinner = (ObjectNode) altValid.get("participants").get(0);
        ObjectNode altOpponent = (ObjectNode) altValid.get("participants").get(1);
        altWinner.remove("placement"); altWinner.put("winner", true);
        altOpponent.remove("placement"); altOpponent.put("stillInGame", true);
        for (String field : List.of("placement", "stillInGame", "winner")) {
            ObjectNode contradictory = altValid.deepCopy();
            ((ObjectNode) contradictory.get("participants").get(0)).set(field, json.readTree(field.equals("placement") ? "1" : "false"));
            invalid.add(contradictory);
        }
        for (String field : List.of("placement", "winner", "stillInGame")) {
            ObjectNode contradictory = altValid.deepCopy();
            ((ObjectNode) contradictory.get("participants").get(1)).set(field, json.readTree(field.equals("placement") ? "2" : "false"));
            invalid.add(contradictory);
        }
        ObjectNode missingStatus = altValid.deepCopy();
        ((ObjectNode) missingStatus.get("participants").get(1)).remove("stillInGame"); invalid.add(missingStatus);
        ObjectNode twoWinners = altValid.deepCopy();
        ((ObjectNode) twoWinners.get("participants").get(1)).remove("stillInGame");
        ((ObjectNode) twoWinners.get("participants").get(1)).put("winner", true); invalid.add(twoWinners);
        ObjectNode noSurvivors = valid.deepCopy(); noSurvivors.put("result", "DRAW");
        for (JsonNode p : noSurvivors.get("participants")) { ((ObjectNode) p).remove("placement"); ((ObjectNode) p).put("stillInGame", false); }
        invalid.add(noSurvivors);
        ObjectNode drawAlternate = noSurvivors.deepCopy(); drawAlternate.put("alternateWinCon", true); invalid.add(drawAlternate);
        for (ObjectNode request : invalid) {
            expect(f.owner(), "POST", f.path(), request.toString(), 400);
            expect(f.owner(), "PUT", f.path() + "/" + id(saved), request.toString(), 400);
        }
        assertThat(games.count()).isEqualTo(1);
        checkRead(f, saved);
    }

    private void checkRead(Fixture f, JsonNode saved) throws Exception {
        assertThat(expect(f.owner(), "GET", f.path() + "/" + id(saved), "", 200)).isEqualTo(saved);
        assertThat(expect(f.owner(), "GET", f.path(), "", 200).get(0)).isEqualTo(saved);
        for (JsonNode p : saved.get("participants")) {
            assertThat(p.has("startPosition")).isTrue();
            assertThat(p.has("placement")).isTrue();
            assertThat(p.get("stillInGame").isBoolean()).isTrue();
        }
    }
}
