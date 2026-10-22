package io.github.gandalfthejunior.mtgcommanderstats.deck.application;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.Deck;
import io.github.gandalfthejunior.mtgcommanderstats.deck.persistence.DeckRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Application boundary for game selection, permanent usage and historical display. */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class GameDecks {
    private final DeckRepository decks;

    public GameDecks(DeckRepository decks) {
        this.decks = decks;
    }

    public void use(Map<UUID, UUID> deckOwners) {
        List<Deck> selected = new ArrayList<>();
        // All writers lock the deck before inspecting its state. Stable order avoids
        // deadlocks when games in different groups use overlapping sets of decks.
        for (UUID deckId : deckOwners.keySet().stream().sorted().toList()) {
            Deck deck = decks.findByIdForUpdate(deckId).orElseThrow(InvalidDeckAssignmentException::new);
            if (!deck.getOwnerId().equals(deckOwners.get(deckId)) || deck.isArchived()) {
                throw new InvalidDeckAssignmentException();
            }
            selected.add(deck);
        }
        selected.forEach(Deck::markUsed);
    }

    public List<DeckDisplay> eligible(UUID ownerId) {
        return decks.findAllByOwnerIdAndArchivedFalseOrderByNameAscIdAsc(ownerId).stream()
                .map(DeckDisplay::from).toList();
    }

    public Map<UUID, DeckDisplay> display(Collection<UUID> deckIds) {
        return decks.findAllForDisplay(deckIds).stream().map(DeckDisplay::from)
                .collect(Collectors.toMap(DeckDisplay::id, Function.identity()));
    }

    public record DeckDisplay(UUID id, String name, List<CommanderSummary> commanders, List<String> colorIdentity,
            boolean archived) {
        static DeckDisplay from(Deck deck) {
            return new DeckDisplay(deck.getId(), deck.getName(), deck.getCommanders().stream().map(CommanderSummary::from).toList(),
                    deck.getColorIdentity().symbols(), deck.isArchived());
        }
    }
}
