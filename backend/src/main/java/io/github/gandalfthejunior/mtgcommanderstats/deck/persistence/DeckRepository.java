package io.github.gandalfthejunior.mtgcommanderstats.deck.persistence;

import java.util.List;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.Deck;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DeckRepository extends JpaRepository<Deck, UUID> {
    List<Deck> findAllByOwnerId(UUID ownerId);
}
