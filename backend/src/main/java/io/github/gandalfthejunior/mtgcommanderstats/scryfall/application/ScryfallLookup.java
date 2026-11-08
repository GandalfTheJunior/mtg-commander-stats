package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckFormat;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.Artwork;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CardDetails;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderChoice;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CompanionChoice;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CompanionRules;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.GameplayCard;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.InvalidCompanionSelectionException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.InvalidScryfallSelectionException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.MalformedScryfallResponseException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.PairingCapabilities;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.RelatedToken;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.ScryfallNormalizer;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClient;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClientException;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

@Service
public class ScryfallLookup {
    static final Duration INLINE_TOKEN_BUDGET = Duration.ofSeconds(1);
    private static final Duration CACHE_TTL = Duration.ofMinutes(5);
    private static final int MAX_PAGES = 3;
    private static final int MAX_PAGE_CARDS = 175;
    private static final int MAX_SEARCH_CARDS = 40;
    private static final int MAX_SUGGESTIONS = 20;
    private static final int MAX_ARTWORKS = 200;
    private static final int MAX_ORACLE_BATCH = 8;
    private final ScryfallClient client;
    private final ScryfallNormalizer normalizer;
    private final RelatedTokenLookup relatedTokens;
    private final BoundedCache<String, List<CommanderChoice>> searches =
            new BoundedCache<>(128, CACHE_TTL, System::nanoTime);
    private final BoundedCache<String, List<CommanderChoice>> partnerSearches =
            new BoundedCache<>(128, CACHE_TTL, System::nanoTime);
    private final BoundedCache<String, List<CompanionChoice>> companionSearches =
            new BoundedCache<>(128, CACHE_TTL, System::nanoTime);
    private final BoundedCache<UUID, FetchedCard> cards =
            new BoundedCache<>(256, CACHE_TTL, System::nanoTime);
    private final BoundedCache<CommanderSelectionRef, List<Artwork>> artworkLists =
            new BoundedCache<>(128, CACHE_TTL, System::nanoTime);
    private final BoundedCache<String, JsonNode> oracleCards =
            new BoundedCache<>(256, CACHE_TTL, System::nanoTime);
    private final BoundedCache<String, Boolean> pauperEligibility =
            new BoundedCache<>(256, CACHE_TTL, System::nanoTime);

    public ScryfallLookup(ScryfallClient client, ScryfallNormalizer normalizer, RelatedTokenLookup relatedTokens) {
        this.client = client;
        this.normalizer = normalizer;
        this.relatedTokens = relatedTokens;
    }

    public List<CommanderChoice> searchCommanders(String input) {
        return searchCommanders(input, DeckFormat.COMMANDER);
    }

    public List<CommanderChoice> searchCommanders(String input, DeckFormat format) {
        String name = normalizeQuery(input);
        String literalName = name.toLowerCase(Locale.ROOT);
        String key = format + ":" + literalName;
        List<CommanderChoice> cached = searches.get(key);
        if (cached != null) {
            return cached;
        }
        String query = "name:/" + literalRegex(name) + "/ " + formatFilter(format)
                + (format == DeckFormat.COMMANDER ? " (is:commander or t:background or kw:\"Doctor's companion\")" : "");
        List<JsonNode> rawCards = collectSearch(query, false, MAX_SEARCH_CARDS);
        Map<String, JsonNode> metadata = reversibleMetadata(rawCards);
        Set<String> eligibleFaces = format == DeckFormat.PAUPER_COMMANDER ? pauperReversibleIdentities(rawCards) : Set.of();
        Map<String, CommanderChoice> distinct = new LinkedHashMap<>();
        for (JsonNode raw : rawCards) {
            if (!raw.path("lang").isTextual()) {
                throw new MalformedScryfallResponseException();
            }
            if (!"en".equals(raw.path("lang").asText())) {
                continue;
            }
            CardDetails card = normalizer.normalize(raw, metadata, format);
            for (CommanderChoice choice : card.commanderSelections()) {
                if (!choice.name().toLowerCase(Locale.ROOT).contains(literalName)) {
                    continue;
                }
                GameplayCard gameplay = normalizer.resolve(card, choice.selectionRef(), format);
                if (format == DeckFormat.PAUPER_COMMANDER && "reversible_card".equals(card.layout())
                        && !eligibleFaces.contains(gameplay.oracleId())) {
                    continue;
                }
                distinct.putIfAbsent(gameplay.oracleId(), choice);
                if (distinct.size() == MAX_SUGGESTIONS) {
                    List<CommanderChoice> result = List.copyOf(distinct.values());
                    searches.put(key, result);
                    return result;
                }
            }
        }
        List<CommanderChoice> result = List.copyOf(distinct.values());
        searches.put(key, result);
        return result;
    }

    public List<CompanionChoice> searchCompanions(String input) {
        String name = normalizeQuery(input);
        String key = name.toLowerCase(Locale.ROOT);
        List<CompanionChoice> cached = companionSearches.get(key);
        if (cached != null) {
            return cached;
        }
        String query = "name:/" + literalRegex(name) + "/ lang:en game:paper f:commander kw:companion";
        List<JsonNode> rawCards = collectSearch(query, false, MAX_SEARCH_CARDS);
        Map<String, JsonNode> metadata = reversibleMetadata(rawCards);
        Map<String, CompanionChoice> distinct = new LinkedHashMap<>();
        for (JsonNode raw : rawCards) {
            if (!raw.path("lang").isTextual()) {
                throw new MalformedScryfallResponseException();
            }
            if (!"en".equals(raw.path("lang").asText())) {
                continue;
            }
            CardDetails card = normalizer.normalize(raw, metadata);
            for (GameplayCard gameplay : card.gameplayCards()) {
                if (gameplay.oracleId() != null && CompanionRules.rejection(gameplay) == null
                        && gameplay.name().toLowerCase(Locale.ROOT).contains(key)) {
                    distinct.putIfAbsent(gameplay.oracleId(), new CompanionChoice(
                            new CommanderSelectionRef(card.scryfallCardId(), gameplay.gameplayFaceIndex()),
                            gameplay.name(), gameplay.colorIdentity(), ScryfallNormalizer.thumbnail(raw, gameplay.gameplayFaceIndex())));
                }
            }
        }
        List<CompanionChoice> result = distinct.values().stream().limit(MAX_SUGGESTIONS).toList();
        companionSearches.put(key, result);
        return result;
    }

    /** Changed Companion selections always use fresh authoritative rules, regardless of search caches. */
    public ResolvedCompanion resolveCompanionOnline(CommanderSelectionRef reference) {
        validateReference(reference);
        CardDetails card = fetchCard(reference.scryfallCardId()).details();
        GameplayCard gameplay = normalizer.resolveIdentity(card, reference);
        String rejection = CompanionRules.rejection(gameplay);
        if (rejection != null) {
            throw new InvalidCompanionSelectionException(rejection);
        }
        return new ResolvedCompanion(card, gameplay);
    }

    public CardDetails cardDetails(UUID id) {
        return ordinaryCard(id).details();
    }

    /** Context is an entire gameplay reference. Filtering and identity deduplication precede the cap. */
    public List<CommanderChoice> searchPartners(String input, CommanderSelectionRef partnerOf) {
        return searchPartners(input, partnerOf, DeckFormat.COMMANDER);
    }

    public List<CommanderChoice> searchPartners(String input, CommanderSelectionRef partnerOf, DeckFormat format) {
        validateReference(partnerOf);
        boolean immediate = input == null || input.isEmpty();
        String name = immediate ? "" : normalizeQuery(input);
        String key = format + ":" + partnerOf + ":" + name.toLowerCase(Locale.ROOT);
        List<CommanderChoice> cached = partnerSearches.get(key);
        if (cached != null) {
            return cached;
        }
        FetchedCard fetched = ordinaryCard(partnerOf.scryfallCardId());
        CardDetails context = format == DeckFormat.COMMANDER ? fetched.details()
                : normalizer.normalize(fetched.raw(), reversibleMetadata(List.of(fetched.raw())), format);
        GameplayCard first = normalizer.resolve(context, partnerOf, format);
        if (format == DeckFormat.PAUPER_COMMANDER && !cachedPauperEligible(first.oracleId())) {
            throw new InvalidScryfallSelectionException();
        }
        List<String> filters = partnerFilters(first.pairing(), immediate);
        if (filters.isEmpty()) {
            return List.of();
        }
        String query = (immediate ? "" : "name:/" + literalRegex(name) + "/ ")
                + formatFilter(format) + " (" + String.join(" or ", filters) + ")";
        List<JsonNode> candidates = collectSearch(query, false, MAX_PAGES * MAX_PAGE_CARDS);
        Map<String, JsonNode> metadata = reversibleMetadata(candidates);
        Set<String> eligibleFaces = format == DeckFormat.PAUPER_COMMANDER ? pauperReversibleIdentities(candidates) : Set.of();
        Map<String, CommanderChoice> distinct = new LinkedHashMap<>();
        for (JsonNode raw : candidates) {
            if (!raw.path("lang").isTextual()) {
                throw new MalformedScryfallResponseException();
            }
            if (!"en".equals(raw.path("lang").asText())) {
                continue;
            }
            CardDetails card = normalizer.normalize(raw, metadata, format);
            for (CommanderChoice choice : card.commanderSelections()) {
                GameplayCard second = normalizer.resolve(card, choice.selectionRef(), format);
                if (format == DeckFormat.PAUPER_COMMANDER && "reversible_card".equals(card.layout())
                        && !eligibleFaces.contains(second.oracleId())) {
                    continue;
                }
                if (choice.name().toLowerCase(Locale.ROOT).contains(name.toLowerCase(Locale.ROOT))
                        && PairingCapabilities.compatible(first, second)
                        && (!immediate || (first.pairing().partnerWith().contains(choice.name().toLowerCase(Locale.ROOT))
                            && second.pairing().partnerWith().contains(first.name().toLowerCase(Locale.ROOT))))) {
                    distinct.putIfAbsent(second.oracleId(), choice);
                }
            }
        }
        List<CommanderChoice> result = distinct.values().stream().limit(MAX_SUGGESTIONS).toList();
        partnerSearches.put(key, result);
        return result;
    }

    private static List<String> partnerFilters(PairingCapabilities pairing, boolean immediate) {
        List<String> filters = new ArrayList<>();
        for (String name : pairing.partnerWith()) {
            filters.add("name:/^" + literalRegex(name) + "$/");
        }
        if (immediate) {
            return filters;
        }
        for (String role : pairing.roles()) {
            switch (role) {
                case PairingCapabilities.PARTNER -> filters.add("kw:partner");
                case PairingCapabilities.CHOOSE_BACKGROUND -> filters.add("(t:legendary t:enchantment t:background)");
                case PairingCapabilities.BACKGROUND -> filters.add("(t:legendary t:creature o:\"Choose a Background\")");
                case PairingCapabilities.DOCTOR -> filters.add("o:\"Doctor's companion\"");
                case PairingCapabilities.COMPANION -> filters.add("(t:legendary t:creature t:doctor)");
                default -> { /* Unknown roles never authorize a pair. */ }
            }
        }
        for (String variant : pairing.variants()) {
            filters.add("o:/Partner[ ]*[—–][ ]*" + literalRegex(variant) + "/");
            if ("friends forever".equals(variant)) {
                filters.add("kw:\"Friends forever\"");
            }
        }
        return filters;
    }

    private FetchedCard ordinaryCard(UUID id) {
        requireId(id);
        FetchedCard cached = cards.get(id);
        if (cached != null) {
            return cached;
        }
        FetchedCard result = fetchCard(id);
        cards.put(id, result);
        return result;
    }

    /** Always contacts Scryfall for the selected printing, even after a cached search/detail read. */
    public ResolvedCommander resolveCommanderOnline(CommanderSelectionRef reference) {
        return resolveCommanderOnline(reference, DeckFormat.COMMANDER);
    }

    public ResolvedCommander resolveCommanderOnline(CommanderSelectionRef reference, DeckFormat format) {
        ValidatedCommander validated = validateCommanderOnline(reference, format);
        return enrichCommander(validated, System.nanoTime() + INLINE_TOKEN_BUDGET.toNanos());
    }

    /** Complete every required identity lookup before optional enrichment can set a provider cooldown. */
    public List<ResolvedCommander> resolveCommandersOnline(List<CommanderSelectionRef> references, DeckFormat format) {
        return resolveCommandersOnline(references, format, Set.of());
    }

    public List<ResolvedCommander> resolveCommandersOnline(List<CommanderSelectionRef> references, DeckFormat format,
            Set<CommanderSelectionRef> preservedSnapshots) {
        List<ValidatedCommander> validated = references.stream()
                .map(reference -> validateCommanderOnline(reference, format)).toList();
        long deadline = System.nanoTime() + INLINE_TOKEN_BUDGET.toNanos();
        return validated.stream().map(card -> preservedSnapshots.contains(
                new CommanderSelectionRef(card.card().scryfallCardId(), card.gameplay().gameplayFaceIndex()))
                        ? new ResolvedCommander(card.card(), card.gameplay()) : enrichCommander(card, deadline)).toList();
    }

    private ResolvedCommander enrichCommander(ValidatedCommander validated, long deadline) {
        return new ResolvedCommander(validated.card(), validated.gameplay(), optionalTokens(validated.raw(), deadline), client.cooldownUntil());
    }

    private ValidatedCommander validateCommanderOnline(CommanderSelectionRef reference, DeckFormat format) {
        validateReference(reference);
        JsonNode raw = client.card(reference.scryfallCardId());
        CardDetails card = normalizer.normalize(raw, reversibleMetadata(List.of(raw)), format);
        if (!reference.scryfallCardId().equals(card.scryfallCardId())) {
            throw new MalformedScryfallResponseException();
        }
        GameplayCard gameplay = normalizer.resolve(card, reference, format);
        if (format == DeckFormat.PAUPER_COMMANDER && !pauperEligible(gameplay.oracleId())) {
            throw new InvalidScryfallSelectionException();
        }
        return new ValidatedCommander(card, gameplay, raw);
    }

    private List<RelatedToken> optionalTokens(JsonNode raw, long deadline) {
        try {
            return relatedTokens.resolveInline(raw, deadline);
        } catch (ScryfallClientException | MalformedScryfallResponseException exception) {
            return null;
        }
    }

    private static String formatFilter(DeckFormat format) {
        return format == DeckFormat.PAUPER_COMMANDER
                ? "lang:en (game:paper or game:mtgo) is:PauperCommander"
                : "lang:en game:paper f:commander";
    }

    /** Fresh identity lookup delegates cross-printing rarity, release exclusions and bans to Scryfall. */
    private boolean pauperEligible(String oracleId) {
        return collectSearch("oracleid:" + authoritativeUuid(oracleId) + " is:PauperCommander -layout:reversible_card", false, MAX_SEARCH_CARDS)
                .stream().anyMatch(raw -> !"reversible_card".equals(raw.path("layout").asText())
                        && oracleId.equals(raw.path("oracle_id").asText()));
    }

    /** Search context only; deck writes always bypass this cache through pauperEligible. */
    private boolean cachedPauperEligible(String oracleId) {
        Boolean cached = pauperEligibility.get(oracleId);
        if (cached != null) {
            return cached;
        }
        boolean eligible = pauperEligible(oracleId);
        pauperEligibility.put(oracleId, eligible);
        return eligible;
    }

    /** Reversible suggestions must authorize each gameplay identity, with the existing Oracle batch bound. */
    private Set<String> pauperReversibleIdentities(List<JsonNode> rawCards) {
        Set<String> required = new LinkedHashSet<>();
        for (JsonNode raw : rawCards) {
            if ("reversible_card".equals(raw.path("layout").asText())) {
                for (JsonNode face : raw.path("card_faces")) {
                    if (face.hasNonNull("oracle_id")) {
                        required.add(authoritativeUuid(face.path("oracle_id").asText()));
                    }
                }
            }
        }
        List<String> identities = List.copyOf(required);
        Set<String> eligible = new LinkedHashSet<>();
        for (int offset = 0; offset < identities.size(); offset += MAX_ORACLE_BATCH) {
            List<String> batch = identities.subList(offset, Math.min(offset + MAX_ORACLE_BATCH, identities.size()));
            String query = "(" + String.join(" or ", batch.stream().map(id -> "oracleid:" + id).toList())
                    + ") is:PauperCommander -layout:reversible_card";
            for (JsonNode raw : collectSearch(query, false, MAX_PAGE_CARDS)) {
                String id = raw.path("oracle_id").asText();
                if (!"reversible_card".equals(raw.path("layout").asText()) && batch.contains(id)) {
                    eligible.add(id);
                }
            }
        }
        return Set.copyOf(eligible);
    }

    /** Convenience boundary for callers requiring a standalone Commander. */
    public ResolvedCommander resolveStandaloneCommanderOnline(CommanderSelectionRef reference) {
        ResolvedCommander resolved = resolveCommanderOnline(reference);
        if (!resolved.gameplay().canBeSoleCommander()) {
            throw new InvalidScryfallSelectionException();
        }
        return resolved;
    }

    /** Validate a new printing against the persisted gameplay identity, independently of display side. */
    public ResolvedArtwork resolveArtworkOnline(UUID printingId, String oracleId, Integer previousGameplayFace,
            Integer artworkFaceIndex) {
        return resolveArtworkOnline(printingId, oracleId, previousGameplayFace, artworkFaceIndex, false);
    }

    public ResolvedArtwork resolveArtworkOnline(UUID printingId, String oracleId, Integer previousGameplayFace,
            Integer artworkFaceIndex, boolean commanderTokens) {
        requireId(printingId);
        FetchedCard fetched = fetchCard(printingId);
        List<GameplayCard> matches = fetched.details().gameplayCards().stream()
                .filter(gameplay -> oracleId.equals(gameplay.oracleId())).toList();
        GameplayCard gameplay = matches.stream()
                .filter(candidate -> Objects.equals(candidate.gameplayFaceIndex(), previousGameplayFace))
                .findFirst().orElseGet(() -> matches.stream().findFirst().orElseThrow(InvalidScryfallSelectionException::new));
        List<Artwork> images = fetched.artworks();
        Artwork selected = artworkFaceIndex == null
                ? (images.size() == 1 ? images.getFirst() : null)
                : images.stream().filter(image -> artworkFaceIndex.equals(image.artworkFaceIndex())).findFirst().orElse(null);
        if (selected == null) {
            throw new InvalidScryfallSelectionException();
        }
        return new ResolvedArtwork(new CommanderSelectionRef(printingId, gameplay.gameplayFaceIndex()), selected,
                fetched.details().cardFaces(), commanderTokens
                        ? optionalTokens(fetched.raw(), System.nanoTime() + INLINE_TOKEN_BUDGET.toNanos()) : null,
                client.cooldownUntil());
    }

    public List<Artwork> artworks(UUID id, Integer gameplayFaceIndex) {
        requireId(id);
        CommanderSelectionRef reference = new CommanderSelectionRef(id, gameplayFaceIndex);
        validateReference(reference);
        FetchedCard fetched = ordinaryCard(id);
        CardDetails card = fetched.details();
        String oracleId;
        Artwork initialArtwork;
        if ("reversible_card".equals(card.layout())) {
            GameplayCard gameplay = normalizer.resolveIdentity(card, reference);
            oracleId = gameplay.oracleId();
            initialArtwork = gameplay.defaultArtwork();
        } else {
            if (gameplayFaceIndex != null || card.oracleId() == null) {
                throw new InvalidScryfallSelectionException();
            }
            oracleId = card.oracleId();
            initialArtwork = card.defaultArtwork();
        }
        List<Artwork> cached = artworkLists.get(reference);
        if (cached != null) {
            return cached;
        }
        List<JsonNode> printings = collectSearch("oracleid:" + oracleId, true,
                MAX_PAGES * MAX_PAGE_CARDS);
        Map<String, Artwork> distinct = new LinkedHashMap<>();
        // Include every selected-printing side even when older alternative printings fill the page bound.
        addArtwork(distinct, initialArtwork);
        for (Artwork artwork : fetched.artworks()) {
            addArtwork(distinct, artwork);
        }
        for (JsonNode printing : printings) {
            if (!containsOracle(printing, oracleId)) {
                throw new MalformedScryfallResponseException();
            }
            for (Artwork artwork : normalizer.artworks(printing)) {
                addArtwork(distinct, artwork);
                if (distinct.size() == MAX_ARTWORKS) {
                    List<Artwork> result = List.copyOf(distinct.values());
                    artworkLists.put(reference, result);
                    return result;
                }
            }
        }
        List<Artwork> result = List.copyOf(distinct.values());
        artworkLists.put(reference, result);
        return result;
    }

    private FetchedCard fetchCard(UUID id) {
        JsonNode raw = client.card(id);
        CardDetails result = normalizer.normalize(raw, reversibleMetadata(List.of(raw)));
        if (!id.equals(result.scryfallCardId())) {
            throw new MalformedScryfallResponseException();
        }
        return new FetchedCard(raw, result, normalizer.artworks(raw));
    }

    private Map<String, JsonNode> reversibleMetadata(List<JsonNode> rawCards) {
        Set<String> required = new LinkedHashSet<>();
        for (JsonNode card : rawCards) {
            if ("reversible_card".equals(card.path("layout").asText())) {
                JsonNode faces = card.path("card_faces");
                if (!faces.isArray() || faces.size() > MAX_ORACLE_BATCH) {
                    throw new MalformedScryfallResponseException();
                }
                for (JsonNode face : faces) {
                    if (face.hasNonNull("oracle_id")) {
                        required.add(authoritativeUuid(face.path("oracle_id").asText()));
                    }
                }
            }
        }
        Map<String, JsonNode> metadata = new LinkedHashMap<>();
        List<String> missing = new ArrayList<>();
        for (String id : required) {
            JsonNode cached = oracleCards.get(id);
            if (cached == null) {
                missing.add(id);
            } else {
                metadata.put(id, cached);
            }
        }
        for (int offset = 0; offset < missing.size(); offset += MAX_ORACLE_BATCH) {
            List<String> batch = missing.subList(offset, Math.min(offset + MAX_ORACLE_BATCH, missing.size()));
            String query = "(" + String.join(" or ", batch.stream().map(id -> "oracleid:" + id).toList())
                    + ") -layout:reversible_card lang:en";
            for (JsonNode result : collectSearch(query, false, MAX_PAGE_CARDS)) {
                String id = result.path("oracle_id").asText();
                if (batch.contains(id) && !"reversible_card".equals(result.path("layout").asText())) {
                    normalizer.normalize(result);
                    metadata.putIfAbsent(id, result);
                    oracleCards.put(id, result);
                }
            }
            if (!metadata.keySet().containsAll(batch)) {
                throw new MalformedScryfallResponseException();
            }
        }
        return metadata;
    }

    private List<JsonNode> collectSearch(String query, boolean printings, int limit) {
        JsonNode page;
        try {
            page = printings ? client.printings(query) : client.search(query);
        } catch (ScryfallClientException exception) {
            if (exception.kind() == ScryfallClientException.Kind.NOT_FOUND) {
                return List.of();
            }
            throw exception;
        }
        List<JsonNode> result = new ArrayList<>();
        Set<String> visited = new LinkedHashSet<>();
        for (int pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
            if (page == null || !"list".equals(page.path("object").asText())
                    || !page.path("data").isArray() || page.path("data").size() > MAX_PAGE_CARDS
                    || !page.path("has_more").isBoolean()) {
                throw new MalformedScryfallResponseException();
            }
            for (JsonNode card : page.path("data")) {
                if (!card.isObject()) {
                    throw new MalformedScryfallResponseException();
                }
                result.add(card);
                if (result.size() == limit) {
                    return List.copyOf(result);
                }
            }
            if (!page.path("has_more").asBoolean() || pageNumber + 1 == MAX_PAGES) {
                return List.copyOf(result);
            }
            JsonNode next = page.path("next_page");
            if (!next.isTextual() || !visited.add(next.asText())) {
                throw new MalformedScryfallResponseException();
            }
            try {
                page = client.nextPage(next.asText());
            } catch (ScryfallClientException exception) {
                if (exception.kind() == ScryfallClientException.Kind.NOT_FOUND) {
                    throw new MalformedScryfallResponseException();
                }
                throw exception;
            }
        }
        return List.copyOf(result);
    }

    private static void addArtwork(Map<String, Artwork> distinct, Artwork artwork) {
        if (artwork.artCropUrl() != null) {
            String key = artwork.illustrationId() == null ? "uri:" + artwork.artCropUrl()
                    : "illustration:" + artwork.illustrationId();
            distinct.putIfAbsent(key, artwork);
        }
    }

    private static boolean containsOracle(JsonNode card, String oracleId) {
        if (oracleId.equals(card.path("oracle_id").asText())) {
            return true;
        }
        if ("reversible_card".equals(card.path("layout").asText()) && card.path("card_faces").isArray()) {
            for (JsonNode face : card.path("card_faces")) {
                if (oracleId.equals(face.path("oracle_id").asText())) {
                    return true;
                }
            }
        }
        return false;
    }

    private static String authoritativeUuid(String input) {
        try {
            UUID id = UUID.fromString(input);
            if (!id.toString().equalsIgnoreCase(input)) {
                throw new IllegalArgumentException();
            }
            return id.toString();
        } catch (IllegalArgumentException exception) {
            throw new MalformedScryfallResponseException();
        }
    }

    private static void requireId(UUID id) {
        if (id == null) {
            throw new InvalidScryfallRequestException();
        }
    }

    private static void validateReference(CommanderSelectionRef reference) {
        if (reference == null || reference.scryfallCardId() == null
                || (reference.gameplayFaceIndex() != null && reference.gameplayFaceIndex() < 0)) {
            throw new InvalidScryfallSelectionException();
        }
    }

    private static String normalizeQuery(String input) {
        if (input == null || input.codePointCount(0, input.length()) > 100) {
            throw new InvalidScryfallRequestException();
        }
        StringBuilder normalized = new StringBuilder();
        int characters = 0;
        for (int character : input.codePoints().toArray()) {
            if (Character.isWhitespace(character) || Character.isSpaceChar(character) || character == 0x85) {
                if (!normalized.isEmpty() && normalized.charAt(normalized.length() - 1) != ' ') {
                    normalized.append(' ');
                }
            } else {
                if (Character.isISOControl(character) || Character.getType(character) == Character.FORMAT) {
                    throw new InvalidScryfallRequestException();
                }
                normalized.appendCodePoint(character);
                characters++;
            }
        }
        if (characters < 2) {
            throw new InvalidScryfallRequestException();
        }
        return normalized.toString().stripTrailing();
    }

    private static String literalRegex(String input) {
        StringBuilder literal = new StringBuilder();
        for (char character : input.toCharArray()) {
            if ("\\/.*+?()[]{}^$|".indexOf(character) >= 0) {
                literal.append('\\');
            }
            literal.append(character);
        }
        return literal.toString();
    }

    private record ValidatedCommander(CardDetails card, GameplayCard gameplay, JsonNode raw) { }

    private record FetchedCard(JsonNode raw, CardDetails details, List<Artwork> artworks) {
    }
}
