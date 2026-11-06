package io.github.gandalfthejunior.mtgcommanderstats;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import io.github.gandalfthejunior.mtgcommanderstats.game.application.HistoryCursor;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameResult;
import org.aopalliance.intercept.MethodInterceptor;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.aop.framework.Advised;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;

class GameHistoryHydrationRaceTest extends GameTestSupport {
    @ParameterizedTest
    @CsvSource({"1,true", "20,false"})
    void continuesFromSelectedTupleWhenExternalDeletionRemovesLastOrAllSelectedGames(int deleted, boolean knownDate)
            throws Exception {
        Fixture f = fixture();
        for (int i = 0; i < 41; i++) {
            createGame(f.creator().id(), f.groupId(), assignments(f), GameResult.DRAW, null);
        }
        jdbc.update("UPDATE games SET played_on = CASE WHEN ? THEN DATE '2026-10-31' ELSE NULL END, "
                + "recorded_at = '2026-11-01T12:00:00.123456Z' WHERE group_id = ?", knownDate, f.groupId());
        List<UUID> ordered = jdbc.query("SELECT id FROM games WHERE group_id = ? "
                + "ORDER BY played_on DESC NULLS LAST, recorded_at DESC, id DESC",
                (row, index) -> row.getObject(1, UUID.class), f.groupId());
        AtomicBoolean intercepted = new AtomicBoolean();
        MethodInterceptor deletion = invocation -> {
            if (invocation.getMethod().getName().equals("findAllByGroupIdAndIdIn")
                    && intercepted.compareAndSet(false, true)) {
                // A separate connection bypasses the application group lock, exactly between selection and hydration.
                CompletableFuture.runAsync(() -> transactions.executeWithoutResult(status -> {
                    for (UUID game : ordered.subList(20 - deleted, 20)) {
                        jdbc.update("DELETE FROM games WHERE id = ?", game);
                    }
                })).get(10, TimeUnit.SECONDS);
            }
            return invocation.proceed();
        };
        Advised repository = (Advised) games;
        repository.addAdvice(0, deletion);
        try {
            JsonNode first = expect(f.owner(), "GET", f.path() + "/history", "", 200);
            assertThat(intercepted.get()).isTrue();
            assertThat(ids(first)).containsExactlyElementsOf(ordered.subList(0, 20 - deleted));
            assertThat(first.get("nextCursor").isNull()).isFalse();
            HistoryCursor cursor = HistoryCursor.decode(first.get("nextCursor").asText(), f.groupId());
            assertThat(cursor.gameId()).isEqualTo(ordered.get(19));
            assertThat(cursor.playedOn() != null).isEqualTo(knownDate);
            JsonNode second = expect(f.owner(), "GET", f.path() + "/history?cursor=" + first.get("nextCursor").asText(), "", 200);
            assertThat(ids(second)).containsExactlyElementsOf(ordered.subList(20, 40));
            JsonNode last = expect(f.owner(), "GET", f.path() + "/history?cursor=" + second.get("nextCursor").asText(), "", 200);
            assertThat(ids(last)).containsExactly(ordered.getLast());
            assertThat(last.get("nextCursor").isNull()).isTrue();
        } finally {
            repository.removeAdvice(deletion);
        }
    }

    private List<UUID> ids(JsonNode page) {
        List<UUID> ids = new ArrayList<>();
        page.get("games").forEach(game -> ids.add(id(game)));
        return ids;
    }
}
