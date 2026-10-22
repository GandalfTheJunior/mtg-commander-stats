package io.github.gandalfthejunior.mtgcommanderstats;

import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import io.github.gandalfthejunior.mtgcommanderstats.game.application.ManageGames.GameDetails;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameParticipant;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataIntegrityViolationException;
import tools.jackson.databind.JsonNode;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.CREATED;
import static org.springframework.http.HttpStatus.FORBIDDEN;
import static org.springframework.http.HttpStatus.NO_CONTENT;
import static org.springframework.http.HttpStatus.OK;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

class GameIntegrityTest extends GameTestSupport {
    @Test
    void migrationDefaultsAndForeignKeysUniquenessAndChecksProtectStoredGames() throws Exception {
        Fixture f = fixture();
        assertThat(decks.findAll()).allMatch(deck -> !deck.isEverUsed() && !deck.isArchived());
        JsonNode game = expect(f.owner(), "POST", f.path(), body(f), CREATED.value());
        UUID gameId = id(game);
        assertThatThrownBy(() -> insertGame(UUID.randomUUID(), f.owner().id(), "DRAW", null))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertGame(f.groupId(), UUID.randomUUID(), "DRAW", null))
                .isInstanceOf(DataIntegrityViolationException.class);
        for (String result : List.of("WIN", "LOSS")) {
            assertThatThrownBy(() -> insertGame(f.groupId(), f.owner().id(), result, null))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
        assertThatThrownBy(() -> insertGame(f.groupId(), f.owner().id(), "DRAW", f.creator().id()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertParticipant(gameId, f.creator().id(), f.creatorDeck()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertParticipant(UUID.randomUUID(), f.owner().id(), f.ownerDeck()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertParticipant(gameId, UUID.randomUUID(), f.ownerDeck()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertParticipant(gameId, f.owner().id(), UUID.randomUUID()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertParticipant(gameId, f.owner().id(), f.creatorDeck()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE games SET winner_user_id = ? WHERE id = ?",
                f.outsider().id(), gameId)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM decks WHERE id = ?", f.creatorDeck()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(games.count()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM game_participants", Long.class)).isEqualTo(2);
    }

    @Test
    void failedCommitRollsBackGameAndFirstUseTogether() throws Exception {
        Fixture f = fixture();
        assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
            GameDetails game = gameService.create(f.owner().id(), f.groupId(), assignments(f), GameResult.WIN,
                    f.creator().id());
            games.flush();
            // Force a deferred FK failure at commit after both the game and usage flags have been flushed.
            jdbc.update("UPDATE games SET winner_user_id = ? WHERE id = ?", f.outsider().id(), game.id());
        })).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(games.count()).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM game_participants", Long.class)).isZero();
        assertThat(decks.findAll()).allMatch(deck -> !deck.isEverUsed());
    }

    @Test
    void failedEditRollsBackReplacementAssignmentsResultAndNewDeckUsage() throws Exception {
        Fixture f = fixture();
        JsonNode game = expect(f.creator(), "POST", f.path(), body(f), CREATED.value());
        UUID replacement = deck(f.member());
        List<GameParticipant> assignments = List.of(assignments(f).get(0), new GameParticipant(f.member().id(), replacement));
        assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
            gameService.replace(f.creator().id(), f.groupId(), id(game), assignments, GameResult.DRAW, null);
            games.flush();
            jdbc.update("UPDATE games SET result = 'WIN', winner_user_id = ? WHERE id = ?", f.outsider().id(), id(game));
        })).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(expect(f.owner(), "GET", f.path() + "/" + id(game), "", OK.value())).isEqualTo(game);
        assertThat(decks.findById(replacement).orElseThrow().isEverUsed()).isFalse();
        assertThat(decks.findById(f.memberDeck()).orElseThrow().isEverUsed()).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"commander", "colors", "delete", "archive"})
    void firstCommittedGameSerializesConcurrentDeckChanges(String operation) throws Exception {
        Fixture f = fixture();
        int expected = operation.equals("archive") ? OK.value() : CONFLICT.value();
        race(() -> gameService.create(f.owner().id(), f.groupId(), assignments(f), GameResult.WIN, f.creator().id()),
                () -> deckOperation(f, operation, expected), "decks");
        assertThat(games.count()).isEqualTo(1);
        assertThat(decks.findById(f.creatorDeck()).orElseThrow().isEverUsed()).isTrue();
        assertThat(decks.findById(f.creatorDeck()).orElseThrow().getCommanders().getFirst().getName()).isEqualTo("Krenko");
        assertThat(decks.findById(f.creatorDeck()).orElseThrow().getColorIdentity().canonicalValue()).isEqualTo("R");
        assertThat(decks.findById(f.creatorDeck()).orElseThrow().isArchived()).isEqualTo(operation.equals("archive"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"archive", "delete", "commander"})
    void deckChangeCommitsBeforeWaitingGameAndGameRevalidatesFreshState(String operation) throws Exception {
        Fixture f = fixture();
        race(() -> {
            switch (operation) {
                case "archive" -> deckService.archive(f.creator().id(), f.creatorDeck());
                case "delete" -> deckService.delete(f.creator().id(), f.creatorDeck());
                case "commander" -> deckService.update(f.creator().id(), f.creatorDeck(), "Changed", CommanderTestProvider.inputs("Atraxa", List.of("G")));
                default -> throw new AssertionError(operation);
            }
            return null;
        }, () -> expect(f.owner(), "POST", f.path(), body(f), operation.equals("commander") ? CREATED.value() : BAD_REQUEST.value()), "decks");
        if (operation.equals("commander")) {
            assertThat(decks.findById(f.creatorDeck()).orElseThrow().isEverUsed()).isTrue();
            assertThat(decks.findById(f.creatorDeck()).orElseThrow().getCommanders().getFirst().getName()).isEqualTo("Atraxa");
            expect(f.creator(), "PUT", "/api/decks/" + f.creatorDeck(), deckBody("Late", "Krenko", List.of("R")), CONFLICT.value());
        } else {
            assertThat(games.count()).isZero();
            assertThat(decks.findAll()).allMatch(deck -> !deck.isEverUsed());
        }
    }

    @Test
    void rolledBackFirstUseDoesNotLockOutWaitingDeckUpdate() throws Exception {
        Fixture f = fixture();
        race(() -> {
            gameService.create(f.owner().id(), f.groupId(), assignments(f), GameResult.WIN, f.creator().id());
            return null;
        }, () -> deckOperation(f, "commander", OK.value()), "decks", true);
        assertThat(games.count()).isZero();
        assertThat(decks.findById(f.creatorDeck()).orElseThrow().isEverUsed()).isFalse();
        assertThat(decks.findById(f.creatorDeck()).orElseThrow().getCommanders().getFirst().getName()).isEqualTo("Atraxa");
    }

    @Test
    void leaveCommitsBeforeWaitingCreateAndInvalidatesNewParticipantAssignment() throws Exception {
        Fixture f = fixture();
        race(() -> {
            groupService.leave(f.member().id(), f.groupId());
            return null;
        }, () -> expect(f.owner(), "POST", f.path(), body(f), BAD_REQUEST.value()), "play_groups");
        assertThat(games.count()).isZero();
        assertThat(decks.findAll()).allMatch(deck -> !deck.isEverUsed());
    }

    @Test
    void gameCommitsBeforeWaitingLeavePreservingHistoricalData() throws Exception {
        Fixture f = fixture();
        race(() -> gameService.create(f.owner().id(), f.groupId(), assignments(f), GameResult.WIN, f.creator().id()),
                () -> expect(f.member(), "DELETE", "/api/groups/" + f.groupId() + "/membership", "", NO_CONTENT.value()), "play_groups");
        assertThat(expect(f.owner(), "GET", f.path(), "", OK.value()).get(0).get("participants").toString())
                .contains(f.member().id().toString());
        expect(f.member(), "GET", f.path(), "", FORBIDDEN.value());
    }

    @Test
    void leaveCommitsBeforeWaitingEditAndRevokesCreatorPermission() throws Exception {
        Fixture f = fixture();
        JsonNode game = expect(f.creator(), "POST", f.path(), body(f), CREATED.value());
        race(() -> {
            groupService.leave(f.creator().id(), f.groupId());
            return null;
        }, () -> expect(f.creator(), "PUT", f.path() + "/" + id(game), body(assignments(f), "DRAW", null), FORBIDDEN.value()),
                "play_groups");
        assertThat(expect(f.owner(), "GET", f.path() + "/" + id(game), "", OK.value())).isEqualTo(game);
    }

    @Test
    void replacementDeckUsageBlocksConcurrentCommanderMutation() throws Exception {
        Fixture f = fixture();
        JsonNode game = expect(f.creator(), "POST", f.path(), body(f), CREATED.value());
        UUID replacement = deck(f.creator());
        List<GameParticipant> participants = List.of(new GameParticipant(f.creator().id(), replacement), assignments(f).get(1));
        race(() -> gameService.replace(f.creator().id(), f.groupId(), id(game), participants, GameResult.DRAW, null),
                () -> expect(f.creator(), "PUT", "/api/decks/" + replacement,
                        deckBody("Changed", "Atraxa", List.of("G")), CONFLICT.value()), "decks");
        assertThat(decks.findById(replacement).orElseThrow().isEverUsed()).isTrue();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void chosenColorChangeWaitsForFirstUseCommitOrRollback(boolean rollback) throws Exception {
        Fixture f = fixture();
        UUID printing = UUID.randomUUID();
        CommanderTestProvider.put(printing, """
                {"object":"card","id":"%s","oracle_id":"%s","name":"The Prismatic Piper","lang":"en",
                 "layout":"normal","legalities":{"commander":"legal"},"type_line":"Legendary Creature — Shapeshifter",
                 "oracle_text":"If The Prismatic Piper is your commander, choose a color before the game begins. The Prismatic Piper is the chosen color.","color_identity":[]}
                """.formatted(printing, UUID.randomUUID()));
        String path = "/api/decks/" + f.creatorDeck();
        String initial = "{\"name\":\"Piper\",\"commanders\":[{\"selectionRef\":{\"scryfallCardId\":\"" + printing + "\"},\"chosenColor\":\"R\"}]}";
        String changed = initial.replace("\"R\"", "\"G\"");
        expect(f.creator(), "PUT", path, initial, OK.value());
        race(() -> gameService.create(f.owner().id(), f.groupId(), assignments(f), GameResult.WIN, f.creator().id()),
                () -> expect(f.creator(), "PUT", path, changed, rollback ? OK.value() : CONFLICT.value()), "decks", rollback);
        assertThat(decks.findById(f.creatorDeck()).orElseThrow().getCommanders().getFirst().getChosenColor())
                .isEqualTo(rollback ? "G" : "R");
        assertThat(decks.findById(f.creatorDeck()).orElseThrow().isEverUsed()).isEqualTo(!rollback);
    }

    @Test
    void overlappingDecksAcrossGroupsUseConsistentLockOrder() throws Exception {
        Fixture f = fixture();
        UUID other = groupService.create(f.owner().id(), "Other pod").id();
        String code = groupService.joinCode(f.owner().id(), other);
        groupService.join(f.creator().id(), code);
        groupService.join(f.member().id(), code);
        List<GameParticipant> reversed = assignments(f).reversed();
        race(() -> gameService.create(f.owner().id(), f.groupId(), assignments(f), GameResult.DRAW, null),
                () -> expect(f.owner(), "POST", "/api/groups/" + other + "/games", body(reversed, "DRAW", null), CREATED.value()),
                "decks");
        assertThat(games.count()).isEqualTo(2);
    }

    private JsonNode deckOperation(Fixture f, String operation, int status) throws Exception {
        String path = "/api/decks/" + f.creatorDeck();
        return switch (operation) {
            case "archive" -> expect(f.creator(), "POST", path + "/archive", "", status);
            case "delete" -> expect(f.creator(), "DELETE", path, "", status);
            case "colors" -> expect(f.creator(), "PUT", path, deckBody("Changed", "Krenko", List.of("G")), status);
            case "commander" -> expect(f.creator(), "PUT", path, deckBody("Changed", "Atraxa", List.of("R")), status);
            default -> throw new AssertionError(operation);
        };
    }

    private void race(Callable<?> first, Callable<?> second, String table) throws Exception {
        race(first, second, table, false);
    }

    private void race(Callable<?> first, Callable<?> second, String table, boolean rollback) throws Exception {
        CountDownLatch ready = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<?> holder = executor.submit(() -> transactions.executeWithoutResult(status -> {
                try {
                    first.call();
                    games.flush();
                    if (rollback) {
                        status.setRollbackOnly();
                    }
                    ready.countDown();
                    assertThat(release.await(20, TimeUnit.SECONDS)).isTrue();
                } catch (Exception exception) {
                    throw new IllegalStateException(exception);
                }
            }));
            try {
                assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
                Future<?> waiting = executor.submit(second);
                // Observe a real database lock wait; timing alone is not evidence of contention.
                await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
                    Long blocked = jdbc.queryForObject("""
                            SELECT count(*) FROM pg_stat_activity
                            WHERE wait_event_type = 'Lock' AND pid <> pg_backend_pid()
                              AND query LIKE ?
                            """, Long.class, "%" + table + "%");
                    assertThat(blocked).isPositive();
                    assertThat(waiting.isDone()).isFalse();
                });
                release.countDown();
                holder.get(10, TimeUnit.SECONDS);
                waiting.get(10, TimeUnit.SECONDS);
            } finally {
                release.countDown();
            }
        }
    }

    private void insertGame(UUID groupId, UUID creatorId, String result, UUID winner) {
        jdbc.update("""
                INSERT INTO games (id, group_id, creator_id, recorded_at, result, winner_user_id)
                VALUES (?, ?, ?, now(), ?, ?)
                """, UUID.randomUUID(), groupId, creatorId, result, winner);
    }

    private void insertParticipant(UUID gameId, UUID userId, UUID deckId) {
        jdbc.update("INSERT INTO game_participants (game_id, user_id, deck_id) VALUES (?, ?, ?)", gameId, userId, deckId);
    }
}
