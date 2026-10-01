package io.github.gandalfthejunior.mtgcommanderstats.group.persistence;

import java.util.Optional;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.group.domain.PlayGroup;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PlayGroupRepository extends JpaRepository<PlayGroup, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select playGroup from PlayGroup playGroup where playGroup.id = :id")
    Optional<PlayGroup> findByIdForUpdate(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select playGroup from PlayGroup playGroup where playGroup.joinCode = :joinCode")
    Optional<PlayGroup> findByJoinCodeForUpdate(@Param("joinCode") String joinCode);
}
