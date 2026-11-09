package io.github.gandalfthejunior.mtgcommanderstats.deck.application;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

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
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.PairingCapabilities;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

@Service
public class ManageDecks {
    private static final long TOKEN_BUDGET_NANOS = Duration.ofSeconds(1).toNanos();
    private final DeckRepository decks;

    private final ScryfallLookup scryfall;
    private final JdbcTemplate jdbc;

    public ManageDecks(DeckRepository decks, ScryfallLookup scryfall, JdbcTemplate jdbc) {
        this.decks = decks;
        this.scryfall = scryfall;
        this.jdbc = jdbc;
    }

    public record CreateResult(Deck deck, boolean replayed) { }

    @Transactional
    public CreateResult createIdempotent(UUID ownerId, UUID key, String name, List<CommanderInput> commanders,
            String manaBoxUrl, CompanionInput companion, DeckFormat format) {
        if (key != null) {
            // Serialize a single owner's keyed creates before the read. PostgreSQL never enters a failed
            // transaction, and the unique constraint remains the final integrity guard.
            jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?::text, 0))", Object.class, ownerId);
            Deck existing = decks.findByOwnerIdAndIdempotencyKey(ownerId, key).orElse(null);
            if (existing != null) {
                return new CreateResult(existing, true);
            }
        }
        Deck created = create(ownerId, name, commanders, manaBoxUrl, companion, format);
        created.setIdempotencyKey(key);
        return new CreateResult(created, false);
    }

    private List<DeckCommander> resolve(List<CommanderInput> inputs, DeckFormat format,
            List<DeckCommander> previous, long deadline, Map<UUID, JsonNode> requestCards, boolean deferTokens) {
        if (inputs == null || inputs.isEmpty() || inputs.size() > 2 || inputs.stream().anyMatch(Objects::isNull)) {
            throw new InvalidCommanderException();
        }
        Set<CommanderSelectionRef> skipTokens = new HashSet<>(previous.stream().map(DeckCommander::selectionRef).toList());
        inputs.stream().filter(input -> input.artwork() != null).map(CommanderInput::selectionRef).forEach(skipTokens::add);
        if (deferTokens) {
            inputs.stream().map(CommanderInput::selectionRef).forEach(skipTokens::add);
        }
        List<ResolvedCommander> resolved = scryfall.resolveCommandersOnline(
                inputs.stream().map(CommanderInput::selectionRef).toList(), format, skipTokens, deadline, requestCards);
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
        Map<UUID, JsonNode> requestCards = new HashMap<>();
        boolean deferTokens = hasArtwork(commanders, companion);
        // Required Companion validation must also precede optional token requests.
        DeckCompanion resolvedCompanion = companion == null ? null
                : new DeckCompanion(scryfall.resolveCompanionOnline(companion.selectionRef(), requestCards));
        long tokenDeadline = System.nanoTime() + TOKEN_BUDGET_NANOS;
        Deck deck = new Deck(ownerId, canonicalName, resolve(commanders, format, List.of(), tokenDeadline,
                requestCards, deferTokens));
        deck.replaceConfiguration(deck.getCommanders(), resolvedCompanion, format);
        deck.changeManaBoxUrl(normalizedUrl);
        for (int i = 0; i < commanders.size(); i++) {
            if (commanders.get(i).artwork() != null) {
                applyCommanderArtwork(deck.getCommanders().get(i), commanders.get(i).artwork(), false, tokenDeadline,
                        requestCards, deferTokens);
            }
        }
        if (companion != null && companion.artwork() != null) {
            applyCompanionArtwork(deck.getCompanion(), companion.artwork(), false, tokenDeadline, requestCards);
        }
        if (deferTokens) {
            enrichChangedCommanders(deck.getCommanders(), Map.of(), requestCards, tokenDeadline);
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
        long tokenDeadline = System.nanoTime() + TOKEN_BUDGET_NANOS;
        Map<UUID, JsonNode> requestCards = new HashMap<>();
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
        boolean deferTokens = hasArtwork(commanders, companionSupplied ? companion : null);
        DeckCompanion prospectiveCompanion = deck.getCompanion();
        if (companionSupplied) {
            if (companion == null) {
                prospectiveCompanion = null;
            } else if (prospectiveCompanion == null || !prospectiveCompanion.selectionRef().equals(companion.selectionRef())) {
                prospectiveCompanion = new DeckCompanion(scryfall.resolveCompanionOnline(companion.selectionRef(), requestCards));
            }
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
                prospectiveCommanders = resolve(commanders, target, deck.getCommanders(), tokenDeadline, requestCards,
                        deferTokens);
            }
        }
        List<CommanderInput> artworkInputs = commanders;
        Set<Integer> artworkPositions = artworkInputs == null ? Set.of() : java.util.stream.IntStream.range(0, artworkInputs.size())
                .filter(index -> artworkInputs.get(index) != null && artworkInputs.get(index).artwork() != null)
                .map(index -> index + 1).boxed().collect(Collectors.toSet());
        Map<UUID, SavedCommander> savedCommanders = deck.getCommanders().stream().map(SavedCommander::from)
                .collect(Collectors.toMap(SavedCommander::oracleId, saved -> saved));
        DeckCompanion savedCompanion = deck.getCompanion();
        deck.replaceConfiguration(prospectiveCommanders, prospectiveCompanion, target, artworkPositions,
                companionSupplied && companion != null && companion.artwork() != null);
        if (commanders != null) {
            for (int i = 0; i < commanders.size(); i++) {
                if (commanders.get(i).artwork() != null) {
                    DeckCommander current = deck.getCommanders().get(i);
                    boolean sameIdentity = savedCommanders.containsKey(current.getOracleId());
                    applyCommanderArtwork(current, commanders.get(i).artwork(), sameIdentity, tokenDeadline, requestCards,
                            deferTokens);
                }
            }
        }
        if (companionSupplied && companion != null && companion.artwork() != null) {
            applyCompanionArtwork(deck.getCompanion(), companion.artwork(), savedCompanion != null
                    && savedCompanion.getOracleId().equals(deck.getCompanion().getOracleId()), tokenDeadline,
                    requestCards);
        }
        if (deferTokens) {
            enrichChangedCommanders(deck.getCommanders(), savedCommanders, requestCards, tokenDeadline);
        }
        deck.rename(canonicalName);
        return deck;
    }

    private static boolean hasArtwork(List<CommanderInput> commanders, CompanionInput companion) {
        return companion != null && companion.artwork() != null
                || commanders != null && commanders.stream().anyMatch(input -> input != null && input.artwork() != null);
    }

    private record SavedCommander(UUID oracleId, UUID printingId, Integer artworkFaceIndex) {
        private static SavedCommander from(DeckCommander slot) {
            return new SavedCommander(slot.getOracleId(), slot.getScryfallCardId(), slot.getArtworkFaceIndex());
        }
    }

    private void enrichChangedCommanders(List<DeckCommander> current, Map<UUID, SavedCommander> previous,
            Map<UUID, JsonNode> requestCards, long deadline) {
        for (DeckCommander slot : current) {
            SavedCommander saved = previous.get(slot.getOracleId());
            if (saved == null || !saved.printingId().equals(slot.getScryfallCardId())
                    || !Objects.equals(saved.artworkFaceIndex(), slot.getArtworkFaceIndex())) {
                ScryfallLookup.TokenEnrichment tokens = scryfall.enrichKnownPrinting(slot.getScryfallCardId(),
                        requestCards, deadline);
                slot.replaceRelatedTokens(tokens.tokens(), tokens.retryNotBefore());
            }
        }
    }

    private void applyCommanderArtwork(DeckCommander commander, ArtworkInput input, boolean allowNoOp,
            long tokenDeadline, Map<UUID, JsonNode> requestCards, boolean deferTokens) {
        if (allowNoOp && sameArtwork(commander.getScryfallCardId(), commander.getArtworkFaceIndex(),
                commander.getUsableArtworkFaces(), commander.getArtCropUrl(), input)) {
            return;
        }
        ResolvedArtwork resolved = scryfall.resolveArtworkOnline(input.scryfallCardId(), commander.getOracleId().toString(),
                commander.getGameplayFaceIndex(), input.artworkFaceIndex(), !deferTokens, tokenDeadline, requestCards);
        commander.changeArtwork(resolved.selectionRef(), resolved.artwork(), resolved.cardFaces(),
                resolved.usableArtworkFaces());
        if (!deferTokens) {
            commander.replaceRelatedTokens(resolved.relatedTokens(), resolved.tokenRetryNotBefore());
        }
    }

    private void applyCompanionArtwork(DeckCompanion companion, ArtworkInput input, boolean allowNoOp,
            long tokenDeadline, Map<UUID, JsonNode> requestCards) {
        if (allowNoOp && sameArtwork(companion.getScryfallCardId(), companion.getArtworkFaceIndex(),
                companion.getUsableArtworkFaces(), companion.getArtCropUrl(), input)) {
            return;
        }
        ResolvedArtwork resolved = scryfall.resolveArtworkOnline(input.scryfallCardId(), companion.getOracleId().toString(),
                companion.getGameplayFaceIndex(), input.artworkFaceIndex(), false, tokenDeadline, requestCards);
        companion.changeArtwork(resolved.selectionRef(), resolved.artwork(), resolved.cardFaces(),
                resolved.usableArtworkFaces());
    }

    private static boolean sameArtwork(UUID savedPrinting, Integer savedFace, Integer usableFaces, String savedImage,
            ArtworkInput input) {
        return savedImage != null && savedPrinting.equals(input.scryfallCardId())
                && (Objects.equals(savedFace, input.artworkFaceIndex())
                        || input.artworkFaceIndex() == null && Integer.valueOf(1).equals(usableFaces));
    }

    @Transactional
    public Deck changeArtwork(UUID ownerId, UUID deckId, int position, UUID printingId, Integer artworkFaceIndex) {
        Deck deck = ownedDeck(ownerId, deckId);
        DeckCommander commander = deck.getCommanders().stream().filter(slot -> slot.getPosition() == position)
                .findFirst().orElseThrow(DeckNotFoundException::new);
        ResolvedArtwork resolved = scryfall.resolveArtworkOnline(printingId, commander.getOracleId().toString(),
                commander.getGameplayFaceIndex(), artworkFaceIndex, true);
        commander.changeArtwork(resolved.selectionRef(), resolved.artwork(), resolved.cardFaces(),
                resolved.usableArtworkFaces());
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
        companion.changeArtwork(resolved.selectionRef(), resolved.artwork(), resolved.cardFaces(),
                resolved.usableArtworkFaces());
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
