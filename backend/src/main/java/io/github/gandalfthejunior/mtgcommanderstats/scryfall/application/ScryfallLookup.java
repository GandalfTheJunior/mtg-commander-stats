package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.Artwork;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CardDetails;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderChoice;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.GameplayCard;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.InvalidScryfallSelectionException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.MalformedScryfallResponseException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.ScryfallNormalizer;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClient;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClientException;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

@Service
public class ScryfallLookup {
    private static final Duration CACHE_TTL = Duration.ofMinutes(5);
    private static final int MAX_PAGES = 3;
    private static final int MAX_PAGE_CARDS = 175;
    private static final int MAX_SEARCH_CARDS = 40;
    private static final int MAX_SUGGESTIONS = 20;
    private static final int MAX_ARTWORKS = 200;
    private static final int MAX_ORACLE_BATCH = 8;
    private final ScryfallClient client;
    private final ScryfallNormalizer normalizer;
    private final BoundedCache<String, List<CommanderChoice>> searches =
            new BoundedCache<>(128, CACHE_TTL, System::nanoTime);
    private final BoundedCache<UUID, FetchedCard> cards =
            new BoundedCache<>(256, CACHE_TTL, System::nanoTime);
    private final BoundedCache<CommanderSelectionRef, List<Artwork>> artworkLists =
            new BoundedCache<>(128, CACHE_TTL, System::nanoTime);
    private final BoundedCache<String, JsonNode> oracleCards =
            new BoundedCache<>(256, CACHE_TTL, System::nanoTime);

    public ScryfallLookup(ScryfallClient client, ScryfallNormalizer normalizer) {
        this.client = client;
        this.normalizer = normalizer;
    }

    public List<CommanderChoice> searchCommanders(String input) {
        String name = normalizeQuery(input);
        String key = name.toLowerCase(Locale.ROOT);
        List<CommanderChoice> cached = searches.get(key);
        if (cached != null) {
            return cached;
        }
        String query = "name:/" + literalRegex(name) + "/ lang:en game:paper f:commander"
                + " (is:commander or t:background or kw:\"Doctor's companion\")";
        List<JsonNode> rawCards = collectSearch(query, false, MAX_SEARCH_CARDS);
        Map<String, JsonNode> metadata = reversibleMetadata(rawCards);
        Map<String, CommanderChoice> distinct = new LinkedHashMap<>();
        for (JsonNode raw : rawCards) {
            if (!raw.path("lang").isTextual()) {
                throw new MalformedScryfallResponseException();
            }
            if (!"en".equals(raw.path("lang").asText())) {
                continue;
            }
            CardDetails card = normalizer.normalize(raw, metadata);
            for (CommanderChoice choice : card.commanderSelections()) {
                if (!choice.name().toLowerCase(Locale.ROOT).contains(key)) {
                    continue;
                }
                GameplayCard gameplay = normalizer.resolve(card, choice.selectionRef());
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

    public CardDetails cardDetails(UUID id) {
        return ordinaryCard(id).details();
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
        validateReference(reference);
        CardDetails card = fetchCard(reference.scryfallCardId()).details();
        GameplayCard gameplay = normalizer.resolve(card, reference);
        return new ResolvedCommander(card, gameplay);
    }

    /** #101 must use this until #103 introduces authoritative two-Commander pairing validation. */
    public ResolvedCommander resolveStandaloneCommanderOnline(CommanderSelectionRef reference) {
        ResolvedCommander resolved = resolveCommanderOnline(reference);
        if (!resolved.gameplay().canBeSoleCommander()) {
            throw new InvalidScryfallSelectionException();
        }
        return resolved;
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
            GameplayCard gameplay = normalizer.resolve(card, reference);
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
        return new FetchedCard(result, normalizer.artworks(raw));
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

    private record FetchedCard(CardDetails details, List<Artwork> artworks) {
    }
}
