package io.github.gandalfthejunior.mtgcommanderstats.game.persistence;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.game.domain.Game;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface GameRepository extends JpaRepository<Game, UUID> {
    Optional<Game> findByIdAndGroupId(UUID id, UUID groupId);

    @EntityGraph(attributePaths = "participants")
    List<Game> findAllByGroupIdOrderByRecordedAtDescIdDesc(UUID groupId);

    @Query(value = """
            SELECT id FROM games WHERE group_id = :groupId
            ORDER BY played_on DESC NULLS LAST, recorded_at DESC, id DESC LIMIT 21
            """, nativeQuery = true)
    List<UUID> historyStart(UUID groupId);

    @Query(value = """
            SELECT id FROM (
                (SELECT id, played_on, recorded_at FROM games WHERE group_id = :groupId
                    AND played_on IS NOT NULL AND (played_on, recorded_at, id) < (:playedOn, :recordedAt, :id)
                    ORDER BY played_on DESC NULLS LAST, recorded_at DESC, id DESC LIMIT 21)
                UNION ALL
                (SELECT id, played_on, recorded_at FROM games WHERE group_id = :groupId AND played_on IS NULL
                    ORDER BY played_on DESC NULLS LAST, recorded_at DESC, id DESC LIMIT 21)
            ) candidates ORDER BY played_on DESC NULLS LAST, recorded_at DESC, id DESC LIMIT 21
            """, nativeQuery = true)
    List<UUID> historyKnown(UUID groupId, LocalDate playedOn, Instant recordedAt, UUID id);

    @Query(value = """
            SELECT id FROM games WHERE group_id = :groupId AND played_on IS NULL
                AND (recorded_at, id) < (:recordedAt, :id)
            ORDER BY played_on DESC NULLS LAST, recorded_at DESC, id DESC LIMIT 21
            """, nativeQuery = true)
    List<UUID> historyUnknown(UUID groupId, Instant recordedAt, UUID id);

    @EntityGraph(attributePaths = "participants")
    List<Game> findAllByGroupIdAndIdIn(UUID groupId, List<UUID> ids);
}
