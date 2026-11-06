package io.github.gandalfthejunior.mtgcommanderstats.deck.application;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckFormat;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.Deck;
import io.github.gandalfthejunior.mtgcommanderstats.deck.persistence.DeckRepository;
import io.github.gandalfthejunior.mtgcommanderstats.deck.persistence.DeckClaimRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Application boundary for game selection, permanent usage and historical display. */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class GameDecks {
    private final DeckRepository decks;
    private final DeckClaimRepository claims;

    public GameDecks(DeckRepository decks, DeckClaimRepository claims) {
        this.decks = decks;
        this.claims = claims;
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

    /** Call after the home-group lock; lock both owners' decks in UUID order. */
    public void lockForClaim(UUID profileId, UUID accountId) {
        claims.lockOwners(profileId, accountId);
    }

    /** The caller updates participations before committing the deferred ownership constraint. */
    public void moveForClaim(UUID profileId, UUID accountId) {
        claims.move(profileId, accountId);
    }

    public List<DeckDisplay> eligible(UUID ownerId) {
        return decks.findAllByOwnerIdAndArchivedFalseOrderByNameAscIdAsc(ownerId).stream()
                .map(DeckDisplay::from).toList();
    }

    public Map<UUID, DeckDisplay> display(Collection<UUID> deckIds) {
        return display(deckIds, Set.of());
    }

    /** Call only after group authorization; the supplied owners must be current active participants. */
    public Map<UUID, DeckDisplay> display(Collection<UUID> deckIds, Set<UUID> linkVisibleOwners) {
        return decks.findAllForDisplay(deckIds).stream()
                .map(deck -> DeckDisplay.from(deck, linkVisibleOwners.contains(deck.getOwnerId())))
                .collect(Collectors.toMap(DeckDisplay::id, Function.identity()));
    }

    public record DeckDisplay(UUID id, String name, List<CommanderSummary> commanders, List<String> colorIdentity,
            CompanionSummary companion, DeckFormat format, boolean archived, @JsonInclude(JsonInclude.Include.NON_NULL) String manaBoxUrl) {
        static DeckDisplay from(Deck deck) {
            return from(deck, false);
        }

        static DeckDisplay from(Deck deck, boolean includeLink) {
            return new DeckDisplay(deck.getId(), deck.getName(), deck.getCommanders().stream().map(CommanderSummary::from).toList(),
                    deck.getColorIdentity().symbols(), CompanionSummary.from(deck.getCompanion()), deck.getFormat(), deck.isArchived(), includeLink ? deck.getManaBoxUrl() : null);
        }
    }
}
