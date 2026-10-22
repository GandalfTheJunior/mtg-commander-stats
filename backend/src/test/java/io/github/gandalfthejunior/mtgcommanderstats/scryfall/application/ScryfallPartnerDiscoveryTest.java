package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderChoice;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.PairingCapabilities;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.ScryfallNormalizer;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Exercises candidate discovery as well as the authoritative post-search validation. */
class ScryfallPartnerDiscoveryTest {
    private static final String VARIANT = "Partner—New label";
    private static final UUID FIRST = new UUID(0, 1);
    private final JsonMapper json = JsonMapper.builder().build();
    private final ScryfallNormalizer normalizer = new ScryfallNormalizer();
    private final ScryfallClient client = mock(ScryfallClient.class);
    private final ScryfallLookup lookup = new ScryfallLookup(client, normalizer);

    @ParameterizedTest
    @ValueSource(strings = {"oracle", "keywords", "both"})
    void discoversEveryCurrentlyClassifiedNamedVariantRepresentation(String representation) {
        ObjectNode first = card(FIRST, new UUID(0, 2), "First", VARIANT, List.of(VARIANT));
        ObjectNode second = card(new UUID(0, 3), new UUID(0, 4), "Second",
                representation.equals("keywords") ? "Flying" : VARIANT,
                representation.equals("oracle") ? List.of() : List.of(VARIANT));
        assertCompatible(first, second);
        provider(first, List.of(second));

        assertThat(lookup.searchPartners("Second", new CommanderSelectionRef(FIRST, null)))
                .extracting(CommanderChoice::name).containsExactly("Second");
    }

    @Test
    void discoversOrdinaryPartnerFromOracleTextEvenWithoutKeywordMetadata() {
        ObjectNode first = card(FIRST, new UUID(0, 2), "First", "Partner", List.of("Partner"));
        ObjectNode second = card(new UUID(0, 3), new UUID(0, 4), "Second", "Partner", List.of());
        assertCompatible(first, second);
        provider(first, List.of(second));

        assertThat(lookup.searchPartners("Second", new CommanderSelectionRef(FIRST, null)))
                .extracting(CommanderChoice::name).containsExactly("Second");
    }

    @Test
    void aBroadKeywordCandidateDoesNotAuthorizeOrdinaryPartnerWithoutTheAbility() {
        ObjectNode first = card(FIRST, new UUID(0, 2), "First", "Partner", List.of("Partner"));
        ObjectNode unknown = card(new UUID(0, 3), new UUID(0, 4), "Second", "Unknown future pairing", List.of("Partner"));
        provider(first, List.of(unknown));

        assertThat(lookup.searchPartners("Second", new CommanderSelectionRef(FIRST, null))).isEmpty();
    }

    private void assertCompatible(JsonNode first, JsonNode second) {
        assertThat(PairingCapabilities.compatible(normalizer.normalize(first).gameplayCards().getFirst(),
                normalizer.normalize(second).gameplayCards().getFirst())).isTrue();
    }

    private void provider(JsonNode first, List<JsonNode> candidates) {
        when(client.card(FIRST)).thenReturn(first);
        when(client.search(anyString())).thenAnswer(invocation -> {
            String query = invocation.getArgument(0);
            // Deliberately model separate text and keyword indexes, not a provider returning every fixture.
            List<JsonNode> matching = candidates.stream().filter(card -> matchesPairingFilter(query, card)).toList();
            return json.valueToTree(Map.of("object", "list", "data", matching, "has_more", false));
        });
    }

    private static boolean matchesPairingFilter(String query, JsonNode card) {
        Matcher oracle = Pattern.compile("o:/((?:\\\\.|[^/])*)/").matcher(query);
        while (oracle.find()) {
            if (Pattern.compile(oracle.group(1), Pattern.CASE_INSENSITIVE | Pattern.MULTILINE)
                    .matcher(card.path("oracle_text").asText()).find()) {
                return true;
            }
        }
        Matcher keyword = Pattern.compile("kw:(?:\"([^\"]*)\"|([^ )]+))").matcher(query);
        while (keyword.find()) {
            String requested = keyword.group(1) == null ? keyword.group(2) : keyword.group(1);
            for (JsonNode actual : card.path("keywords")) {
                if (requested.equalsIgnoreCase(actual.asText())) {
                    return true;
                }
            }
        }
        return false;
    }

    private ObjectNode card(UUID printing, UUID oracle, String name, String text, List<String> keywords) {
        ObjectNode card = json.createObjectNode();
        card.put("id", printing.toString()).put("oracle_id", oracle.toString()).put("name", name)
                .put("layout", "normal").put("lang", "en").put("type_line", "Legendary Creature — Human")
                .put("oracle_text", text);
        card.set("keywords", json.valueToTree(keywords));
        card.set("legalities", json.valueToTree(Map.of("commander", "legal")));
        card.putArray("color_identity");
        return card;
    }
}
