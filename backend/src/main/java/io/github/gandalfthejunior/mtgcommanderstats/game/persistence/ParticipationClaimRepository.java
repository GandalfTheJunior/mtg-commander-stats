package io.github.gandalfthejunior.mtgcommanderstats.game.persistence;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ParticipationClaimRepository {
    private final JdbcTemplate jdbc;

    public ParticipationClaimRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean sameGame(UUID profileId, UUID accountId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM game_participants p
                    JOIN game_participants a ON a.game_id = p.game_id
                    WHERE p.user_id = ? AND a.user_id = ?)
                """, Boolean.class, profileId, accountId));
    }

    public void move(UUID profileId, UUID accountId) {
        jdbc.update("UPDATE game_participants SET user_id = ? WHERE user_id = ?", accountId, profileId);
    }
}
