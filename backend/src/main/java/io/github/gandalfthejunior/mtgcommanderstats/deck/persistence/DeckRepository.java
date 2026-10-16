package io.github.gandalfthejunior.mtgcommanderstats.deck.persistence;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.Deck;
import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import org.hibernate.jpa.HibernateHints;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;

public interface DeckRepository extends JpaRepository<Deck, UUID> {
    List<Deck> findAllByOwnerId(UUID ownerId);
    List<Deck> findAllByOwnerIdAndArchivedFalseOrderByNameAscIdAsc(UUID ownerId);

    // Display-only loads must not dirty-check converted value objects at commit.
    @QueryHints(@QueryHint(name = HibernateHints.HINT_READ_ONLY, value = "true"))
    @Query("select deck from Deck deck where deck.id in :ids")
    List<Deck> findAllForDisplay(@Param("ids") Collection<UUID> ids);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select deck from Deck deck where deck.id = :id")
    Optional<Deck> findByIdForUpdate(@Param("id") UUID id);
}
