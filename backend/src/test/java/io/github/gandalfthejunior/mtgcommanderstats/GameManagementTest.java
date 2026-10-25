package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameParticipant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.CREATED;
import static org.springframework.http.HttpStatus.FORBIDDEN;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.NO_CONTENT;
import static org.springframework.http.HttpStatus.OK;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

import static org.assertj.core.api.Assertions.assertThat;

class GameManagementTest extends GameTestSupport {
    @Test
    void createsReadsAndOrdersGamesWithSafeDisplayAndAnUninvolvedCreator() throws Exception {
        Fixture f = fixture();
        JsonNode first = expect(f.owner(), "POST", f.path(), body(f), CREATED.value());
        JsonNode second = expect(f.creator(), "POST", f.path(), body(assignments(f), "DRAW", null), CREATED.value());
        assertThat(first.get("creatorId").asText()).isEqualTo(f.owner().id().toString());
        assertThat(first.get("groupId").asText()).isEqualTo(f.groupId().toString());
        assertThat(first.get("result").asText()).isEqualTo("WIN");
        assertThat(first.get("winnerUserId").asText()).isEqualTo(f.creator().id().toString());
        assertThat(first.get("recordedAt").asText()).isNotBlank();
        assertThat(first.get("participants").size()).isEqualTo(2);
        for (JsonNode participant : first.get("participants")) {
            assertThat(participant.get("username").asText()).isEqualTo("Same Name");
            assertThat(participant.get("deck").get("id")).isEqualTo(participant.get("deckId"));
            assertThat(participant.get("deck").get("commanders").get(0).get("name").asText()).isEqualTo("Krenko");
        }
        assertThat(first.toString()).doesNotContain("email", "password", "joinCode", "ownerId");
        assertThat(expect(f.member(), "GET", f.path() + "/" + id(first), "", OK.value())).isEqualTo(first);
        JsonNode history = expect(f.member(), "GET", f.path(), "", OK.value());
        assertThat(history.get(0)).isEqualTo(second);
        assertThat(history.get(1)).isEqualTo(first);
        assertThat(second.get("winnerUserId").isNull()).isTrue();

        // Tie order is defined by PostgreSQL UUID descending order, independent of request order.
        jdbc.update("UPDATE games SET recorded_at = '2026-01-01T12:00:00Z'");
        List<UUID> expected = jdbc.query("SELECT id FROM games ORDER BY recorded_at DESC, id DESC",
                (row, index) -> row.getObject("id", UUID.class));
        JsonNode tied = expect(f.owner(), "GET", f.path(), "", OK.value());
        assertThat(List.of(id(tied.get(0)), id(tied.get(1)))).containsExactlyElementsOf(expected);
    }

    @Test
    void acceptsSixPlayersAndBothResultTypes() throws Exception {
        Fixture f = fixture();
        List<GameParticipant> participants = new ArrayList<>(assignments(f));
        participants.add(assignment(f.owner().id(), f.ownerDeck()));
        String code = groupService.joinCode(f.owner().id(), f.groupId());
        for (int i = 0; i < 3; i++) {
            Actor actor = register("extra" + i, "Extra");
            groupService.join(actor.id(), code);
            participants.add(assignment(actor.id(), deck(actor)));
        }
        assertThat(expect(f.owner(), "POST", f.path(), body(participants, "WIN", f.member().id()), CREATED.value())
                .get("participants").size()).isEqualTo(6);
        expect(f.owner(), "POST", f.path(), body(participants, "DRAW", null), CREATED.value());
    }

    @Test
    void rejectsInvalidCountsDuplicatesResultsAndAssignmentsWithoutUsage() throws Exception {
        Fixture f = fixture();
        List<GameParticipant> valid = assignments(f);
        List<String> invalidBodies = new ArrayList<>();
        invalidBodies.add(body(valid.subList(0, 1), "WIN", f.creator().id()));
        List<GameParticipant> seven = new ArrayList<>(valid);
        for (int i = 0; i < 5; i++) {
            seven.add(assignment(UUID.randomUUID(), UUID.randomUUID()));
        }
        invalidBodies.add(body(seven, "DRAW", null));
        invalidBodies.add(body(List.of(valid.get(0), valid.get(0)), "WIN", f.creator().id()));
        invalidBodies.add(body(valid, "WIN", f.outsider().id()));
        invalidBodies.add(body(valid, "WIN", null));
        invalidBodies.add(body(valid, "DRAW", f.creator().id()));
        invalidBodies.add(body(valid, "LOSS", null));
        invalidBodies.add(body(List.of(valid.get(0),
                assignment(f.member().id(), f.creatorDeck())), "DRAW", null));
        invalidBodies.add(body(List.of(valid.get(0),
                assignment(f.outsider().id(), f.outsiderDeck())), "DRAW", null));
        invalidBodies.add(body(List.of(valid.get(0),
                assignment(f.member().id(), UUID.randomUUID())), "DRAW", null));
        for (String body : invalidBodies) {
            expect(f.owner(), "POST", f.path(), body, BAD_REQUEST.value());
            assertThat(games.count()).isZero();
            assertThat(decks.findAll()).allMatch(deck -> !deck.isEverUsed());
        }
        expect(f.member(), "POST", "/api/decks/" + f.memberDeck() + "/archive", "", OK.value());
        expect(f.owner(), "POST", f.path(), body(f), BAD_REQUEST.value());
        assertThat(games.count()).isZero();
        assertThat(decks.findAll()).allMatch(deck -> !deck.isEverUsed());
    }

    @ParameterizedTest
    @ValueSource(strings = {"id", "groupId", "creatorId", "recordedAt", "actorId", "ownerId", "role", "typo"})
    void rejectsServerOwnedAndUnknownFieldsOnCreateAndReplace(String field) throws Exception {
        Fixture f = fixture();
        JsonNode game = expect(f.creator(), "POST", f.path(), body(f), CREATED.value());
        String spoofed = body(f).replaceFirst("\\{", "{\"" + field + "\":\"spoofed\",");
        expect(f.creator(), "POST", f.path(), spoofed, BAD_REQUEST.value());
        expect(f.creator(), "PUT", f.path() + "/" + id(game), spoofed, BAD_REQUEST.value());
        assertThat(expect(f.creator(), "GET", f.path() + "/" + id(game), "", OK.value())).isEqualTo(game);
        assertThat(games.count()).isEqualTo(1);
    }

    @Test
    void rejectsMalformedMissingNullAndNestedUnknownData() throws Exception {
        Fixture f = fixture();
        List<String> bodies = List.of("", "null", "[]", "{}", "{", "{\"participants\":null,\"result\":\"DRAW\"}",
                "{\"participants\":[null,null],\"result\":\"DRAW\"}",
                body(f).replace("\"deckId\":", "\"secret\":true,\"deckId\":"),
                body(f).replace(f.creatorDeck().toString(), "invalid-uuid"),
                body(f).replace(f.creatorDeck().toString(), "1-1-1-1-1"),
                body(f).replace(f.creatorDeck().toString(), "AAAAAAAAAAAAAAAAAAAAAA=="),
                body(f).replace(f.creatorDeck().toString(), ""),
                body(f).replace("\"WIN\"", "0"), body(f).replace("\"WIN\"", "null"),
                body(assignments(f), "DRAW", null).replace("\"alternateWinCon\":false", "\"winnerUserId\":\"\",\"alternateWinCon\":false"),
                body(assignments(f), "DRAW", null).replace("\"alternateWinCon\":false", "\"winnerUserId\":\" \",\"alternateWinCon\":false"),
                body(f).replace("\"userId\":\"" + f.creator().id() + "\"", "\"userId\":null"),
                body(f).replace("\"deckId\":\"" + f.creatorDeck() + "\"", "\"deckId\":null"));
        List<String> missingFields = List.of(
                body(f).replace("\"result\":\"WIN\",", ""),
                body(f).replace("\"deckId\":\"" + f.creatorDeck() + "\"", "\"deckId\":null"));
        for (String body : missingFields) {
            expect(f.owner(), "POST", f.path(), body, BAD_REQUEST.value());
        }
        for (String body : bodies) {
            expect(f.owner(), "POST", f.path(), body, BAD_REQUEST.value());
        }
        expect(f.owner(), "GET", "/api/groups/not-a-uuid/games", "", BAD_REQUEST.value());
        expect(f.owner(), "GET", f.path() + "/invalid", "", BAD_REQUEST.value());
        expect(f.owner(), "GET", f.selection(f.member().id()).replace(f.member().id().toString(), "invalid"), "", BAD_REQUEST.value());
        assertThat(games.count()).isZero();
        assertThat(decks.findAll()).allMatch(deck -> !deck.isEverUsed());
    }

    @Test
    void enforcesSessionCsrfMembershipAndCreatorOrOwnerModification() throws Exception {
        Fixture f = fixture();
        JsonNode game = expect(f.creator(), "POST", f.path(), body(f), CREATED.value());
        String path = f.path() + "/" + id(game);
        // An anonymous session with a valid CSRF token proves authentication independently.
        HttpResponse<String> bootstrap = send(null, "GET", "/api/csrf", "");
        Actor anonymous = new Actor(bootstrap.headers().firstValue("Set-Cookie").orElseThrow().split(";", 2)[0],
                json.readTree(bootstrap.body()).get("token").asText(), null);
        for (Actor actor : List.of(anonymous, f.outsider())) {
            int status = actor == anonymous ? UNAUTHORIZED.value() : FORBIDDEN.value();
            expect(actor, "POST", f.path(), body(f), status);
            expect(actor, "GET", f.path(), "", status);
            expect(actor, "GET", path, "", status);
            expect(actor, "PUT", path, body(f), status);
            expect(actor, "DELETE", path, "", status);
            expect(actor, "GET", f.selection(f.member().id()), "", status);
        }
        for (String token : List.of("", "invalid")) {
            Actor noCsrf = new Actor(f.owner().cookie(), token.isEmpty() ? null : token, f.owner().id());
            expect(noCsrf, "POST", f.path(), body(f), FORBIDDEN.value());
            expect(noCsrf, "PUT", path, body(f), FORBIDDEN.value());
            expect(noCsrf, "DELETE", path, "", FORBIDDEN.value());
            expect(noCsrf, "POST", "/api/decks/" + f.ownerDeck() + "/archive", "", FORBIDDEN.value());
        }
        expect(f.member(), "PUT", path, body(f), FORBIDDEN.value());
        expect(f.member(), "DELETE", path, "", FORBIDDEN.value());
        assertThat(expect(f.owner(), "GET", path, "", OK.value())).isEqualTo(game);
        JsonNode updated = expect(f.creator(), "PUT", path, body(assignments(f), "DRAW", null), OK.value());
        for (String field : List.of("id", "groupId", "creatorId", "recordedAt")) {
            assertThat(updated.get(field)).isEqualTo(game.get(field));
        }
        expect(f.owner(), "PUT", path, body(f), OK.value());
        expect(f.creator(), "DELETE", path, "", NO_CONTENT.value());
        assertThat(games.count()).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM game_participants", Long.class)).isZero();
        expect(f.owner(), "GET", path, "", NOT_FOUND.value());
    }

    @Test
    void deniedAndInvalidEditsPreserveAssignmentsAndDoNotUseReplacementDecks() throws Exception {
        Fixture f = fixture();
        expect(f.outsider(), "POST", f.path(), body(f), FORBIDDEN.value());
        assertThat(decks.findAll()).allMatch(deck -> !deck.isEverUsed());
        JsonNode original = expect(f.creator(), "POST", f.path(), body(f), CREATED.value());
        UUID replacement = deck(f.member());
        List<GameParticipant> changed = List.of(assignments(f).get(0), assignment(f.member().id(), replacement));
        String path = f.path() + "/" + id(original);
        expect(f.member(), "PUT", path, body(changed, "DRAW", null), FORBIDDEN.value());
        expect(f.creator(), "PUT", path, body(changed, "WIN", f.outsider().id()), BAD_REQUEST.value());
        expect(f.member(), "POST", "/api/decks/" + replacement + "/archive", "", OK.value());
        expect(f.creator(), "PUT", path, body(changed, "DRAW", null), BAD_REQUEST.value());
        assertThat(decks.findById(replacement).orElseThrow().isEverUsed()).isFalse();
        assertThat(expect(f.owner(), "GET", path, "", OK.value())).isEqualTo(original);
    }

    @Test
    void removedHistoricalPairMustBeEligibleToBeAssignedAgain() throws Exception {
        Fixture f = fixture();
        JsonNode original = expect(f.creator(), "POST", f.path(), body(f), CREATED.value());
        String path = f.path() + "/" + id(original);
        groupService.leave(f.member().id(), f.groupId());
        List<GameParticipant> changed = List.of(assignments(f).get(0), assignment(f.owner().id(), f.ownerDeck()));
        expect(f.creator(), "PUT", path, body(changed, "DRAW", null), OK.value());
        expect(f.creator(), "PUT", path, body(f), BAD_REQUEST.value());
        assertThat(expect(f.owner(), "GET", path, "", OK.value()).get("participants").toString())
                .doesNotContain(f.member().id().toString());
    }

    @Test
    void returnsNotFoundForMissingOrWrongGroupResourcesWithoutLeakingGames() throws Exception {
        Fixture f = fixture();
        JsonNode game = expect(f.creator(), "POST", f.path(), body(f), CREATED.value());
        UUID otherGroup = groupService.create(f.owner().id(), "Other").id();
        for (String method : List.of("GET", "PUT", "DELETE")) {
            String body = method.equals("PUT") ? body(f) : "";
            expect(f.owner(), method, "/api/groups/" + otherGroup + "/games/" + id(game), body, NOT_FOUND.value());
            expect(f.owner(), method, f.path() + "/" + UUID.randomUUID(), body, NOT_FOUND.value());
            expect(f.owner(), method, "/api/groups/" + UUID.randomUUID() + "/games/" + id(game), body, NOT_FOUND.value());
        }
        expect(f.owner(), "POST", "/api/groups/" + UUID.randomUUID() + "/games", body(f), NOT_FOUND.value());
        expect(f.owner(), "GET", "/api/groups/" + UUID.randomUUID() + "/games", "", NOT_FOUND.value());
        expect(f.owner(), "POST", "/api/groups/" + otherGroup + "/games", body(f), BAD_REQUEST.value());
        expect(f.owner(), "GET", "/api/groups/" + otherGroup + "/members/" + f.member().id() + "/decks", "", NOT_FOUND.value());
        assertThat(games.count()).isEqualTo(1);
    }

    @Test
    void preservesHistoricalAssignmentsAfterLeaveAndArchiveButValidatesReplacements() throws Exception {
        Fixture f = fixture();
        JsonNode created = expect(f.creator(), "POST", f.path(), body(f), CREATED.value());
        String path = f.path() + "/" + id(created);
        UUID replacement = deck(f.member());
        expect(f.member(), "POST", "/api/decks/" + f.memberDeck() + "/archive", "{}", OK.value());
        groupService.leave(f.member().id(), f.groupId());
        JsonNode history = expect(f.owner(), "GET", path, "", OK.value());
        assertThat(history.get("participants").toString()).contains("Same Name", f.memberDeck().toString(),
                "\"archived\":true");
        expect(f.creator(), "PUT", path, body(assignments(f), "DRAW", null), OK.value());
        List<GameParticipant> changed = List.of(assignments(f).get(0), assignment(f.member().id(), replacement));
        expect(f.creator(), "PUT", path, body(changed, "DRAW", null), BAD_REQUEST.value());
        assertThat(decks.findById(replacement).orElseThrow().isEverUsed()).isFalse();
        expect(f.member(), "GET", path, "", FORBIDDEN.value());
        expect(f.member(), "GET", f.path(), "", FORBIDDEN.value());
        expect(f.member(), "POST", f.path(), body(f), FORBIDDEN.value());
        expect(f.member(), "GET", f.selection(f.creator().id()), "", FORBIDDEN.value());
        expect(f.creator(), "GET", f.selection(f.member().id()), "", NOT_FOUND.value());

        groupService.leave(f.creator().id(), f.groupId());
        expect(f.creator(), "PUT", path, body(f), FORBIDDEN.value());
        expect(f.creator(), "DELETE", path, "", FORBIDDEN.value());
        expect(f.owner(), "PUT", path, body(f), OK.value());
        expect(f.owner(), "DELETE", path, "", NO_CONTENT.value());
        assertThat(decks.findById(f.memberDeck()).orElseThrow().isEverUsed()).isTrue();
    }

    @Test
    void recordsReplacementDeckUsagePermanentlyAndLocksOnlyCommanderAndColors() throws Exception {
        Fixture f = fixture();
        UUID replacement = deck(f.member());
        JsonNode created = expect(f.creator(), "POST", f.path(), body(f), CREATED.value());
        String path = f.path() + "/" + id(created);
        List<GameParticipant> changed = List.of(assignments(f).get(0), assignment(f.member().id(), replacement));
        expect(f.creator(), "PUT", path, body(changed, "DRAW", null), OK.value());
        expect(f.creator(), "DELETE", path, "", NO_CONTENT.value());
        for (UUID deckId : List.of(f.memberDeck(), replacement)) {
            assertThat(decks.findById(deckId).orElseThrow().isEverUsed()).isTrue();
            JsonNode renamed = expect(f.member(), "PUT", "/api/decks/" + deckId,
                    "{\"name\":\"Renamed\"}", OK.value());
            assertThat(renamed.get("name").asText()).isEqualTo("Renamed");
            assertThat(renamed.get("everUsed").asBoolean()).isTrue();
            expect(f.member(), "PUT", "/api/decks/" + deckId, deckBody("Other", "Atraxa", List.of("R")), CONFLICT.value());
            expect(f.member(), "PUT", "/api/decks/" + deckId, deckBody("Other", "Krenko", List.of("G")), CONFLICT.value());
            expect(f.member(), "DELETE", "/api/decks/" + deckId, "", CONFLICT.value());
            assertThat(decks.findById(deckId).orElseThrow().getName()).isEqualTo("Renamed");
        }
        expect(f.owner(), "DELETE", "/api/decks/" + f.ownerDeck(), "", NO_CONTENT.value());
        assertThat(decks.findById(f.ownerDeck())).isEmpty();
    }

    @Test
    void selectionExposesOnlyEligibleTargetDecksAndNeverGrantsWriteAccess() throws Exception {
        Fixture f = fixture();
        expect(f.owner(), "POST", f.path(), body(f), CREATED.value());
        UUID unused = deck(f.member());
        UUID archived = deck(f.member());
        expect(f.member(), "POST", "/api/decks/" + archived + "/archive", "{}", OK.value());
        expect(f.member(), "POST", "/api/decks/" + archived + "/archive", "", OK.value());
        JsonNode selected = expect(f.creator(), "GET", f.selection(f.member().id()), "", OK.value());
        assertThat(selected.size()).isEqualTo(2);
        List<UUID> ids = new ArrayList<>();
        for (JsonNode summary : selected) {
            ids.add(id(summary));
            assertThat(summary.size()).isEqualTo(4);
            assertThat(summary.get("colorIdentity")).isEqualTo(json.readTree("[\"R\"]"));
        }
        assertThat(ids).containsExactlyInAnyOrder(f.memberDeck(), unused);
        assertThat(selected.toString()).doesNotContain("archived", "everUsed", "email", "password", "ownerId");
        for (String method : List.of("PUT", "DELETE", "POST")) {
            String path = "/api/decks/" + f.memberDeck() + (method.equals("POST") ? "/archive" : "");
            expect(f.creator(), method, path, method.equals("PUT") ? deckBody("Stolen", "Krenko", List.of("R")) : "", FORBIDDEN.value());
        }
        expect(f.owner(), "GET", f.selection(f.outsider().id()), "", NOT_FOUND.value());
        expect(f.owner(), "GET", f.selection(UUID.randomUUID()), "", NOT_FOUND.value());
        expect(f.outsider(), "GET", f.selection(f.member().id()), "", FORBIDDEN.value());
        expect(f.owner(), "DELETE", "/api/decks/" + f.ownerDeck(), "", NO_CONTENT.value());
        assertThat(expect(f.member(), "GET", f.selection(f.owner().id()), "", OK.value()).isEmpty()).isTrue();
        expect(f.owner(), "POST", "/api/decks/" + UUID.randomUUID() + "/archive", "", NOT_FOUND.value());
        expect(f.owner(), "POST", "/api/decks/not-a-uuid/archive", "", BAD_REQUEST.value());
        expect(f.owner(), "POST", "/api/decks/" + f.memberDeck() + "/archive", "{\"ownerId\":\"spoof\"}", BAD_REQUEST.value());
    }
}
