package io.github.gandalfthejunior.mtgcommanderstats;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.application.CommanderInput;
import io.github.gandalfthejunior.mtgcommanderstats.game.application.HistoryCursor;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameResult;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;

class PaginatedGameHistoryTest extends GameTestSupport {
    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @ParameterizedTest
    @ValueSource(ints = {0, 20, 21, 40, 41, 65})
    void pagesExactlyWithoutGapsAcrossDatesTimestampAndUuidTies(int count) throws Exception {
        Fixture f = fixture();
        seed(f, count);
        List<UUID> expected = ordered(f);
        List<UUID> seen = new ArrayList<>();
        String path = f.path() + "/history";
        int pages = 0;
        do {
            JsonNode page = expect(f.owner(), "GET", path, "", 200);
            int remaining = count - seen.size();
            assertThat(page.get("games").size()).isEqualTo(Math.min(20, remaining));
            for (JsonNode game : page.get("games")) {
                seen.add(id(game));
                assertThat(game).isEqualTo(expect(f.owner(), "GET", f.path() + "/" + id(game), "", 200));
            }
            assertThat(page.get("nextCursor").isNull()).isEqualTo(remaining <= 20);
            path = page.get("nextCursor").isNull() ? null
                    : f.path() + "/history?cursor=" + page.get("nextCursor").asText();
            assertThat(++pages).isLessThanOrEqualTo(4);
        } while (path != null);
        assertThat(seen).containsExactlyElementsOf(expected).doesNotHaveDuplicates();
        JsonNode legacy = expect(f.owner(), "GET", f.path(), "", 200);
        assertThat(legacy.isArray()).isTrue();
        List<UUID> legacyIds = new ArrayList<>();
        legacy.forEach(game -> legacyIds.add(id(game)));
        assertThat(legacyIds).containsExactlyElementsOf(jdbc.query(
                "SELECT id FROM games WHERE group_id = ? ORDER BY recorded_at DESC, id DESC",
                (row, index) -> row.getObject(1, UUID.class), f.groupId()));
    }

    @Test
    void checksMembershipOnEveryPageAndRejectsBadAndCrossGroupCursors() throws Exception {
        Fixture f = fixture();
        seed(f, 21);
        String cursor = first(f).get("nextCursor").asText();
        String path = f.path() + "/history?cursor=" + cursor;
        expect(f.owner(), "GET", "/api/groups/" + UUID.randomUUID() + "/games/history", "", 404);
        expect(null, "GET", path, "", 401);
        expect(f.outsider(), "GET", path, "", 403);
        expect(f.member(), "GET", path, "", 200);
        groupService.leave(f.member().id(), f.groupId());
        expect(f.member(), "GET", path, "", 403);
        groupService.removeMember(f.owner().id(), f.groupId(), f.creator().id());
        expect(f.creator(), "GET", path, "", 403);
        UUID other = groupService.create(f.owner().id(), "Other").id();
        expect(f.owner(), "GET", "/api/groups/" + other + "/games/history?cursor=" + cursor, "", 400);
        String decoded = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.US_ASCII);
        for (String invalid : List.of("", "a", "abc_", "x".repeat(257), cursor + "=", "!!!",
                encode(decoded.replaceFirst("1\\|", "2|")), encode(decoded + "|extra"),
                encode(decoded.replace("2026", "999999999999")))) {
            JsonNode problem = expect(f.owner(), "GET", f.path() + "/history?cursor=" + invalid, "", 400);
            assertThat(problem.get("detail").asText()).contains("cursor");
        }
    }

    @Test
    void retainsHistoricalDisplaysWithoutLinksOrProviderCallsAndBoundsEntityLoading() throws Exception {
        Fixture f = fixture();
        List<CommanderInput> pair = new ArrayList<>();
        for (String name : List.of("First Partner", "Second Partner")) {
            UUID print = UUID.randomUUID();
            CommanderTestProvider.put(print, json.writeValueAsString(Map.of(
                    "id", print, "oracle_id", UUID.randomUUID(), "name", name,
                    "type_line", "Legendary Creature — Test", "oracle_text", "Partner",
                    "layout", "normal", "lang", "en", "color_identity", List.of("R"),
                    "legalities", Map.of("commander", "legal"))));
            pair.add(new CommanderInput(new CommanderSelectionRef(print, null), null));
        }
        deckService.update(f.creator().id(), f.creatorDeck(), "Pair", pair);
        seed(f, 41);
        jdbc.update("UPDATE deck_commanders SET art_crop_url = ?, artist = ? WHERE deck_id = ?",
                "https://cards.scryfall.io/art_crop/saved.jpg", "Saved artist", f.creatorDeck());
        deckService.update(f.creator().id(), f.creatorDeck(), "Renamed", pair,
                true, "https://manabox.app/decks/abcdefgh");
        deckService.archive(f.member().id(), f.memberDeck());
        groupService.leave(f.member().id(), f.groupId());
        provider.offline = true;
        assertThat(expect(f.owner(), "GET", f.path() + "/" + ordered(f).getFirst(), "", 200).toString())
                .contains("https://manabox.app/decks/abcdefgh");
        int providerCalls = provider.calls.get();
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        boolean enabled = statistics.isStatisticsEnabled();
        statistics.setStatisticsEnabled(true);
        try {
            statistics.clear();
            JsonNode page = first(f);
            assertThat(page.get("games").size()).isEqualTo(20);
            long statements = statistics.getPrepareStatementCount();
            // Only selected games and their two participants/decks/users/Commander snapshots are hydrated.
            assertThat(statistics.getEntityLoadCount()).isLessThan(35);
            assertThat(statistics.getCollectionLoadCount()).isLessThan(30);
            assertThat(statistics.getEntityUpdateCount()).isZero();
            assertThat(page.toString()).doesNotContain("manabox.app", "email", "password", "ownerId");
            for (JsonNode game : page.get("games")) {
                for (JsonNode participant : game.get("participants")) {
                    if (participant.get("deckId").asText().equals(f.memberDeck().toString())) {
                        assertThat(participant.get("deck").get("archived").asBoolean()).isTrue();
                    }
                    boolean paired = participant.get("deckId").asText().equals(f.creatorDeck().toString());
                    assertThat(participant.get("deck").get("commanders").size()).isEqualTo(paired ? 2 : 1);
                    if (paired) {
                        assertThat(participant.get("deck").get("name").asText()).isEqualTo("Renamed");
                        assertThat(participant.get("deck").get("commanders").toString()).contains("Saved artist", "saved.jpg");
                    }
                }
            }
            statistics.clear();
            expect(f.owner(), "GET", f.path() + "/history?cursor=" + page.get("nextCursor").asText(), "", 200);
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(statements);
            assertThat(provider.calls.get()).isEqualTo(providerCalls);
        } finally {
            statistics.setStatisticsEnabled(enabled);
        }
    }

    @Test
    void continuesAfterCursorRowIsEditedOrDeletedAndRefreshSeesNewerInsert() throws Exception {
        Fixture f = fixture();
        seed(f, 41);
        List<UUID> before = ordered(f);
        String token = first(f).get("nextCursor").asText();
        HistoryCursor cursor = HistoryCursor.decode(token, f.groupId());
        jdbc.update("UPDATE games SET played_on = '2027-01-01' WHERE id = ?", cursor.gameId());
        JsonNode afterEdit = expect(f.owner(), "GET", f.path() + "/history?cursor=" + token, "", 200);
        assertThat(id(afterEdit.get("games").get(0))).isEqualTo(before.get(20));
        gameService.delete(f.owner().id(), f.groupId(), cursor.gameId());
        UUID newer = createGame(f.creator().id(), f.groupId(), assignments(f), GameResult.DRAW, null).id();
        jdbc.update("UPDATE games SET played_on = '2028-01-01' WHERE id = ?", newer);
        JsonNode afterInsert = expect(f.owner(), "GET", f.path() + "/history?cursor=" + token, "", 200);
        assertThat(afterInsert).isEqualTo(afterEdit);
        assertThat(id(first(f).get("games").get(0))).isEqualTo(newer);
    }

    private void seed(Fixture f, int count) {
        for (int i = 0; i < count; i++) {
            UUID id = createGame(f.creator().id(), f.groupId(), assignments(f),
                    i % 2 == 0 ? GameResult.DRAW : GameResult.WIN, i % 2 == 0 ? null : f.creator().id()).id();
            // Repeated dates and microsecond timestamps force UUID tie-breaking.
            jdbc.update("UPDATE games SET played_on = ?, recorded_at = ?::timestamptz WHERE id = ?",
                    i % 3 == 0 ? null : LocalDate.of(2026, 10, 1 + i % 2),
                    "2026-11-0" + (1 + i % 4) + "T12:00:00.123456Z", id);
        }
    }

    private List<UUID> ordered(Fixture f) {
        return jdbc.query("SELECT id FROM games WHERE group_id = ? ORDER BY played_on DESC NULLS LAST, recorded_at DESC, id DESC",
                (row, index) -> row.getObject(1, UUID.class), f.groupId());
    }

    private JsonNode first(Fixture f) throws Exception {
        return expect(f.owner(), "GET", f.path() + "/history", "", 200);
    }

    private String encode(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.US_ASCII));
    }
}
