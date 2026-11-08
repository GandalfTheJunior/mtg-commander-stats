package io.github.gandalfthejunior.mtgcommanderstats.deck.application;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.Deck;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckName;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckFormat;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.InvalidDeckFormatException;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckCommander;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckCompanion;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.InvalidCommanderException;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.ManaBoxUrl;
import io.github.gandalfthejunior.mtgcommanderstats.deck.persistence.DeckRepository;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.application.ScryfallLookup;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.application.ResolvedCommander;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.application.ResolvedArtwork;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.PairingCapabilities;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ManageDecks {
    private final DeckRepository decks;

    private final ScryfallLookup scryfall;

    public ManageDecks(DeckRepository decks, ScryfallLookup scryfall) {
        this.decks = decks;
        this.scryfall = scryfall;
    }

    private List<DeckCommander> resolve(List<CommanderInput> inputs, DeckFormat format) {
        if (inputs == null || inputs.isEmpty() || inputs.size() > 2 || inputs.stream().anyMatch(Objects::isNull)) {
            throw new InvalidCommanderException();
        }
        List<ResolvedCommander> resolved = inputs.stream()
                .map(input -> scryfall.resolveCommanderOnline(input.selectionRef(), format)).toList();
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
        return create(ownerId, name, commanders, null);
    }

    @Transactional
    public Deck create(UUID ownerId, String name, List<CommanderInput> commanders, String manaBoxUrl) {
        return create(ownerId, name, commanders, manaBoxUrl, null);
    }

    @Transactional
    public Deck create(UUID ownerId, String name, List<CommanderInput> commanders, String manaBoxUrl,
            CompanionInput companion) {
        return create(ownerId, name, commanders, manaBoxUrl, companion, DeckFormat.COMMANDER);
    }

    @Transactional
    public Deck create(UUID ownerId, String name, List<CommanderInput> commanders, String manaBoxUrl,
            CompanionInput companion, DeckFormat format) {
        if (format == null || (format == DeckFormat.PAUPER_COMMANDER && companion != null)) {
            throw new InvalidDeckFormatException();
        }
        String normalizedUrl = manaBoxUrl == null ? null : new ManaBoxUrl(manaBoxUrl).value();
        String canonicalName = new DeckName(name).value();
        Deck deck = new Deck(ownerId, canonicalName, resolve(commanders, format));
        deck.replaceConfiguration(deck.getCommanders(), null, format);
        deck.changeManaBoxUrl(normalizedUrl);
        if (companion != null) {
            deck.replaceConfiguration(deck.getCommanders(), new DeckCompanion(scryfall.resolveCompanionOnline(companion.selectionRef())));
        }
        return decks.save(deck);
    }

    @Transactional
    public Deck update(UUID ownerId, UUID deckId, String name, List<CommanderInput> commanders) {
        return update(ownerId, deckId, name, commanders, false, null);
    }

    @Transactional
    public Deck update(UUID ownerId, UUID deckId, String name, List<CommanderInput> commanders,
            boolean manaBoxUrlSupplied, String manaBoxUrl) {
        return update(ownerId, deckId, name, commanders, manaBoxUrlSupplied, manaBoxUrl, false, null);
    }

    @Transactional
    public Deck update(UUID ownerId, UUID deckId, String name, List<CommanderInput> commanders,
            boolean manaBoxUrlSupplied, String manaBoxUrl, boolean companionSupplied, CompanionInput companion) {
        return update(ownerId, deckId, name, commanders, manaBoxUrlSupplied, manaBoxUrl,
                companionSupplied, companion, null);
    }

    @Transactional
    public Deck update(UUID ownerId, UUID deckId, String name, List<CommanderInput> commanders,
            boolean manaBoxUrlSupplied, String manaBoxUrl, boolean companionSupplied, CompanionInput companion,
            DeckFormat format) {
        Deck deck = ownedDeck(ownerId, deckId);
        String canonicalName = new DeckName(name).value();
        DeckFormat target = format == null ? deck.getFormat() : format;
        boolean formatChanged = target != deck.getFormat();
        deck.requireFormatChangeAllowed(target);
        boolean hasCompanion = companionSupplied ? companion != null : deck.getCompanion() != null;
        if (target == DeckFormat.PAUPER_COMMANDER && hasCompanion) {
            throw new InvalidDeckFormatException();
        }
        if (formatChanged && commanders == null) {
            commanders = deck.getCommanders().stream()
                    .map(saved -> new CommanderInput(saved.selectionRef(), saved.getChosenColor())).toList();
        }
        List<DeckCommander> prospectiveCommanders = deck.getCommanders();
        if (manaBoxUrlSupplied) {
            deck.changeManaBoxUrl(manaBoxUrl);
        }
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
            if (formatChanged || !unchanged) {
                prospectiveCommanders = resolve(commanders, target);
            }
        }
        DeckCompanion prospectiveCompanion = deck.getCompanion();
        if (companionSupplied) {
            if (companion == null) {
                prospectiveCompanion = null;
            } else if (prospectiveCompanion == null || !prospectiveCompanion.selectionRef().equals(companion.selectionRef())) {
                prospectiveCompanion = new DeckCompanion(scryfall.resolveCompanionOnline(companion.selectionRef()));
            }
        }
        deck.replaceConfiguration(prospectiveCommanders, prospectiveCompanion, target);
        deck.rename(canonicalName);
        return deck;
    }

    @Transactional
    public Deck changeArtwork(UUID ownerId, UUID deckId, int position, UUID printingId, Integer artworkFaceIndex) {
        Deck deck = ownedDeck(ownerId, deckId);
        DeckCommander commander = deck.getCommanders().stream().filter(slot -> slot.getPosition() == position)
                .findFirst().orElseThrow(DeckNotFoundException::new);
        ResolvedArtwork resolved = scryfall.resolveArtworkOnline(printingId, commander.getOracleId().toString(),
                commander.getGameplayFaceIndex(), artworkFaceIndex, true);
        commander.changeArtwork(resolved.selectionRef(), resolved.artwork(), resolved.cardFaces());
        commander.replaceRelatedTokens(resolved.relatedTokens(), resolved.tokenRetryNotBefore());
        return deck;
    }

    @Transactional
    public Deck changeCompanionArtwork(UUID ownerId, UUID deckId, UUID printingId, Integer artworkFaceIndex) {
        Deck deck = ownedDeck(ownerId, deckId);
        DeckCompanion companion = deck.getCompanion();
        if (companion == null) {
            throw new DeckNotFoundException();
        }
        ResolvedArtwork resolved = scryfall.resolveArtworkOnline(printingId, companion.getOracleId().toString(),
                companion.getGameplayFaceIndex(), artworkFaceIndex);
        companion.changeArtwork(resolved.selectionRef(), resolved.artwork(), resolved.cardFaces());
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

    /** Archives every deck of an owner, locking decks one by one in the ascending order used by game writes. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void archiveAllOwnedBy(UUID ownerId) {
        lockAllOwnedBy(ownerId).forEach(Deck::archive);
        decks.flush();
    }

    /**
     * Physically deletes every deck of an owner regardless of the usage lock. Only for owners without
     * participations: the participant foreign key still rejects deleting a deck referenced by a game.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void deleteAllOwnedBy(UUID ownerId) {
        decks.deleteAll(lockAllOwnedBy(ownerId));
        decks.flush();
    }

    private List<Deck> lockAllOwnedBy(UUID ownerId) {
        return decks.findIdsByOwnerId(ownerId).stream().sorted()
                .map(deckId -> decks.findByIdForUpdate(deckId).orElseThrow(DeckNotFoundException::new))
                .toList();
    }

    private Deck ownedDeck(UUID ownerId, UUID deckId) {
        Deck deck = decks.findByIdForUpdate(deckId).orElseThrow(DeckNotFoundException::new);
        if (!deck.getOwnerId().equals(ownerId)) {
            throw new DeckAccessDeniedException();
        }
        return deck;
    }
}
