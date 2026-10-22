package io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain;

import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;

class PairingCapabilitiesTest {
    private static final String CREATURE = "Legendary Creature — Human";
    private static final String BACKGROUND = "Legendary Enchantment — Background";
    private static final String DOCTOR = "Legendary Creature — Time Lord Doctor";

    static Stream<Arguments> pairs() {
        return Stream.of(
                Arguments.of(CREATURE, "Partner", CREATURE, "Partner", true),
                Arguments.of(CREATURE, "Partner", CREATURE, "Partner with First", false),
                Arguments.of(CREATURE, "Partner with Second", CREATURE, "Partner with First", true),
                Arguments.of(CREATURE, "Partner with Second", CREATURE, "Partner with Someone else", false),
                Arguments.of(CREATURE, "Partner with Someone else", CREATURE, "Partner with First", false),
                Arguments.of(CREATURE, "Choose a Background", BACKGROUND, "", true),
                Arguments.of(CREATURE, "Choose a Background", CREATURE, "Choose a Background", false),
                Arguments.of(BACKGROUND, "", BACKGROUND, "", false),
                Arguments.of(DOCTOR, "", CREATURE, "Doctor's companion", true),
                Arguments.of("Legendary Creature — Time Lord Doctor Human", "", CREATURE, "Doctor's companion", false),
                Arguments.of("Creature — Time Lord Doctor", "", CREATURE, "Doctor's companion", false),
                Arguments.of("Legendary Creature — Doctor", "", CREATURE, "Doctor's companion", false),
                Arguments.of("Legendary Creature — Time Lord", "", CREATURE, "Doctor's companion", false),
                Arguments.of("Legendary Artifact — Time Lord Doctor", "", CREATURE, "Doctor's companion", false),
                Arguments.of(DOCTOR, "", CREATURE, "Partner", false),
                Arguments.of(CREATURE, "Doctor's companion", CREATURE, "Doctor's companion", false),
                Arguments.of(CREATURE, "Friends forever", CREATURE, "Partner—Friends forever", true),
                Arguments.of(CREATURE, "Partner", CREATURE, "Friends forever", false),
                Arguments.of(CREATURE, "Partner—Survivors", CREATURE, "Partner—Friends forever", false),
                Arguments.of(CREATURE, "Partner—Survivors", CREATURE, "Partner with First", false),
                Arguments.of("Legendary Enchantment Creature — Background", "Choose a Background", BACKGROUND, "", true),
                Arguments.of("Legendary Enchantment Creature — Background", "Choose a Background", CREATURE, "Choose a Background", true),
                Arguments.of("Legendary Enchantment Creature — Background", "Choose a Background", CREATURE, "Partner", false),
                Arguments.of(CREATURE, "Unknown future pairing", CREATURE, "Unknown future pairing", false),
                Arguments.of(CREATURE, "Whenever you attack, choose a Background.", BACKGROUND, "", false),
                Arguments.of(CREATURE, "Partner with Second", CREATURE, "Partner", false));
    }

    @ParameterizedTest
    @MethodSource("pairs")
    void validatesEverySupportedRuleInBothOrders(String firstType, String firstText, String secondType, String secondText, boolean valid) {
        GameplayCard first = card("First", firstType, firstText);
        GameplayCard second = card("Second", secondType, secondText);
        assertThat(PairingCapabilities.compatible(first, second)).isEqualTo(valid);
        assertThat(PairingCapabilities.compatible(second, first)).isEqualTo(valid);
    }

    @ParameterizedTest
    @ValueSource(strings = {"Friends forever", "Survivors", "Character select", "Father & son", "A new synthetic label"})
    void genericNamedVariantsNeedNoCardOrLabelAllowlist(String variant) {
        GameplayCard first = card("Brand new card", CREATURE, "Partner—" + variant + " (Reminder text.)");
        GameplayCard second = card("Another new card", CREATURE, "Partner — " + variant.toUpperCase() + " (Reminder.)");
        assertThat(PairingCapabilities.compatible(first, second)).isTrue();
        assertThat(PairingCapabilities.compatible(first, card("Wrong", CREATURE, "Partner—Different"))).isFalse();
        assertThat(PairingCapabilities.compatible(first, first)).isFalse();
    }

    @Test
    void noRoleIsExclusiveAndKeywordsCannotTurnSpecificPartnerIntoOrdinaryPartner() {
        PairingCapabilities multiple = PairingCapabilities.classify("Legendary Enchantment Creature — Background",
                List.of("Choose a Background", "Partner"), "Choose a Background\nPartner");
        assertThat(multiple.roles()).containsExactlyInAnyOrder("BACKGROUND", "CHOOSE_BACKGROUND", "PARTNER");
        assertThat(PairingCapabilities.classify(CREATURE, List.of("Partner"), "Partner with First (Reminder.)").roles()).isEmpty();
        assertThat(PairingCapabilities.classify(CREATURE, List.of("Partner"), "Partner—Survivors (Reminder.)").roles()).isEmpty();
        assertThat(PairingCapabilities.classify(CREATURE, List.of("Partner"), "Partner with").roles()).isEmpty();
        assertThat(PairingCapabilities.classify(CREATURE, List.of("Partner"), "Unknown future pairing").roles()).isEmpty();
    }

    @Test
    void ordinaryFaceMetadataUsesFrontRulesAndReversibleFacesKeepTheirOwnRules() {
        JsonMapper json = JsonMapper.builder().build();
        ObjectNode front = raw(json, "Front", CREATURE, "Partner");
        ObjectNode back = raw(json, "Back", DOCTOR, "");
        ObjectNode transform = front.deepCopy();
        transform.put("layout", "transform");
        transform.remove("type_line");
        transform.remove("oracle_text");
        transform.putArray("card_faces").add(front).add(back);
        ScryfallNormalizer normalizer = new ScryfallNormalizer();
        assertThat(normalizer.normalize(transform).gameplayCards().getFirst().pairing().roles()).containsExactly("PARTNER");
        transform.put("layout", "reversible_card");
        transform.remove("oracle_id");
        assertThat(normalizer.normalize(transform).gameplayCards()).extracting(gameplay -> gameplay.pairing().roles())
                .containsExactly(List.of("PARTNER"), List.of("DOCTOR"));
        ObjectNode noIdentity = raw(json, "Missing", CREATURE, "Partner");
        noIdentity.remove("oracle_id");
        assertThat(normalizer.normalize(noIdentity).commanderSelections()).isEmpty();
    }

    private static GameplayCard card(String name, String type, String text) {
        return new GameplayCard(null, UUID.randomUUID().toString(), name, List.of(), false, true,
                type, List.of(), text, null, PairingCapabilities.classify(type, List.of(), text));
    }

    private static ObjectNode raw(JsonMapper json, String name, String type, String text) {
        ObjectNode card = json.createObjectNode();
        card.put("id", UUID.randomUUID().toString()).put("oracle_id", UUID.randomUUID().toString())
                .put("name", name).put("type_line", type).put("oracle_text", text).put("layout", "normal");
        card.putObject("legalities").put("commander", "legal");
        card.putArray("color_identity");
        return card;
    }
}
