package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckFormat;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderChoice;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.InvalidScryfallSelectionException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.MalformedScryfallResponseException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.PairingCapabilities;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.ScryfallNormalizer;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClient;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClientException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ScryfallPauperCommandersTest {
    private static final DeckFormat PDH = DeckFormat.PAUPER_COMMANDER;
    private final JsonMapper json = JsonMapper.builder().build();
    private final ScryfallClient client = mock(ScryfallClient.class);
    private final ScryfallLookup lookup = new ScryfallLookup(client, new ScryfallNormalizer());

    @ParameterizedTest
    @ValueSource(strings = {"Creature — Human", "Artifact — Vehicle", "Artifact — Spacecraft"})
    void acceptsProviderEligibleNonlegendaryIdentitiesIndependentlyOfSelectedPrintingRarity(String type) {
        ObjectNode rareArtwork = card("Pauper Choice", type).put("rarity", "rare");
        ObjectNode uncommon = rareArtwork.deepCopy().put("id", UUID.randomUUID().toString()).put("rarity", "uncommon");
        UUID id = UUID.fromString(rareArtwork.path("id").asText());
        when(client.card(id)).thenReturn(rareArtwork);
        String eligibility = "oracleid:" + rareArtwork.path("oracle_id").asText() + " is:PauperCommander -layout:reversible_card";
        when(client.search(eligibility)).thenReturn(page(List.of(uncommon)));
        ResolvedCommander resolved = lookup.resolveCommanderOnline(new CommanderSelectionRef(id, null), PDH);
        assertThat(resolved.gameplay().canBeSoleCommander()).isTrue();
        assertThat(resolved.card().scryfallCardId()).isEqualTo(id);
        assertThat(resolved.gameplay().oracleId()).isEqualTo(uncommon.path("oracle_id").asText());
        verify(client).search(eligibility);
        assertThatThrownBy(() -> lookup.resolveCommanderOnline(new CommanderSelectionRef(id, null)))
                .isInstanceOf(InvalidScryfallSelectionException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"Arena-only uncommon", "Promo-only uncommon", "Secret Lair-only uncommon", "Local release uncommon", "Banned uncommon"})
    void printingRarityAndOrdinaryPauperLegalityCannotOverrideProviderExclusions(String exclusion) {
        ObjectNode raw = card(exclusion, "Creature — Human").put("rarity", "uncommon");
        raw.withObject("legalities").put("paupercommander", "legal");
        UUID id = UUID.fromString(raw.path("id").asText());
        when(client.card(id)).thenReturn(raw);
        when(client.search("oracleid:" + raw.path("oracle_id").asText() + " is:PauperCommander -layout:reversible_card")).thenReturn(page(List.of()));
        assertThatThrownBy(() -> lookup.resolveCommanderOnline(new CommanderSelectionRef(id, null), PDH))
                .isInstanceOf(InvalidScryfallSelectionException.class);
    }

    @Test
    void normalizesLiteralSearchAndSeparatesFormatCachesWithoutUsingMainDeckLegality() {
        ObjectNode nonlegendary = card("Test Creature", "Creature — Human");
        when(client.search(anyString())).thenReturn(page(List.of(nonlegendary)));
        List<CommanderChoice> choices = lookup.searchCommanders(" Test ", PDH);
        assertThat(choices).singleElement().satisfies(c -> assertThat(c.canBeSoleCommander()).isTrue());
        assertThat(lookup.searchCommanders("test", PDH)).isSameAs(choices);
        assertThat(lookup.searchCommanders("Test")).isEmpty();
        verify(client).search("name:/Test/ lang:en (game:paper or game:mtgo) is:PauperCommander");
        verify(client).search("name:/Test/ lang:en game:paper f:commander (is:commander or t:background or kw:\"Doctor's companion\")");
    }

    @Test
    void backgroundNeedsCompatiblePairAndBothIdentitiesMustBePdhEligible() {
        ObjectNode first = card("Test Chooser", "Legendary Creature — Dragon").put("oracle_text", "Choose a Background");
        ObjectNode background = card("Test Background", "Legendary Enchantment — Background");
        UUID id = UUID.fromString(first.path("id").asText());
        when(client.card(id)).thenReturn(first);
        String eligible = "oracleid:" + first.path("oracle_id").asText() + " is:PauperCommander -layout:reversible_card";
        when(client.search(anyString())).thenAnswer(call -> call.getArgument(0).equals(eligible)
                ? page(List.of(first)) : page(List.of(background)));
        CommanderSelectionRef reference = new CommanderSelectionRef(id, null);
        assertThat(lookup.searchPartners("Test", reference, PDH)).singleElement()
                .satisfies(c -> assertThat(c.canBeSoleCommander()).isFalse());
        ScryfallNormalizer normalizer = new ScryfallNormalizer();
        assertThat(PairingCapabilities.compatible(normalizer.normalize(first, Map.of(), PDH).gameplayCards().getFirst(),
                normalizer.normalize(background, Map.of(), PDH).gameplayCards().getFirst())).isTrue();
        when(client.search(eligible)).thenReturn(page(List.of()));
        assertThatThrownBy(() -> lookup.searchPartners("Test", reference, PDH)).isInstanceOf(InvalidScryfallSelectionException.class);
    }

    @Test
    void freshWriteLookupIgnoresSuggestionsAndFailsClosedOnProviderOutageOrWrongOracle() {
        ObjectNode card = card("Test Creature", "Creature — Human");
        UUID id = UUID.fromString(card.path("id").asText());
        String eligible = "oracleid:" + card.path("oracle_id").asText() + " is:PauperCommander -layout:reversible_card";
        when(client.card(id)).thenReturn(card);
        when(client.search(anyString())).thenReturn(page(List.of(card)));
        assertThat(lookup.searchCommanders("Test", PDH)).hasSize(1);
        CommanderSelectionRef ref = new CommanderSelectionRef(id, null);
        lookup.resolveCommanderOnline(ref, PDH);
        when(client.search(eligible)).thenReturn(page(List.of(card("Wrong Identity", "Creature — Human"))));
        assertThatThrownBy(() -> lookup.resolveCommanderOnline(ref, PDH)).isInstanceOf(InvalidScryfallSelectionException.class);
        when(client.search(eligible)).thenThrow(new ScryfallClientException(ScryfallClientException.Kind.UNAVAILABLE));
        assertThatThrownBy(() -> lookup.resolveCommanderOnline(ref, PDH)).isInstanceOf(ScryfallClientException.class);
        verify(client, times(3)).card(id);
    }

    @Test
    void reversibleSelectionAuthorizesOnlySelectedOracleAndRequiresAuthoritativeFaceColors() {
        ObjectNode eligible = card("Test Front", "Creature — Human");
        ObjectNode ineligible = card("Test Back", "Creature — Elf");
        ObjectNode reversible = card("Test Front // Test Back", "Creature — Human").put("layout", "reversible_card");
        reversible.remove(List.of("oracle_id", "color_identity"));
        reversible.putArray("card_faces").add(eligible).add(ineligible);
        UUID id = UUID.fromString(reversible.path("id").asText());
        when(client.card(id)).thenReturn(reversible);
        when(client.search(anyString())).thenAnswer(call -> {
            String query = call.getArgument(0);
            if (query.startsWith("name:/")) return page(List.of(reversible));
            if (!query.contains("is:PauperCommander")) return page(List.of(eligible, ineligible));
            if (query.startsWith("(")) return page(List.of(eligible));
            return page(query.contains(ineligible.path("oracle_id").asText()) ? List.of() : List.of(eligible));
        });
        assertThat(lookup.resolveCommanderOnline(new CommanderSelectionRef(id, 0), PDH).gameplay().colorIdentity()).containsExactly("R");
        assertThatThrownBy(() -> lookup.resolveCommanderOnline(new CommanderSelectionRef(id, 1), PDH))
                .isInstanceOf(InvalidScryfallSelectionException.class);
        assertThatThrownBy(() -> lookup.resolveCommanderOnline(new CommanderSelectionRef(id, null), PDH))
                .isInstanceOf(InvalidScryfallSelectionException.class);
        assertThat(lookup.searchCommanders("Test", PDH)).singleElement()
                .satisfies(choice -> assertThat(choice.selectionRef().gameplayFaceIndex()).isZero());
        verify(client).search("(oracleid:" + eligible.path("oracle_id").asText() + " or oracleid:"
                + ineligible.path("oracle_id").asText() + ") is:PauperCommander -layout:reversible_card");
        eligible.remove("color_identity");
        ScryfallLookup fresh = new ScryfallLookup(client, new ScryfallNormalizer());
        assertThatThrownBy(() -> fresh.resolveCommanderOnline(new CommanderSelectionRef(id, 0), PDH))
                .isInstanceOf(MalformedScryfallResponseException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"Instant", "Sorcery", "Legendary Planeswalker — Test", "Basic Land — Forest"})
    void providerMembershipNeverGrantsUnsupportedCommanderTypes(String type) {
        ObjectNode raw = card("Test", type);
        UUID id = UUID.fromString(raw.path("id").asText());
        when(client.card(id)).thenReturn(raw);
        when(client.search(anyString())).thenReturn(page(List.of(raw)));
        assertThatThrownBy(() -> lookup.resolveCommanderOnline(new CommanderSelectionRef(id, null), PDH))
                .isInstanceOf(InvalidScryfallSelectionException.class);
    }

    private ObjectNode card(String name, String type) {
        return (ObjectNode) json.valueToTree(Map.of("id", UUID.randomUUID(), "oracle_id", UUID.randomUUID(),
                "name", name, "lang", "en", "layout", "normal", "type_line", type,
                "legalities", Map.of("commander", "legal"), "color_identity", List.of("R")));
    }

    private ObjectNode page(List<JsonNode> cards) {
        return (ObjectNode) json.valueToTree(Map.of("object", "list", "has_more", false, "data", cards));
    }
}
