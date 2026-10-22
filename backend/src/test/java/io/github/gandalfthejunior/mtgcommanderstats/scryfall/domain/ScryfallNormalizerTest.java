package io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ScryfallNormalizerTest {
    private static final String PRINTING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    private static final String ORACLE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    private static final String OTHER_ORACLE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    private static final String ILLUSTRATION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    private final JsonMapper json = JsonMapper.builder().build();
    private final ScryfallNormalizer normalizer = new ScryfallNormalizer();

    @Test
    void normalizesCanonicalColorsTrustedCommanderAndAttribution() {
        ObjectNode card = card("Atraxa", "Legendary Creature — Phyrexian Angel Horror");
        card.set("color_identity", json.valueToTree(List.of("G", "B", "W", "U")));
        image(card, "front", "Artist One", ILLUSTRATION_ID);

        CardDetails details = normalizer.normalize(card);

        assertThat(details.colorIdentity()).containsExactly("W", "U", "B", "G");
        assertThat(details.commanderSelections()).hasSize(1);
        CommanderChoice choice = details.commanderSelections().getFirst();
        assertThat(choice.selectionRef()).isEqualTo(reference(null));
        assertThat(choice.canBeSoleCommander()).isTrue();
        assertThat(choice.thumbnailUrl()).isEqualTo("https://cards.scryfall.io/small/front.jpg");
        assertThat(details.defaultArtwork()).isEqualTo(new Artwork(UUID.fromString(PRINTING_ID), null,
                "https://cards.scryfall.io/art_crop/front.jpg", ILLUSTRATION_ID, "Artist One",
                "https://scryfall.com/card/test/1"));
        assertThat(normalizer.resolve(details, reference(null)).oracleId()).isEqualTo(ORACLE_ID);
    }

    @Test
    void commanderLegalityDoesNotMakeNormalCreatureOrBannedLegendaryEligible() {
        assertThat(normalizer.normalize(card("Bear", "Creature — Bear")).commanderSelections()).isEmpty();
        ObjectNode banned = card("Banned", "Legendary Creature — Human");
        banned.withObject("legalities").put("commander", "banned");
        assertThat(normalizer.normalize(banned).commanderSelections()).isEmpty();
    }

    @Test
    void secondOnlyBackgroundRemainsDifferentFromSoleEligibleDoctorCompanion() {
        ObjectNode background = card("Background", "Legendary Enchantment — Background");
        ObjectNode doctor = card("Clara Oswald", "Legendary Creature — Human Advisor");
        doctor.put("oracle_text", "Doctor's companion (You can have two commanders if the other is the Doctor.)");

        assertThat(normalizer.normalize(background).commanderSelections().getFirst().canBeSoleCommander()).isFalse();
        assertThat(normalizer.normalize(doctor).commanderSelections().getFirst().canBeSoleCommander()).isTrue();
    }

    @Test
    void explicitPermissionAndOffBattlefieldCreatureTextEnablePlaneswalkerCommanders() {
        ObjectNode permission = card("Unknown Walker", "Legendary Planeswalker — Unknown");
        permission.put("oracle_text", "Unknown Walker can be your commander.");
        ObjectNode grist = card("Grist, the Hunger Tide", "Legendary Planeswalker — Grist");
        grist.put("oracle_text", "As long as Grist, the Hunger Tide isn't on the battlefield, "
                + "it's a 1/1 Insect creature in addition to its other types.");

        assertThat(normalizer.normalize(permission).commanderSelections()).hasSize(1);
        assertThat(normalizer.normalize(grist).commanderSelections()).hasSize(1);
    }

    @Test
    void transformAndModalCardsKeepCardLevelIdentityAndBacksAreNotIndependent() {
        for (String layout : List.of("transform", "modal_dfc")) {
            ObjectNode card = card("Front // Back", "Legendary Creature — Human // Land");
            card.put("layout", layout);
            card.set("color_identity", json.valueToTree(List.of("R", "U")));
            ArrayNode faces = card.putArray("card_faces");
            ObjectNode front = faces.addObject().put("name", "Front").put("type_line", "Legendary Creature — Human");
            ObjectNode back = faces.addObject().put("name", "Back").put("type_line", "Land");
            image(front, "front", "Front Artist", ILLUSTRATION_ID);
            image(back, "back", "Back Artist", OTHER_ORACLE_ID);

            CardDetails details = normalizer.normalize(card);

            assertThat(details.commanderSelections()).hasSize(1);
            assertThat(details.commanderSelections().getFirst().colorIdentity()).containsExactly("U", "R");
            assertThat(normalizer.resolve(details, reference(null)).colorIdentity()).containsExactly("U", "R");
            assertThatThrownBy(() -> normalizer.resolve(details, reference(1)))
                    .isInstanceOf(InvalidScryfallSelectionException.class);
            assertThat(normalizer.selectArtwork(card, 1).artist()).isEqualTo("Back Artist");
        }
    }

    @Test
    void legendaryCreatureOnlyOnTransformBackDoesNotEstablishCommanderEligibility() {
        ObjectNode card = card("Elbrus, the Binding Blade // Withengar Unbound",
                "Legendary Artifact — Equipment // Legendary Creature — Demon");
        card.put("layout", "transform");
        assertThat(normalizer.normalize(card).commanderSelections()).isEmpty();
    }

    @Test
    void reversibleFacesHaveIndependentOracleRulesColorsAndInitialImages() {
        ObjectNode reversible = reversible();
        Map<String, JsonNode> rules = Map.of(ORACLE_ID, card("Blue Commander", "Legendary Creature — Eye"),
                OTHER_ORACLE_ID, cardForOracle("Red Commander", OTHER_ORACLE_ID, "R"));

        CardDetails details = normalizer.normalize(reversible, rules);

        assertThat(details.oracleId()).isNull();
        assertThat(details.commanderSelections()).extracting(CommanderChoice::name)
                .containsExactly("Blue Commander", "Red Commander");
        assertThat(details.commanderSelections().get(0).selectionRef()).isEqualTo(reference(0));
        assertThat(details.commanderSelections().get(1).selectionRef()).isEqualTo(reference(1));
        assertThat(details.commanderSelections().get(1).colorIdentity()).containsExactly("R");
        assertThat(details.commanderSelections().get(1).thumbnailUrl()).endsWith("/back.jpg");
        assertThat(normalizer.resolve(details, reference(1)).oracleId()).isEqualTo(OTHER_ORACLE_ID);
        assertThat(normalizer.resolve(details, reference(1)).defaultArtwork().artist()).isEqualTo("Back Artist");
    }

    @Test
    void reversibleIdenticalOracleFacesProduceOneSearchOptionButBothReferencesResolve() {
        ObjectNode reversible = reversible();
        ((ObjectNode) reversible.path("card_faces").get(1)).put("oracle_id", ORACLE_ID);
        CardDetails details = normalizer.normalize(reversible,
                Map.of(ORACLE_ID, card("One identity", "Legendary Creature — Eye")));

        assertThat(details.commanderSelections()).hasSize(1);
        assertThat(normalizer.resolve(details, reference(1)).oracleId()).isEqualTo(ORACLE_ID);
    }

    @Test
    void reversibleFacesRequireAuthoritativeColorIdentityRatherThanGuessingFromColors() {
        ObjectNode reversible = reversible();
        assertThatThrownBy(() -> normalizer.normalize(reversible))
                .isInstanceOf(MalformedScryfallResponseException.class);
        ObjectNode wrongOracle = card("Wrong", "Legendary Creature — Eye");
        wrongOracle.put("oracle_id", OTHER_ORACLE_ID);
        assertThatThrownBy(() -> normalizer.normalize(reversible, Map.of(ORACLE_ID, wrongOracle)))
                .isInstanceOf(MalformedScryfallResponseException.class);
    }

    @Test
    void reversibleSelectorsRejectMissingNegativeOutOfRangeAndIneligibleFaces() {
        ObjectNode reversible = reversible();
        Map<String, JsonNode> rules = Map.of(ORACLE_ID, card("Blue Commander", "Legendary Creature — Eye"),
                OTHER_ORACLE_ID, cardForOracle("Normal Land", OTHER_ORACLE_ID, "R").put("type_line", "Land"));
        CardDetails details = normalizer.normalize(reversible, rules);
        for (Integer face : new Integer[] {null, -1, 1, 2}) {
            assertThatThrownBy(() -> normalizer.resolve(details, reference(face)))
                    .isInstanceOf(InvalidScryfallSelectionException.class);
        }
        assertThatThrownBy(() -> normalizer.resolve(details,
                new CommanderSelectionRef(UUID.randomUUID(), 0)))
                .isInstanceOf(InvalidScryfallSelectionException.class);
    }

    @Test
    void missingStableOracleIdentityIsNotInventedFromPrintingOrFaceIndex() {
        ObjectNode card = card("Unknown", "Legendary Creature — Eye");
        card.remove("oracle_id");
        CardDetails details = normalizer.normalize(card);
        assertThat(details.oracleId()).isNull();
        assertThat(details.commanderSelections()).isEmpty();
        assertThatThrownBy(() -> normalizer.resolve(details, reference(null)))
                .isInstanceOf(InvalidScryfallSelectionException.class);
    }

    @Test
    void missingArtworkKeepsValidCommanderAndReturnsNullableSnapshot() {
        ObjectNode card = card("No image", "Legendary Creature — Eye");
        CardDetails details = normalizer.normalize(card);
        assertThat(details.commanderSelections()).hasSize(1);
        assertThat(details.thumbnailUrl()).isNull();
        assertThat(details.defaultArtwork().artCropUrl()).isNull();
        assertThat(normalizer.artworks(card)).isEmpty();
        assertThatThrownBy(() -> normalizer.selectArtwork(card, null))
                .isInstanceOf(InvalidScryfallSelectionException.class);
    }

    @Test
    void normalColorlessCommanderRemainsStandaloneWithoutChosenColorAbility() {
        ObjectNode card = card("Kozilek, the Great Distortion", "Legendary Creature — Eldrazi");
        card.set("color_identity", json.valueToTree(List.of()));
        card.put("oracle_text", "When you cast this spell, if you have fewer than seven cards in hand, "
                + "draw cards equal to the difference.\nMenace");

        CardDetails details = normalizer.normalize(card);
        CommanderChoice choice = details.commanderSelections().getFirst();

        assertThat(details.colorIdentity()).isEmpty();
        assertThat(details.requiresChosenColor()).isFalse();
        assertThat(choice.colorIdentity()).isEmpty();
        assertThat(choice.requiresChosenColor()).isFalse();
        assertThat(choice.canBeSoleCommander()).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"The Prismatic Piper", "Faceless One", "Clara Oswald", "Unseen Chromatic Sentinel",
            "Dr. Chromatic"})
    void searchChoicesAndDetailsDeriveChosenColorFromExistingOracleText(String name) {
        ObjectNode card = card(name, "Legendary Creature — Shapeshifter");
        card.put("oracle_text", "If " + name + " is your commander, choose a color before the game begins. "
                + name + " is the chosen color.");
        card.set("color_identity", json.valueToTree(List.of()));
        CardDetails details = normalizer.normalize(card);

        assertThat(details.requiresChosenColor()).isTrue();
        assertThat(details.commanderSelections().getFirst().requiresChosenColor()).isTrue();
        assertThat(normalizer.resolve(details, reference(null)).requiresChosenColor()).isTrue();
        assertThat(details.colorIdentity()).isEmpty();
    }

    @Test
    void faceSpecificOracleTextDerivesCapabilityWithoutDiscardingBacksideIdentity() {
        ObjectNode card = card("Color Sentinel // Colored Side", "Legendary Creature — Spirit // Land");
        card.put("layout", "modal_dfc");
        card.remove("oracle_text");
        ArrayNode faces = card.putArray("card_faces");
        faces.addObject().put("name", "Color Sentinel").put("oracle_text",
                "If Color Sentinel is your commander, choose a color before the game begins. "
                        + "It is the chosen color.");
        faces.addObject().put("name", "Colored Side").put("oracle_text", "{T}: Add {U}.");
        CardDetails details = normalizer.normalize(card);

        assertThat(details.commanderSelections().getFirst().requiresChosenColor()).isTrue();
        assertThat(details.commanderSelections().getFirst().colorIdentity()).containsExactly("U");
    }

    @Test
    void soleBackImageRetainsOriginalIndexAndItsOwnAttribution() {
        ObjectNode card = reversible();
        ((ObjectNode) card.path("card_faces").get(0)).remove("image_uris");
        assertThat(normalizer.artworks(card)).hasSize(1);
        Artwork chosen = normalizer.selectArtwork(card, null);
        assertThat(chosen.artworkFaceIndex()).isEqualTo(1);
        assertThat(chosen.artist()).isEqualTo("Back Artist");
        assertThat(chosen.illustrationId()).isEqualTo(OTHER_ORACLE_ID);
        assertThatThrownBy(() -> normalizer.selectArtwork(card, 0))
                .isInstanceOf(InvalidScryfallSelectionException.class);
    }

    @Test
    void multiImageSelectionIsExplicitAndSingleTopImageCannotUseFaceSelector() {
        ObjectNode reversible = reversible();
        assertThat(normalizer.artworks(reversible)).extracting(Artwork::artworkFaceIndex).containsExactly(0, 1);
        assertThatThrownBy(() -> normalizer.selectArtwork(reversible, null))
                .isInstanceOf(InvalidScryfallSelectionException.class);
        ObjectNode single = card("One", "Legendary Creature — Eye");
        image(single, "front", "Artist", ILLUSTRATION_ID);
        assertThat(normalizer.selectArtwork(single, null).artworkFaceIndex()).isNull();
        assertThatThrownBy(() -> normalizer.selectArtwork(single, 0))
                .isInstanceOf(InvalidScryfallSelectionException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"javascript:alert(1)", "http://cards.scryfall.io/a.jpg",
            "https://cards.scryfall.io.attacker.test/a.jpg", "https://name@cards.scryfall.io/a.jpg",
            "https://cards.scryfall.io:8443/a.jpg"})
    void unsafeImageAndSourceUrisAreNeverReturned(String unsafe) {
        ObjectNode card = card("Safe", "Legendary Creature — Eye");
        image(card, "front", "Artist", ILLUSTRATION_ID);
        card.withObject("image_uris").put("art_crop", unsafe).put("small", unsafe);
        card.put("scryfall_uri", unsafe);
        CardDetails details = normalizer.normalize(card);
        assertThat(details.artCropUrl()).isNull();
        assertThat(details.thumbnailUrl()).isNull();
        assertThat(details.scryfallUri()).isNull();
    }

    @Test
    void malformedMandatoryMetadataProducesControlledFailure() {
        for (String field : List.of("id", "name", "layout", "color_identity", "legalities", "type_line")) {
            ObjectNode malformed = card("Test", "Legendary Creature — Eye");
            malformed.remove(field);
            assertThatThrownBy(() -> normalizer.normalize(malformed))
                    .isInstanceOf(MalformedScryfallResponseException.class);
        }
        ObjectNode colors = card("Bad", "Legendary Creature — Eye");
        colors.set("color_identity", json.valueToTree(List.of("C")));
        assertThatThrownBy(() -> normalizer.normalize(colors))
                .isInstanceOf(MalformedScryfallResponseException.class);
    }

    private CommanderSelectionRef reference(Integer index) {
        return new CommanderSelectionRef(UUID.fromString(PRINTING_ID), index);
    }

    private ObjectNode card(String name, String type) {
        ObjectNode card = json.createObjectNode().put("id", PRINTING_ID).put("oracle_id", ORACLE_ID)
                .put("name", name).put("layout", "normal").put("type_line", type).put("oracle_text", "")
                .put("scryfall_uri", "https://scryfall.com/card/test/1");
        card.set("color_identity", json.valueToTree(List.of("U")));
        card.putObject("legalities").put("commander", "legal");
        card.putArray("keywords");
        return card;
    }

    private ObjectNode cardForOracle(String name, String oracleId, String color) {
        ObjectNode card = card(name, "Legendary Creature — Eye");
        card.put("oracle_id", oracleId);
        card.set("color_identity", json.valueToTree(List.of(color)));
        return card;
    }

    private ObjectNode reversible() {
        ObjectNode card = card("Blue Commander // Red Commander", "Legendary Creature — Eye");
        card.put("layout", "reversible_card");
        card.remove("oracle_id");
        card.remove("color_identity");
        ArrayNode faces = card.putArray("card_faces");
        ObjectNode front = faces.addObject().put("name", "Blue Commander").put("oracle_id", ORACLE_ID)
                .put("type_line", "Legendary Creature — Eye");
        ObjectNode back = faces.addObject().put("name", "Red Commander").put("oracle_id", OTHER_ORACLE_ID)
                .put("type_line", "Legendary Creature — Eye");
        image(front, "front", "Front Artist", ILLUSTRATION_ID);
        image(back, "back", "Back Artist", OTHER_ORACLE_ID);
        return card;
    }

    private void image(ObjectNode card, String name, String artist, String illustrationId) {
        card.put("artist", artist).put("illustration_id", illustrationId);
        card.putObject("image_uris").put("art_crop", "https://cards.scryfall.io/art_crop/" + name + ".jpg")
                .put("small", "https://cards.scryfall.io/small/" + name + ".jpg");
    }
}
