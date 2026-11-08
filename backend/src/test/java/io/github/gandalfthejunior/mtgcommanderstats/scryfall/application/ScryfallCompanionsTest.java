package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CompanionChoice;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.InvalidCompanionSelectionException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.InvalidScryfallSelectionException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.MalformedScryfallResponseException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.ScryfallNormalizer;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ScryfallCompanionsTest {
    private final JsonMapper json = JsonMapper.builder().build();
    private final ScryfallClient client = mock(ScryfallClient.class);
    private final ScryfallLookup lookup = new ScryfallLookup(client, new ScryfallNormalizer(), new RelatedTokenLookup(client));

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "158a6225-a246-4fd6-aa57-0df8067b4383|Lutri, the Spellchaser",
            "e15504a7-2b67-4185-b916-172145f10b19|Yorion, Sky Nomad"
    })
    void restrictionsFollowOracleIdentityAcrossNamesAndPrintings(String oracleId, String originalName) {
        ObjectNode renamed = card("Renamed Companion", "Companion").put("oracle_id", oracleId);
        ObjectNode alternate = renamed.deepCopy().put("id", UUID.randomUUID().toString());
        when(client.search(anyString())).thenReturn(page(List.of(renamed, alternate)));
        assertThat(lookup.searchCompanions("Renamed")).isEmpty();
        for (ObjectNode printing : List.of(renamed, alternate)) {
            UUID id = UUID.fromString(printing.path("id").asText());
            when(client.card(id)).thenReturn(printing);
            assertThatThrownBy(() -> lookup.resolveCompanionOnline(new CommanderSelectionRef(id, null)))
                    .isInstanceOf(InvalidCompanionSelectionException.class).hasMessageContaining(originalName);
        }
        ObjectNode differentIdentity = card(originalName, "Companion").put("oracle_id", UUID.randomUUID().toString());
        UUID id = UUID.fromString(differentIdentity.path("id").asText());
        when(client.card(id)).thenReturn(differentIdentity);
        assertThat(lookup.resolveCompanionOnline(new CommanderSelectionRef(id, null)).gameplay().oracleId())
                .isEqualTo(differentIdentity.path("oracle_id").asText());
    }

    @Test
    void filtersMechanicRestrictionsLegalityAndLanguageThenDeduplicates() {
        ObjectNode valid = card("Sky Companion", "Companion");
        ObjectNode alternate = valid.deepCopy().put("id", UUID.randomUUID().toString());
        ObjectNode doctor = card("Sky Doctor", "Doctor's companion");
        ObjectNode nonlegal = card("Sky Banned", "Companion");
        nonlegal.withObject("legalities").put("commander", "banned");
        ObjectNode foreign = card("Sky Foreign", "Companion").put("lang", "de");
        when(client.search(anyString())).thenReturn(page(List.of(doctor, card("Sky Ordinary", "Flying"),
                card("Lutri, the Spellchaser", "Companion"), card("Yorion, Sky Nomad", "Companion"),
                nonlegal, foreign, valid, alternate)));

        List<CompanionChoice> choices = lookup.searchCompanions("Sky");

        assertThat(choices).hasSize(1);
        assertThat(choices.getFirst().name()).isEqualTo("Sky Companion");
        assertThat(choices.getFirst().colorIdentity()).containsExactly("W", "B");
        assertThat(choices.getFirst().thumbnailUrl()).isNull();
        assertThat(lookup.searchCompanions("\u00a0SKY\u2007")).isEqualTo(choices);
        verify(client, times(1)).search(anyString());
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "a", " \u00a0", "ab\u0001", "ab\u200b"})
    void invalidQueriesNeverContactProvider(String input) {
        assertThatThrownBy(() -> lookup.searchCompanions(input)).isInstanceOf(InvalidScryfallRequestException.class);
        verifyNoInteractions(client);
    }

    @Test
    void literalQueriesAndBoundsReuseCommanderProtection() {
        when(client.search(anyString())).thenReturn(page(List.of()));
        lookup.searchCompanions("ab/ or (name:.*)");
        ArgumentCaptor<String> query = ArgumentCaptor.forClass(String.class);
        verify(client).search(query.capture());
        assertThat(query.getValue()).isEqualTo("name:/ab\\/ or \\(name:\\.\\*\\)/ lang:en game:paper f:commander kw:companion");
        assertThatThrownBy(() -> lookup.searchCompanions("a".repeat(101))).isInstanceOf(InvalidScryfallRequestException.class);
    }

    @Test
    void searchHasBoundedPagesAndResultsAndRejectsMalformedProviderMetadata() {
        List<JsonNode> cards = new ArrayList<>();
        for (int i = 0; i < 30; i++) cards.add(card("Companion " + i, "Companion"));
        ObjectNode result = page(cards);
        result.put("has_more", true).put("next_page", "https://api.scryfall.com/cards/search?page=2");
        when(client.search(anyString())).thenReturn(result);
        when(client.nextPage(anyString())).thenReturn(result);
        assertThat(lookup.searchCompanions("Companion")).hasSize(20);
        verify(client, times(1)).nextPage(anyString()); // Forty-card traversal cap, before any third page.
        when(client.search(anyString())).thenReturn(page(List.of(card("Bad", "Companion").put("lang", 5))));
        assertThatThrownBy(() -> lookup.searchCompanions("Bad")).isInstanceOf(MalformedScryfallResponseException.class);
    }

    @Test
    void changedSelectionsAreFreshAndPrintingIdentityIsNeverInvented() {
        ObjectNode valid = card("Candidate", "Companion");
        UUID printing = UUID.fromString(valid.path("id").asText());
        when(client.search(anyString())).thenReturn(page(List.of(valid)));
        when(client.card(printing)).thenReturn(valid);
        lookup.searchCompanions("Candidate");
        assertThat(lookup.resolveCompanionOnline(new CommanderSelectionRef(printing, null)).gameplay().name()).isEqualTo("Candidate");
        ObjectNode banned = valid.deepCopy();
        banned.withObject("legalities").put("commander", "banned");
        when(client.card(printing)).thenReturn(banned);
        assertThatThrownBy(() -> lookup.resolveCompanionOnline(new CommanderSelectionRef(printing, null)))
                .isInstanceOf(InvalidCompanionSelectionException.class);
        verify(client, times(2)).card(printing);
        when(client.card(printing)).thenReturn(valid.deepCopy().put("id", UUID.randomUUID().toString()));
        assertThatThrownBy(() -> lookup.resolveCompanionOnline(new CommanderSelectionRef(printing, null)))
                .isInstanceOf(MalformedScryfallResponseException.class);
    }

    @Test
    void oracleAbilityFallbackIsAnchoredAndBackFaceMechanicsDoNotGrantEligibility() {
        ObjectNode valid = card("Rules Companion", "Flying").put("oracle_text", "Companion — Your starting deck meets a condition.");
        valid.remove("keywords");
        UUID id = UUID.fromString(valid.path("id").asText());
        when(client.card(id)).thenReturn(valid);
        assertThat(lookup.resolveCompanionOnline(new CommanderSelectionRef(id, null)).gameplay().hasCompanionMechanic()).isTrue();
        valid.put("oracle_text", "Doctor's companion (You can have two commanders.)");
        assertThatThrownBy(() -> lookup.resolveCompanionOnline(new CommanderSelectionRef(id, null)))
                .isInstanceOf(InvalidCompanionSelectionException.class);
        ObjectNode back = card("Back", "Companion");
        valid.put("layout", "modal_dfc");
        valid.putArray("keywords").add("Companion");
        valid.putArray("card_faces").add(card("Front", "Flying")).add(back);
        assertThatThrownBy(() -> lookup.resolveCompanionOnline(new CommanderSelectionRef(id, null)))
                .isInstanceOf(InvalidCompanionSelectionException.class);
        assertThatThrownBy(() -> lookup.resolveCompanionOnline(new CommanderSelectionRef(id, 1)))
                .isInstanceOf(InvalidScryfallSelectionException.class);
    }

    private ObjectNode card(String name, String keyword) {
        String oracleId = switch (name) {
            case "Lutri, the Spellchaser" -> "158a6225-a246-4fd6-aa57-0df8067b4383";
            case "Yorion, Sky Nomad" -> "e15504a7-2b67-4185-b916-172145f10b19";
            default -> UUID.randomUUID().toString();
        };
        ObjectNode card = json.createObjectNode().put("id", UUID.randomUUID().toString())
                .put("oracle_id", oracleId).put("name", name).put("lang", "en")
                .put("layout", "normal").put("type_line", "Legendary Creature — Test").put("oracle_text", keyword);
        card.putArray("keywords").add(keyword);
        card.putArray("color_identity").add("B").add("W");
        card.putObject("legalities").put("commander", "legal");
        return card;
    }

    private ObjectNode page(List<? extends JsonNode> cards) {
        return (ObjectNode) json.valueToTree(Map.of("object", "list", "data", cards, "has_more", false));
    }
}
