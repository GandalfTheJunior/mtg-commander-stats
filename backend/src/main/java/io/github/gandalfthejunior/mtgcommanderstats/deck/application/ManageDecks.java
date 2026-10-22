package io.github.gandalfthejunior.mtgcommanderstats.deck.application;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.Deck;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckCommander;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.InvalidCommanderException;
import io.github.gandalfthejunior.mtgcommanderstats.deck.persistence.DeckRepository;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.application.ScryfallLookup;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.application.ResolvedCommander;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.PairingCapabilities;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ManageDecks {
    private final DeckRepository decks;

    private final ScryfallLookup scryfall;

    public ManageDecks(DeckRepository decks, ScryfallLookup scryfall) {
        this.decks = decks;
        this.scryfall = scryfall;
    }

    private List<DeckCommander> resolve(List<CommanderInput> inputs) {
        if (inputs == null || inputs.isEmpty() || inputs.size() > 2 || inputs.stream().anyMatch(Objects::isNull)) {
            throw new InvalidCommanderException();
        }
        List<ResolvedCommander> resolved = inputs.stream()
                .map(input -> scryfall.resolveCommanderOnline(input.selectionRef())).toList();
        if (resolved.size() == 1 ? !resolved.getFirst().gameplay().canBeSoleCommander()
                : !PairingCapabilities.compatible(resolved.get(0).gameplay(), resolved.get(1).gameplay())) {
            throw new InvalidCommanderException();
        }
        List<DeckCommander> commanders = new ArrayList<>();
        for (int i = 0; i < resolved.size(); i++) {
            commanders.add(new DeckCommander(i + 1, resolved.get(i), inputs.get(i).chosenColor()));
        }
        return List.copyOf(commanders);
    }

    @Transactional(readOnly = true)
    public List<Deck> list(UUID ownerId) {
        return decks.findAllByOwnerId(ownerId);
    }

    @Transactional
    public Deck create(UUID ownerId, String name, List<CommanderInput> commanders) {
        Deck deck = new Deck(ownerId, name, resolve(commanders));
        return decks.save(deck);
    }

    @Transactional
    public Deck update(UUID ownerId, UUID deckId, String name, List<CommanderInput> commanders) {
        Deck deck = ownedDeck(ownerId, deckId);
        if (commanders != null) {
            if (commanders.isEmpty() || commanders.size() > 2) {
                throw new InvalidCommanderException();
            }
            // Exact saved references are idempotent and remain usable offline.
            boolean unchanged = commanders.size() == deck.getCommanders().size();
            for (int i = 0; unchanged && i < commanders.size(); i++) {
                CommanderInput input = commanders.get(i);
                DeckCommander saved = deck.getCommanders().get(i);
                unchanged = input != null && saved.selectionRef().equals(input.selectionRef())
                        && Objects.equals(saved.getChosenColor(), input.chosenColor());
            }
            if (!unchanged) {
                deck.replaceCommanders(resolve(commanders));
            }
        }
        deck.rename(name);
        return deck;
    }

    @Transactional
    public void delete(UUID ownerId, UUID deckId) {
        Deck deck = ownedDeck(ownerId, deckId);
        deck.requireDeletable();
        decks.delete(deck);
    }

    @Transactional
    public Deck archive(UUID ownerId, UUID deckId) {
        Deck deck = ownedDeck(ownerId, deckId);
        deck.archive();
        return deck;
    }

    private Deck ownedDeck(UUID ownerId, UUID deckId) {
        Deck deck = decks.findByIdForUpdate(deckId).orElseThrow(DeckNotFoundException::new);
        if (!deck.getOwnerId().equals(ownerId)) {
            throw new DeckAccessDeniedException();
        }
        return deck;
    }
}
