package io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

@Component
public class ScryfallNormalizer {
    private static final List<String> COLORS = List.of("W", "U", "B", "R", "G");
    private static final Pattern COMMANDER_PERMISSION = Pattern.compile(
            "(?i)(?:^|[.\\n])[^.\\n]*\\bcan be your commander[.]?(?:$|\\n)");
    private static final Pattern OFF_BATTLEFIELD_CREATURE = Pattern.compile(
            "(?i)As long as [^.\\n]+ isn't on the battlefield, [^.\\n]+ (?:is |it's )?[^.\\n]*"
                    + "\\bcreature in addition to (?:its|their|his|her) other types\\.");

    public CardDetails normalize(JsonNode card) {
        return normalize(card, Map.of());
    }

    /** Supplemental metadata is keyed by authoritative face Oracle UUID, never by face position. */
    public CardDetails normalize(JsonNode card, Map<String, JsonNode> oracleCards) {
        requireObject(card);
        UUID id = printingId(card);
        String name = requiredText(card, "name");
        String layout = requiredText(card, "layout");
        String legality = requiredText(card.path("legalities"), "commander");
        boolean reversible = "reversible_card".equals(layout);
        List<String> colors = reversible && !card.path("color_identity").isArray()
                ? List.of() : colors(card, "color_identity");
        List<String> keywords = stringList(card.path("keywords"), false);
        String oracleText = combinedText(card, "oracle_text");
        String typeLine = combinedText(card, "type_line");
        if (typeLine.isBlank()) {
            throw new MalformedScryfallResponseException();
        }
        List<Artwork> images = artworks(card);
        Artwork artwork = defaultArtwork(card, images, null);
        List<GameplayCard> gameplayCards = new ArrayList<>();
        List<CommanderChoice> choices = new ArrayList<>();
        Map<String, Boolean> seen = new LinkedHashMap<>();

        if (reversible) {
            JsonNode faces = card.path("card_faces");
            if (!faces.isArray() || faces.isEmpty()) {
                throw new MalformedScryfallResponseException();
            }
            for (int index = 0; index < faces.size(); index++) {
                JsonNode face = faces.get(index);
                requireObject(face);
                String faceOracleId = optionalUuid(face, "oracle_id");
                if (faceOracleId == null) {
                    // An artwork side without a stable gameplay identity cannot become a Commander choice.
                    continue;
                }
                JsonNode rules = oracleCards.getOrDefault(faceOracleId, face);
                if (!faceOracleId.equals(optionalUuid(rules, "oracle_id"))) {
                    throw new MalformedScryfallResponseException();
                }
                String faceLegality = rules.path("legalities").isObject()
                        ? requiredText(rules.path("legalities"), "commander") : legality;
                addGameplay(card, rules, index, faceOracleId, faceLegality, images, gameplayCards, choices, seen);
            }
        } else {
            addGameplay(card, card, null, optionalUuid(card, "oracle_id"), legality,
                    images, gameplayCards, choices, seen);
        }

        return new CardDetails(id, name, optionalUuid(card, "oracle_id"), layout, legality, colors,
                ChosenColorAbility.requiresChosenColor(oracleText), typeLine, keywords, oracleText,
                thumbnail(card, null), artwork.artCropUrl(), artwork.illustrationId(), artwork.artist(),
                artwork.scryfallUri(), artwork, choices, gameplayCards);
    }

    public GameplayCard resolve(CardDetails card, CommanderSelectionRef reference) {
        if (reference == null || reference.scryfallCardId() == null
                || !reference.scryfallCardId().equals(card.scryfallCardId())) {
            throw new InvalidScryfallSelectionException();
        }
        boolean reversible = "reversible_card".equals(card.layout());
        Integer index = reference.gameplayFaceIndex();
        if ((reversible && (index == null || index < 0)) || (!reversible && index != null)) {
            throw new InvalidScryfallSelectionException();
        }
        return card.gameplayCards().stream()
                .filter(gameplay -> Objects.equals(gameplay.gameplayFaceIndex(), index))
                .filter(gameplay -> gameplay.oracleId() != null)
                .findFirst().orElseThrow(InvalidScryfallSelectionException::new);
    }

    public List<Artwork> artworks(JsonNode card) {
        requireObject(card);
        UUID id = printingId(card);
        String source = safeSource(text(card, "scryfall_uri"));
        List<Artwork> options = new ArrayList<>();
        String topImage = safeImage(text(card.path("image_uris"), "art_crop"));
        if (topImage != null) {
            options.add(artwork(id, null, card, source, topImage));
        } else if (card.path("card_faces").isArray()) {
            JsonNode faces = card.path("card_faces");
            for (int index = 0; index < faces.size(); index++) {
                JsonNode face = faces.get(index);
                String faceImage = safeImage(text(face.path("image_uris"), "art_crop"));
                if (faceImage != null) {
                    options.add(artwork(id, index, face, source, faceImage));
                }
            }
        }
        return List.copyOf(options);
    }

    public Artwork selectArtwork(JsonNode card, Integer artworkFaceIndex) {
        List<Artwork> images = artworks(card);
        if (images.isEmpty()) {
            throw new InvalidScryfallSelectionException();
        }
        if (artworkFaceIndex == null) {
            if (images.size() != 1) {
                throw new InvalidScryfallSelectionException();
            }
            return images.getFirst();
        }
        return images.stream().filter(image -> artworkFaceIndex.equals(image.artworkFaceIndex()))
                .findFirst().orElseThrow(InvalidScryfallSelectionException::new);
    }

    private void addGameplay(JsonNode card, JsonNode rules, Integer index, String oracleId,
            String legality, List<Artwork> images, List<GameplayCard> gameplayCards,
            List<CommanderChoice> choices, Map<String, Boolean> seen) {
        String name = requiredText(rules, "name");
        String typeLine = combinedText(rules, "type_line");
        String oracleText = combinedText(rules, "oracle_text");
        if (typeLine.isBlank()) {
            throw new MalformedScryfallResponseException();
        }
        boolean sole = canBeSoleCommander(typeLine, oracleText);
        String frontType = typeLine.split(" // ", 2)[0];
        boolean background = frontType.contains("Legendary") && frontType.contains("Background");
        boolean companion = oracleText.contains("Doctor's companion");
        if (!"legal".equals(legality) || (!sole && !background && !companion)) {
            return;
        }
        List<String> colors = colors(rules, "color_identity");
        List<String> keywords = stringList(rules.path("keywords"), false);
        JsonNode front = rules.path("card_faces").isArray() && !rules.path("card_faces").isEmpty()
                ? rules.path("card_faces").get(0) : rules;
        // Card-level keywords can aggregate both artwork faces; only the gameplay front grants pairing roles.
        PairingCapabilities pairing = PairingCapabilities.classify(typeLine,
                stringList(front.path("keywords"), false), front == rules ? oracleText : combinedText(front, "oracle_text"));
        boolean requiresColor = ChosenColorAbility.requiresChosenColor(oracleText);
        Artwork artwork = defaultArtwork(card, images, index);
        GameplayCard gameplay = new GameplayCard(index, oracleId, name, colors, requiresColor, sole,
                typeLine, keywords, oracleText, artwork, pairing);
        // Keep every valid original face resolvable, even when two faces have the same Oracle identity.
        gameplayCards.add(gameplay);
        if (oracleId == null || seen.putIfAbsent(oracleId, Boolean.TRUE) != null) {
            return;
        }
        CommanderSelectionRef ref = new CommanderSelectionRef(printingId(card), index);
        choices.add(new CommanderChoice(ref, ref.scryfallCardId(), sole, name, colors,
                requiresColor, thumbnail(card, index), pairing));
    }

    private static boolean canBeSoleCommander(String typeLine, String oracleText) {
        String frontType = typeLine.split(" // ", 2)[0];
        return (frontType.contains("Legendary") && frontType.contains("Creature"))
                || COMMANDER_PERMISSION.matcher(oracleText).find()
                || (frontType.contains("Legendary") && OFF_BATTLEFIELD_CREATURE.matcher(oracleText).find());
    }

    private static Artwork defaultArtwork(JsonNode card, List<Artwork> images, Integer gameplayIndex) {
        if (!images.isEmpty()) {
            if (gameplayIndex != null) {
                for (Artwork image : images) {
                    if (gameplayIndex.equals(image.artworkFaceIndex())) {
                        return image;
                    }
                }
            }
            return images.getFirst();
        }
        JsonNode metadata = gameplayIndex == null ? card : card.path("card_faces").path(gameplayIndex);
        return artwork(printingId(card), gameplayIndex, metadata,
                safeSource(text(card, "scryfall_uri")), null);
    }

    private static Artwork artwork(UUID id, Integer face, JsonNode metadata, String source, String image) {
        return new Artwork(id, face, image, optionalUuid(metadata, "illustration_id"),
                text(metadata, "artist"), source);
    }

    private static String thumbnail(JsonNode card, Integer gameplayIndex) {
        if (gameplayIndex != null) {
            String selected = imageThumbnail(card.path("card_faces").path(gameplayIndex));
            if (selected != null) {
                return selected;
            }
        }
        String top = imageThumbnail(card);
        if (top != null) {
            return top;
        }
        JsonNode faces = card.path("card_faces");
        if (faces.isArray()) {
            for (JsonNode face : faces) {
                String candidate = imageThumbnail(face);
                if (candidate != null) {
                    return candidate;
                }
            }
        }
        return null;
    }

    private static String imageThumbnail(JsonNode card) {
        String small = safeImage(text(card.path("image_uris"), "small"));
        return small != null ? small : safeImage(text(card.path("image_uris"), "normal"));
    }

    private static String safeImage(String value) {
        return safeUri(value, false);
    }

    private static String safeSource(String value) {
        return safeUri(value, true);
    }

    private static String safeUri(String value, boolean source) {
        if (value == null) {
            return null;
        }
        try {
            URI uri = URI.create(value);
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null
                    || uri.getRawUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)) {
                return null;
            }
            host = host.toLowerCase(Locale.ROOT);
            boolean allowed = source ? "scryfall.com".equals(host)
                    : "scryfall.io".equals(host) || host.endsWith(".scryfall.io");
            return allowed ? uri.toASCIIString() : null;
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private static List<String> colors(JsonNode node, String field) {
        List<String> supplied = stringList(node.path(field), true);
        if (supplied.stream().anyMatch(color -> !COLORS.contains(color))
                || supplied.stream().distinct().count() != supplied.size()) {
            throw new MalformedScryfallResponseException();
        }
        return COLORS.stream().filter(supplied::contains).toList();
    }

    private static List<String> stringList(JsonNode node, boolean required) {
        if (!node.isArray()) {
            if (!required && (node.isMissingNode() || node.isNull())) {
                return List.of();
            }
            throw new MalformedScryfallResponseException();
        }
        List<String> values = new ArrayList<>();
        for (JsonNode value : node) {
            if (!value.isString()) {
                throw new MalformedScryfallResponseException();
            }
            values.add(value.asString());
        }
        return List.copyOf(values);
    }

    private static UUID printingId(JsonNode card) {
        return parseUuid(requiredText(card, "id"));
    }

    private static UUID parseUuid(String value) {
        try {
            UUID id = UUID.fromString(value);
            if (!id.toString().equalsIgnoreCase(value)) {
                throw new MalformedScryfallResponseException();
            }
            return id;
        } catch (IllegalArgumentException exception) {
            throw new MalformedScryfallResponseException();
        }
    }

    private static String optionalUuid(JsonNode card, String field) {
        String value = text(card, field);
        return value == null ? null : parseUuid(value).toString();
    }

    private static String combinedText(JsonNode card, String field) {
        String top = text(card, field);
        if (top != null) {
            return top;
        }
        List<String> parts = new ArrayList<>();
        JsonNode faces = card.path("card_faces");
        if (faces.isArray()) {
            for (JsonNode face : faces) {
                String value = text(face, field);
                if (value != null) {
                    parts.add(value);
                }
            }
        }
        return String.join(" // ", parts);
    }

    private static String requiredText(JsonNode card, String field) {
        String value = text(card, field);
        if (value == null || value.isBlank()) {
            throw new MalformedScryfallResponseException();
        }
        return value;
    }

    private static String text(JsonNode card, String field) {
        JsonNode value = card.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        if (!value.isString()) {
            throw new MalformedScryfallResponseException();
        }
        return value.asString();
    }

    private static void requireObject(JsonNode node) {
        if (node == null || !node.isObject()) {
            throw new MalformedScryfallResponseException();
        }
    }
}
