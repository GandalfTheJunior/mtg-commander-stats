package io.github.gandalfthejunior.mtgcommanderstats.deck.application;

import java.util.List;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.ColorIdentity;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.Deck;
import io.github.gandalfthejunior.mtgcommanderstats.deck.persistence.DeckRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ManageDecks {
    private final DeckRepository decks;

    public ManageDecks(DeckRepository decks) {
        this.decks = decks;
    }

    @Transactional(readOnly = true)
    public List<Deck> list(UUID ownerId) {
        return decks.findAllByOwnerId(ownerId);
    }

    @Transactional
    public Deck create(UUID ownerId, String name, String commander, List<String> colorIdentity) {
        Deck deck = new Deck(ownerId, name, commander, ColorIdentity.fromSymbols(colorIdentity));
        return decks.save(deck);
    }

    @Transactional
    public Deck update(UUID ownerId, UUID deckId, String name, String commander, List<String> colorIdentity) {
        Deck deck = ownedDeck(ownerId, deckId);
        deck.update(name, commander, ColorIdentity.fromSymbols(colorIdentity));
        return deck;
    }

    @Transactional
    public void delete(UUID ownerId, UUID deckId) {
        decks.delete(ownedDeck(ownerId, deckId));
    }

    private Deck ownedDeck(UUID ownerId, UUID deckId) {
        Deck deck = decks.findById(deckId).orElseThrow(DeckNotFoundException::new);
        if (!deck.getOwnerId().equals(ownerId)) {
            throw new DeckAccessDeniedException();
        }
        return deck;
    }
}
