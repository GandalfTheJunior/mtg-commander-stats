package io.github.gandalfthejunior.mtgcommanderstats;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameResult;
import io.github.gandalfthejunior.mtgcommanderstats.game.persistence.GameRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Query;

import static org.assertj.core.api.Assertions.assertThat;

class GameHistoryQueryPlanTest extends GameTestSupport {
    @Test
    void indexSupportsBoundedFirstKnownAndUnknownPagesOnLargeHistory() throws Exception {
        Fixture f = fixture();
        UUID source = createGame(f.creator().id(), f.groupId(), assignments(f), GameResult.DRAW, null).id();
        transactions.executeWithoutResult(status -> {
            jdbc.update("""
                    INSERT INTO games (id, group_id, creator_id, recorded_at, played_on, result, alternate_win_con)
                    SELECT md5(n::text)::uuid, group_id, creator_id, recorded_at,
                        CASE WHEN n % 3 = 0 THEN NULL ELSE DATE '2026-10-01' + (n % 30) END, result, alternate_win_con
                    FROM games CROSS JOIN generate_series(1, 12000) n WHERE id = ?
                    """, source);
            jdbc.update("""
                    INSERT INTO game_participants (game_id, user_id, deck_id, start_position, placement, winner, still_in_game)
                    SELECT g.id, p.user_id, p.deck_id, p.start_position, p.placement, p.winner, p.still_in_game
                    FROM games g CROSS JOIN game_participants p
                    WHERE g.group_id = ? AND g.id <> ? AND p.game_id = ?
                    """, f.groupId(), source, source);
        });
        jdbc.execute("ANALYZE games");
        for (String method : List.of("historyStart", "historyKnown", "historyUnknown")) {
            java.lang.reflect.Method queryMethod = java.util.Arrays.stream(GameRepository.class.getMethods())
                    .filter(candidate -> candidate.getName().equals(method)).findFirst().orElseThrow();
            String sql = queryMethod.getAnnotation(Query.class).value()
                    .replace(":groupId", "'" + f.groupId() + "'::uuid")
                    .replace(":playedOn", "DATE '2026-10-10'")
                    .replace(":recordedAt", "TIMESTAMPTZ '2026-12-01T00:00:00Z'")
                    .replace(":id", "'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid");
            String plan = String.join("\n", jdbc.queryForList("EXPLAIN (ANALYZE, BUFFERS) " + sql, String.class));
            assertThat(plan).as(method).contains("games_group_play_date_history_index")
                    .doesNotContain("Seq Scan", "Rows Removed by Filter");
            assertThat(jdbc.queryForList(sql)).hasSize(21);
        }
        assertThat(games.historyStart(f.groupId())).hasSize(21);
        assertThat(games.historyKnown(f.groupId(), LocalDate.of(2026, 10, 10),
                Instant.parse("2026-12-01T00:00:00Z"), UUID.fromString("ffffffff-ffff-ffff-ffff-ffffffffffff"))).hasSize(21);
        assertThat(games.historyUnknown(f.groupId(), Instant.parse("2026-12-01T00:00:00Z"),
                UUID.fromString("ffffffff-ffff-ffff-ffff-ffffffffffff"))).hasSize(21);
    }
}
