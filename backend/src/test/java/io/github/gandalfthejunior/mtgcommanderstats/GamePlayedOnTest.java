package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CREATED;
import static org.springframework.http.HttpStatus.FORBIDDEN;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.OK;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

class GamePlayedOnTest extends GameTestSupport {
    @Test
    void persistsDateOnlyAcrossAllResponsesAndTimeZonesWithoutChangingRecordedAtOrOrdering() throws Exception {
        Fixture f = fixture();
        TimeZone original = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("Pacific/Honolulu"));
            ObjectNode request = request(f).put("playedOn", "2000-02-29");
            JsonNode saved = expect(f.creator(), "POST", f.path(), request.toString(), CREATED.value());
            assertDate(f, saved, "2000-02-29");
            TimeZone.setDefault(TimeZone.getTimeZone("Pacific/Kiritimati"));
            assertDate(f, saved, "2000-02-29");
            String path = f.path() + "/" + id(saved);
            JsonNode legacyEdit = expect(f.creator(), "PUT", path, body(f), OK.value());
            assertThat(legacyEdit).isEqualTo(saved);
            request.put("playedOn", "2026-10-31");
            JsonNode corrected = expect(f.owner(), "PUT", path, request.toString(), OK.value());
            for (String field : List.of("id", "groupId", "creatorId", "recordedAt")) {
                assertThat(corrected.get(field)).isEqualTo(saved.get(field));
            }
            assertDate(f, corrected, "2026-10-31");
            JsonNode later = expect(f.owner(), "POST", f.path(), request(f).put("playedOn", "1999-01-01").toString(), CREATED.value());
            JsonNode unknown = expect(f.owner(), "POST", f.path(), body(f), CREATED.value());
            // Played-on order differs deliberately from the retained recording-time order.
            assertThat(expect(f.owner(), "GET", f.path(), "", OK.value()))
                    .isEqualTo(json.valueToTree(List.of(unknown, later, corrected)));
        } finally {
            TimeZone.setDefault(original);
        }
    }

    @Test
    void absentAndExplicitNullCreationStayUnknownAndExplicitNullEditClearsKnownDate() throws Exception {
        Fixture f = fixture();
        for (ObjectNode request : List.of(request(f), request(f).putNull("playedOn"))) {
            JsonNode saved = expect(f.creator(), "POST", f.path(), request.toString(), CREATED.value());
            assertDate(f, saved, null);
            assertThat(expect(f.creator(), "PUT", f.path() + "/" + id(saved), body(f), OK.value())).isEqualTo(saved);
        }
        ObjectNode request = request(f).put("playedOn", "2026-10-31");
        JsonNode saved = expect(f.creator(), "POST", f.path(), request.toString(), CREATED.value());
        JsonNode cleared = expect(f.creator(), "PUT", f.path() + "/" + id(saved), request.putNull("playedOn").toString(), OK.value());
        ObjectNode expected = ((ObjectNode) saved).deepCopy().putNull("playedOn");
        assertThat(cleared).isEqualTo(expected);
        assertDate(f, cleared, null);
    }

    @Test
    void rejectsMalformedDatesOtherJsonTypesAndExtraneousFieldsAtomicallyOnBothWriteRoutes() throws Exception {
        Fixture f = fixture();
        JsonNode saved = expect(f.creator(), "POST", f.path(), request(f).put("playedOn", "2024-02-29").toString(), CREATED.value());
        for (String value : List.of("\"2026-02-29\"", "\"2026-04-31\"", "\"2026-13-01\"", "\"2026-00-01\"",
                "\"2026-01-00\"", "\"2026-1-01\"", "\"26-01-01\"", "\"2026-10-31T00:00:00Z\"",
                "\"2026-10-31T00:00:00\"", "\" 2026-10-31\"", "\"2026-10-31 \"", "\"\"", "\"+10000-01-01\"",
                "42", "20261031", "1.5", "true", "false", "[]", "{}", "[2026,10,31]")) {
            ObjectNode invalid = request(f);
            invalid.set("playedOn", json.readTree(value));
            for (String method : List.of("POST", "PUT")) {
                expect(f.creator(), method, method.equals("POST") ? f.path() : f.path() + "/" + id(saved), invalid.toString(), BAD_REQUEST.value());
            }
        }
        for (String field : List.of("playedAt", "played_on", "recordedAt", "typo")) {
            ObjectNode invalid = request(f).put("playedOn", "2026-10-31").putNull(field);
            expect(f.creator(), "POST", f.path(), invalid.toString(), BAD_REQUEST.value());
            expect(f.creator(), "PUT", f.path() + "/" + id(saved), invalid.toString(), BAD_REQUEST.value());
        }
        assertThat(games.count()).isEqualTo(1);
        assertDate(f, saved, "2024-02-29");
        assertThat(decks.findById(f.ownerDeck()).orElseThrow().isEverUsed()).isFalse();
    }

    @Test
    void dateChangesRequireSessionCsrfActiveMembershipAndOriginalCreatorOrOwner() throws Exception {
        Fixture f = fixture();
        JsonNode saved = expect(f.creator(), "POST", f.path(), request(f).put("playedOn", "2026-10-31").toString(), CREATED.value());
        String path = f.path() + "/" + id(saved);
        Actor noCsrf = new Actor(f.creator().cookie(), null, f.creator().id());
        Actor invalidCsrf = new Actor(f.creator().cookie(), "invalid", f.creator().id());
        HttpResponse<String> bootstrap = send(null, "GET", "/api/csrf", "");
        Actor anonymous = new Actor(bootstrap.headers().firstValue("Set-Cookie").orElseThrow().split(";", 2)[0],
                json.readTree(bootstrap.body()).get("token").asText(), null);
        for (ObjectNode request : List.of(request(f).put("playedOn", "2026-10-30"), request(f).putNull("playedOn"))) {
            for (Actor actor : List.of(f.member(), f.outsider(), noCsrf, invalidCsrf)) {
                expect(actor, "PUT", path, request.toString(), FORBIDDEN.value());
            }
            expect(anonymous, "POST", f.path(), request.toString(), UNAUTHORIZED.value());
            expect(anonymous, "PUT", path, request.toString(), UNAUTHORIZED.value());
            assertDate(f, saved, "2026-10-31");
        }
        expect(null, "GET", path, "", UNAUTHORIZED.value());
        UUID missingGroup = UUID.randomUUID();
        expect(f.owner(), "PUT", "/api/groups/" + missingGroup + "/games/" + id(saved), body(f), NOT_FOUND.value());
        expect(f.outsider(), "PUT", f.path() + "/" + UUID.randomUUID(), body(f), FORBIDDEN.value());
        groupService.leave(f.creator().id(), f.groupId());
        expect(f.creator(), "PUT", path, request(f).putNull("playedOn").toString(), FORBIDDEN.value());
        assertDate(f, saved, "2026-10-31");
        JsonNode cleared = expect(f.owner(), "PUT", path, request(f).putNull("playedOn").toString(), OK.value());
        assertDate(f, cleared, null);
    }

    private ObjectNode request(Fixture f) {
        return (ObjectNode) json.readTree(body(f));
    }

    private void assertDate(Fixture f, JsonNode saved, String date) throws Exception {
        assertThat(saved.has("playedOn")).isTrue();
        if (date == null) {
            assertThat(saved.get("playedOn").isNull()).isTrue();
        } else {
            assertThat(saved.get("playedOn").asText()).isEqualTo(date);
        }
        LocalDate stored = jdbc.queryForObject("SELECT played_on FROM games WHERE id = ?",
                (rs, row) -> rs.getObject(1, LocalDate.class), id(saved));
        assertThat(stored).isEqualTo(date == null ? null : LocalDate.parse(date));
        assertThat(expect(f.owner(), "GET", f.path() + "/" + id(saved), "", OK.value())).isEqualTo(saved);
        JsonNode list = expect(f.owner(), "GET", f.path(), "", OK.value());
        List<JsonNode> listedGames = new ArrayList<>();
        list.forEach(listedGames::add);
        assertThat(listedGames).contains(saved);
    }
}
