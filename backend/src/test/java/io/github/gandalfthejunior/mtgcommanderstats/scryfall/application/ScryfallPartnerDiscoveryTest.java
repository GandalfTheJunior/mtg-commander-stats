package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import java.io.IOException;
import java.io.InputStream;
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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Query-aware regressions adapted from backup commit e36c4d7 after live provider verification. */
class ScryfallPartnerDiscoveryTest {
    private static final UUID FIRST = new UUID(0, 1);
    private final JsonMapper json = JsonMapper.builder().build();
    private final ScryfallNormalizer normalizer = new ScryfallNormalizer();
    private final ScryfallClient client = mock(ScryfallClient.class);
    private final ScryfallLookup lookup = new ScryfallLookup(client, normalizer);

    @ParameterizedTest
    @ValueSource(strings = {"Survivors", "Friends forever", "New label"})
    void discoversNamedVariantsWithGenericPartnerKeywordsAndTheirOwnOracleLabel(String label) {
        String ability = "Partner—" + label;
        ObjectNode first = card(FIRST, new UUID(0, 2), "First", ability, List.of("Partner"));
        ObjectNode second = card(new UUID(0, 3), new UUID(0, 4), "Second",
                ability + " (You can have two commanders if both have this ability.)", List.of("Partner"));
        ObjectNode wrongVariant = card(new UUID(0, 5), new UUID(0, 6), "Second wrong variant",
                "Partner—Different label", List.of("Partner"));
        assertCompatible(first, second);
        provider(first, List.of(wrongVariant, second));

        assertThat(lookup.searchPartners("Second", new CommanderSelectionRef(FIRST, null)))
                .extracting(CommanderChoice::name).containsExactly("Second");
    }

    @Test
    void discoversOrdinaryPartnerWithTheProvidersKeywordMetadata() {
        ObjectNode first = card(FIRST, new UUID(0, 2), "First", "Partner", List.of("Partner"));
        ObjectNode second = card(new UUID(0, 3), new UUID(0, 4), "Second",
                "Partner (You can have two commanders if both have partner.)", List.of("Partner"));
        assertCompatible(first, second);
        provider(first, List.of(second));

        assertThat(lookup.searchPartners("Second", new CommanderSelectionRef(FIRST, null)))
                .extracting(CommanderChoice::name).containsExactly("Second");
    }

    @Test
    void aBroadKeywordCandidateDoesNotAuthorizeOrdinaryPartnerWithoutTheAbility() {
        ObjectNode first = card(FIRST, new UUID(0, 2), "First", "Partner", List.of("Partner"));
        ObjectNode named = card(new UUID(0, 3), new UUID(0, 4), "Second named", "Partner—Survivors", List.of("Partner"));
        ObjectNode reciprocal = card(new UUID(0, 5), new UUID(0, 6), "Second reciprocal", "Partner with First", List.of("Partner", "Partner with"));
        ObjectNode unknown = card(new UUID(0, 7), new UUID(0, 8), "Second unknown", "Unknown future pairing", List.of("Partner"));
        provider(first, List.of(named, reciprocal, unknown));

        assertThat(lookup.searchPartners("Second", new CommanderSelectionRef(FIRST, null))).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"exact-ordinary", "exact-survivors", "exact-friends", "exact-character-select", "exact-father-son"})
    void replaysRealScryfallResultsOnlyForTheCapturedProviderQuery(String scenario) throws IOException {
        JsonNode fixture;
        try (InputStream input = getClass().getResourceAsStream("/scryfall/partner-discovery.json")) {
            fixture = json.readTree(input).path(scenario);
        }
        JsonNode first = fixture.path("context");
        UUID firstId = UUID.fromString(first.path("id").asText());
        String query = fixture.path("query").asText();
        when(client.card(firstId)).thenReturn(first);
        // The expected query and response were captured independently of partnerFilters(...).
        when(client.search(query)).thenReturn(fixture.path("response"));

        List<CommanderChoice> result = lookup.searchPartners(fixture.path("input").asText(),
                new CommanderSelectionRef(firstId, null));

        assertThat(result).extracting(CommanderChoice::name)
                .containsExactlyElementsOf(fixture.path("response").path("data").valueStream()
                        .map(card -> card.path("name").asText()).toList());
        assertThat(result).isNotEmpty();
        verify(client).search(query);
    }

    private void assertCompatible(JsonNode first, JsonNode second) {
        assertThat(PairingCapabilities.compatible(normalizer.normalize(first).gameplayCards().getFirst(),
                normalizer.normalize(second).gameplayCards().getFirst())).isTrue();
    }

    private void provider(JsonNode first, List<JsonNode> candidates) {
        when(client.card(FIRST)).thenReturn(first);
        when(client.search(anyString())).thenAnswer(invocation -> {
            String query = invocation.getArgument(0);
            // Only the generated pairing OR filters are modeled here. The live-query replay below
            // separately verifies the complete query against captured real provider results.
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
