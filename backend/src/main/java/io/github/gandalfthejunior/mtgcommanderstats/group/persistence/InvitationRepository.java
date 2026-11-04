package io.github.gandalfthejunior.mtgcommanderstats.group.persistence;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class InvitationRepository {
    private final JdbcTemplate jdbc;

    public InvitationRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Instant> create(String hash, UUID groupId, UUID issuerId) {
        return jdbc.query("""
                INSERT INTO group_invitations (token_hash, group_id, issuer_id, created_at, expires_at)
                SELECT ?, ?, ?, t, t + interval '24 hours' FROM (SELECT clock_timestamp() AS t) times
                ON CONFLICT (token_hash) DO NOTHING RETURNING expires_at
                """, (row, index) -> row.getTimestamp(1).toInstant(), hash, groupId, issuerId).stream().findFirst();
    }

    public Optional<UUID> groupId(String hash) {
        return jdbc.query("SELECT group_id FROM group_invitations WHERE token_hash = ?",
                (row, index) -> row.getObject(1, UUID.class), hash).stream().findFirst();
    }

    public boolean available(String hash) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM group_invitations
                WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > clock_timestamp())
                """, Boolean.class, hash));
    }

    public Optional<String> preview(String hash) {
        return jdbc.query("""
                SELECT g.name FROM group_invitations i JOIN play_groups g ON g.id = i.group_id
                WHERE i.token_hash = ? AND i.consumed_at IS NULL AND i.expires_at > clock_timestamp()
                """, (row, index) -> row.getString(1), hash).stream().findFirst();
    }

    public boolean consume(String hash, UUID actorId) {
        return jdbc.update("""
                WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS now)
                UPDATE group_invitations SET consumed_at = instant.now, consumer_id = ? FROM instant
                WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > instant.now
                """, actorId, hash) == 1;
    }
}
