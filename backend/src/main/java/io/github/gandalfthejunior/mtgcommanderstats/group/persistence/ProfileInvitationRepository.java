package io.github.gandalfthejunior.mtgcommanderstats.group.persistence;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ProfileInvitationRepository {
    private final JdbcTemplate jdbc;

    public ProfileInvitationRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void revoke(UUID profileId) {
        jdbc.update("""
                UPDATE profile_invitations SET revoked_at = clock_timestamp()
                WHERE profile_id = ? AND consumed_at IS NULL AND revoked_at IS NULL
                """, profileId);
    }

    public Optional<Instant> create(String hash, UUID profileId, UUID groupId, UUID issuerId) {
        return jdbc.query("""
                INSERT INTO profile_invitations (token_hash, profile_id, group_id, issuer_id, created_at, expires_at)
                SELECT ?, ?, ?, ?, t, t + interval '1 hour' FROM (SELECT clock_timestamp() AS t) times
                ON CONFLICT (token_hash) DO NOTHING RETURNING expires_at
                """, (row, index) -> row.getTimestamp(1).toInstant(), hash, profileId, groupId, issuerId)
                .stream().findFirst();
    }

    public Optional<Instant> current(UUID profileId) {
        return jdbc.query("""
                SELECT expires_at FROM profile_invitations
                WHERE profile_id = ? AND consumed_at IS NULL AND revoked_at IS NULL
                  AND expires_at > clock_timestamp()
                """, (row, index) -> row.getTimestamp(1).toInstant(), profileId).stream().findFirst();
    }

    public Optional<UUID> groupId(String hash) {
        return jdbc.query("SELECT group_id FROM profile_invitations WHERE token_hash = ?",
                (row, index) -> row.getObject(1, UUID.class), hash).stream().findFirst();
    }

    public Optional<Preview> preview(String hash) {
        return jdbc.query("""
                SELECT g.name, u.username FROM profile_invitations i
                JOIN play_groups g ON g.id = i.group_id
                JOIN users u ON u.id = i.profile_id
                WHERE i.token_hash = ? AND i.consumed_at IS NULL AND i.revoked_at IS NULL
                  AND i.expires_at > clock_timestamp() AND u.kind = 'QUICK_PROFILE' AND NOT u.deleted
                """, (row, index) -> new Preview(row.getString(1), row.getString(2)), hash)
                .stream().findFirst();
    }

    public Optional<UUID> availableProfile(String hash) {
        return jdbc.query("""
                SELECT i.profile_id FROM profile_invitations i JOIN users u ON u.id = i.profile_id
                WHERE i.token_hash = ? AND i.consumed_at IS NULL AND i.revoked_at IS NULL
                  AND i.expires_at > clock_timestamp() AND u.kind = 'QUICK_PROFILE' AND NOT u.deleted
                """, (row, index) -> row.getObject(1, UUID.class), hash).stream().findFirst();
    }

    public boolean consume(String hash, UUID accountId) {
        return jdbc.update("""
                WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS now)
                UPDATE profile_invitations SET consumed_at = instant.now, consumer_id = ? FROM instant
                WHERE token_hash = ? AND consumed_at IS NULL AND revoked_at IS NULL
                  AND expires_at > instant.now AND profile_id IS NOT NULL
                """, accountId, hash) == 1;
    }

    public record Preview(String groupName, String profileName) {
    }
}
