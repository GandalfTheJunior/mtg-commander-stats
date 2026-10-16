package io.github.gandalfthejunior.mtgcommanderstats.game.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.game.domain.Game;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GameRepository extends JpaRepository<Game, UUID> {
    Optional<Game> findByIdAndGroupId(UUID id, UUID groupId);

    @EntityGraph(attributePaths = "participants")
    List<Game> findAllByGroupIdOrderByRecordedAtDescIdDesc(UUID groupId);
}
