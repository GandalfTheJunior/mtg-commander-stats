package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.Artwork;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CardDetails;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderChoice;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.InvalidScryfallSelectionException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.MalformedScryfallResponseException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.ScryfallNormalizer;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClient;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClientException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClientException.Kind;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ScryfallLookupTest {
    private static final UUID PRINTING = id(1);
    private static final UUID ORACLE = id(2);
    private final JsonMapper json = JsonMapper.builder().build();
    private final ScryfallClient client = mock(ScryfallClient.class);
    private final ScryfallLookup lookup = new ScryfallLookup(client, new ScryfallNormalizer());

    @Test
    void treatsNameAsLiteralInsteadOfExecutingScryfallQuerySyntax() {
        when(client.search(anyString())).thenReturn(page(List.of()));

        lookup.searchCommanders("ab/ or (name:.*)");

        ArgumentCaptor<String> query = ArgumentCaptor.forClass(String.class);
        verify(client).search(query.capture());
        assertThat(query.getValue()).startsWith("name:/ab\\/ or \\(name:\\.\\*\\)/ lang:en");
        assertThat(query.getValue()).contains("f:commander", "is:commander", "t:background");
    }

    @Test
    void normalizesUnicodeWhitespaceAndCachesCaseInsensitiveEquivalentNames() {
        when(client.search(anyString())).thenReturn(page(List.of()));

        assertThat(lookup.searchCommanders("\u00a0Atraxa\u2007  Test\u0085")).isEmpty();
        assertThat(lookup.searchCommanders("atraxa test")).isEmpty();

        verify(client).search("name:/Atraxa Test/ lang:en game:paper f:commander"
                + " (is:commander or t:background or kw:\"Doctor's companion\")");
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "a", " \u00a0\u2007", "a \t\u0085", "ab\u0001", "ab\u200b"})
    void rejectsInvalidQueriesBeforeAnyOutboundRequest(String query) {
        assertThatThrownBy(() -> lookup.searchCommanders(query)).isInstanceOf(InvalidScryfallRequestException.class);
        verifyNoInteractions(client);
    }

    @Test
    void rejectsOverlongQueriesBeforeOutboundRequest() {
        assertThatThrownBy(() -> lookup.searchCommanders("a".repeat(101)))
                .isInstanceOf(InvalidScryfallRequestException.class);
        verifyNoInteractions(client);
    }

    @Test
    void deduplicatesGameplayOracleIdentityAndCapsSuggestionsAtTwenty() {
        List<JsonNode> cards = new ArrayList<>();
        cards.add(card(id(10), id(100), "Commander first"));
        cards.add(card(id(11), id(100), "Commander duplicate printing"));
        for (int index = 0; index < 25; index++) {
            cards.add(card(id(20 + index), id(200 + index), "Commander " + index));
        }
        when(client.search(anyString())).thenReturn(page(cards));

        List<CommanderChoice> result = lookup.searchCommanders("Commander");

        assertThat(result).hasSize(20);
        assertThat(result.getFirst().scryfallCardId()).isEqualTo(id(10));
        assertThat(result).noneMatch(choice -> choice.scryfallCardId().equals(id(11)));
        assertThat(result).allMatch(CommanderChoice::canBeSoleCommander);
    }

    @Test
    void filtersIllegalAndNonEnglishCandidates() {
        ObjectNode banned = card(id(10), id(100), "Commander banned");
        banned.set("legalities", json.valueToTree(Map.of("commander", "banned")));
        ObjectNode german = card(id(11), id(101), "Commander German");
        german.put("lang", "de");
        ObjectNode normal = card(id(12), id(102), "Commander eligible");
        when(client.search(anyString())).thenReturn(page(List.of(banned, german, normal)));

        assertThat(lookup.searchCommanders("Commander")).extracting(CommanderChoice::name)
                .containsExactly("Commander eligible");
    }

    @Test
    void emptySearch404IsCachedButUnavailableSearchIsNeverAnEmptySuccess() {
        when(client.search(anyString())).thenThrow(new ScryfallClientException(Kind.NOT_FOUND));
        assertThat(lookup.searchCommanders("Missing")).isEmpty();
        assertThat(lookup.searchCommanders("missing")).isEmpty();
        verify(client, times(1)).search(anyString());

        doThrow(new ScryfallClientException(Kind.UNAVAILABLE)).when(client).search(anyString());
        assertThatThrownBy(() -> lookup.searchCommanders("Other"))
                .isInstanceOfSatisfying(ScryfallClientException.class,
                        exception -> assertThat(exception.kind()).isEqualTo(Kind.UNAVAILABLE));
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"object\":\"list\",\"data\":{},\"has_more\":false}",
            "{\"object\":\"list\",\"data\":[]}",
            "{\"object\":\"list\",\"data\":[null],\"has_more\":false}"})
    void controlsMalformedUpstreamLists(String response) {
        when(client.search(anyString())).thenReturn(json.readTree(response));
        assertThatThrownBy(() -> lookup.searchCommanders("Missing"))
                .isInstanceOf(MalformedScryfallResponseException.class);
    }

    @Test
    void treatsMissingSearchLanguageAsMalformedRatherThanAnEmptySearch() {
        ObjectNode malformed = card(PRINTING, ORACLE, "Atraxa");
        malformed.remove("lang");
        when(client.search(anyString())).thenReturn(page(List.of(malformed)));

        assertThatThrownBy(() -> lookup.searchCommanders("Atraxa"))
                .isInstanceOf(MalformedScryfallResponseException.class);
    }

    @Test
    void ordinaryDetailsAreCachedButPersistenceResolvesPrintingFreshAndFailsOffline() {
        ObjectNode card = card(PRINTING, ORACLE, "Atraxa");
        when(client.card(PRINTING)).thenReturn(card, card)
                .thenThrow(new ScryfallClientException(Kind.UNAVAILABLE));
        when(client.search(anyString())).thenReturn(page(List.of(card)));
        lookup.searchCommanders("Atraxa");
        CardDetails first = lookup.cardDetails(PRINTING);
        assertThat(lookup.cardDetails(PRINTING)).isSameAs(first);

        CommanderSelectionRef reference = new CommanderSelectionRef(PRINTING, null);
        assertThat(lookup.resolveStandaloneCommanderOnline(reference).gameplay().oracleId()).isEqualTo(ORACLE.toString());
        assertThatThrownBy(() -> lookup.resolveStandaloneCommanderOnline(reference))
                .isInstanceOfSatisfying(ScryfallClientException.class,
                        exception -> assertThat(exception.kind()).isEqualTo(Kind.UNAVAILABLE));
        verify(client, times(3)).card(PRINTING);
    }

    @Test
    void keepsSecondOnlyBackgroundSearchableButRejectsStandalonePersistence() {
        ObjectNode background = card(PRINTING, ORACLE, "Noble Heritage");
        background.put("type_line", "Legendary Enchantment — Background");
        when(client.search(anyString())).thenReturn(page(List.of(background)));
        when(client.card(PRINTING)).thenReturn(background);

        assertThat(lookup.searchCommanders("Noble")).singleElement()
                .satisfies(choice -> assertThat(choice.canBeSoleCommander()).isFalse());
        CommanderSelectionRef reference = new CommanderSelectionRef(PRINTING, null);
        assertThat(lookup.resolveCommanderOnline(reference).gameplay().canBeSoleCommander()).isFalse();
        assertThatThrownBy(() -> lookup.resolveStandaloneCommanderOnline(reference))
                .isInstanceOf(InvalidScryfallSelectionException.class);
    }

    @Test
    void rejectsUnexpectedPrintingIdentityAndPreservesUnknownCardError() {
        when(client.card(PRINTING)).thenReturn(card(id(99), ORACLE, "Atraxa"));
        assertThatThrownBy(() -> lookup.cardDetails(PRINTING))
                .isInstanceOf(MalformedScryfallResponseException.class);
        when(client.card(PRINTING)).thenThrow(new ScryfallClientException(Kind.NOT_FOUND));
        assertThatThrownBy(() -> lookup.cardDetails(PRINTING))
                .isInstanceOfSatisfying(ScryfallClientException.class,
                        exception -> assertThat(exception.kind()).isEqualTo(Kind.NOT_FOUND));
    }

    @Test
    void enrichesReversibleFacesByTheirOwnOracleIdentitiesAndPreservesSelectedFace() {
        UUID firstOracle = id(100);
        UUID secondOracle = id(101);
        ObjectNode firstRules = card(id(10), firstOracle, "Commander White");
        firstRules.set("color_identity", json.valueToTree(List.of("W")));
        ObjectNode secondRules = card(id(11), secondOracle, "Commander Red");
        secondRules.set("color_identity", json.valueToTree(List.of("R")));
        ObjectNode reversible = reversible(firstOracle, secondOracle);
        when(client.search(anyString())).thenAnswer(invocation -> {
            String query = invocation.getArgument(0);
            return query.startsWith("name:/") ? page(List.of(reversible)) : page(List.of(firstRules, secondRules));
        });
        when(client.card(PRINTING)).thenReturn(reversible);
        when(client.printings(anyString())).thenReturn(page(List.of(reversible)));

        List<CommanderChoice> choices = lookup.searchCommanders("Commander");

        assertThat(choices).extracting(CommanderChoice::name).containsExactly("Commander White", "Commander Red");
        assertThat(choices.get(0).colorIdentity()).containsExactly("W");
        assertThat(choices.get(1).colorIdentity()).containsExactly("R");
        assertThat(choices.get(1).thumbnailUrl()).endsWith("back-small.jpg");
        assertThat(choices.get(1).selectionRef().gameplayFaceIndex()).isEqualTo(1);
        ResolvedCommander selected = lookup.resolveStandaloneCommanderOnline(choices.get(1).selectionRef());
        assertThat(selected.gameplay().oracleId()).isEqualTo(secondOracle.toString());
        assertThat(selected.gameplay().defaultArtwork().artworkFaceIndex()).isEqualTo(1);
        assertThat(lookup.artworks(PRINTING, 1).getFirst().artworkFaceIndex()).isEqualTo(1);
        assertThatThrownBy(() -> lookup.resolveCommanderOnline(new CommanderSelectionRef(PRINTING, null)))
                .isInstanceOf(InvalidScryfallSelectionException.class);
        verify(client, times(2)).search(anyString()); // name search plus one bounded Oracle batch; metadata is cached
    }

    @Test
    void reversibleFacesWithTheSameOracleIdentityStayOneSearchOption() {
        ObjectNode rules = card(id(10), ORACLE, "Commander Same");
        ObjectNode reversible = reversible(ORACLE, ORACLE);
        when(client.search(anyString())).thenAnswer(invocation -> {
            String query = invocation.getArgument(0);
            return query.startsWith("name:/") ? page(List.of(reversible)) : page(List.of(rules));
        });
        assertThat(lookup.searchCommanders("Commander")).hasSize(1);
    }

    @Test
    void artworkDeduplicationPreservesDifferentFrontAndBackIllustrationsAndCaches() {
        ObjectNode card = twoFaced(PRINTING, ORACLE);
        ObjectNode anotherPrinting = card.deepCopy();
        anotherPrinting.put("id", id(10).toString());
        when(client.card(PRINTING)).thenReturn(card);
        when(client.printings(anyString())).thenReturn(page(List.of(card, anotherPrinting)));

        List<Artwork> artworks = lookup.artworks(PRINTING, null);

        assertThat(artworks).hasSize(2);
        assertThat(artworks).extracting(Artwork::artworkFaceIndex).containsExactly(0, 1);
        assertThat(artworks.get(1).artist()).isEqualTo("Back Artist");
        assertThat(lookup.artworks(PRINTING, null)).isSameAs(artworks);
        verify(client).printings("oracleid:" + ORACLE);
    }

    @Test
    void aSoleBackImageRetainsItsOriginalIndexAndNoImageReturnsEmpty() {
        ObjectNode card = twoFaced(PRINTING, ORACLE);
        ((ObjectNode) card.path("card_faces").get(0)).remove("image_uris");
        when(client.card(PRINTING)).thenReturn(card);
        when(client.printings(anyString())).thenReturn(page(List.of(card)));
        assertThat(lookup.artworks(PRINTING, null)).singleElement()
                .satisfies(artwork -> assertThat(artwork.artworkFaceIndex()).isEqualTo(1));

        UUID noImageId = id(10);
        ObjectNode noImage = card(noImageId, id(100), "No Image Commander");
        when(client.card(noImageId)).thenReturn(noImage);
        when(client.printings(anyString())).thenReturn(page(List.of(noImage)));
        assertThat(lookup.artworks(noImageId, null)).isEmpty();
    }

    @Test
    void discoversDistinctArtworkFromNonEnglishPrintings() {
        ObjectNode english = card(PRINTING, ORACLE, "Atraxa");
        ObjectNode japanese = card(id(10), ORACLE, "Atraxa");
        japanese.put("lang", "ja");
        japanese.put("illustration_id", id(300).toString());
        japanese.put("artist", "Alternate Artist");
        japanese.set("image_uris", json.valueToTree(images("japanese")));
        when(client.card(PRINTING)).thenReturn(english);
        when(client.printings("oracleid:" + ORACLE)).thenReturn(page(List.of(japanese)));

        assertThat(lookup.artworks(PRINTING, null)).singleElement().satisfies(artwork -> {
            assertThat(artwork.scryfallCardId()).isEqualTo(id(10));
            assertThat(artwork.artist()).isEqualTo("Alternate Artist");
        });
    }

    @Test
    void discoversDistinctRareVariantArtworkWithoutDuplicatingTheSameIllustration() {
        ObjectNode original = card(PRINTING, ORACLE, "Atraxa");
        original.put("illustration_id", id(300).toString());
        original.set("image_uris", json.valueToTree(images("original")));
        ObjectNode rareVariant = original.deepCopy();
        rareVariant.put("id", id(10).toString());
        rareVariant.put("variation", true);
        rareVariant.put("variation_of", PRINTING.toString());
        rareVariant.put("illustration_id", id(301).toString());
        rareVariant.put("artist", "Rare Variant Artist");
        rareVariant.set("image_uris", json.valueToTree(images("rare-variant")));
        ObjectNode sameIllustration = original.deepCopy();
        sameIllustration.put("id", id(11).toString());
        sameIllustration.put("variation", true);
        sameIllustration.put("variation_of", PRINTING.toString());
        sameIllustration.set("image_uris", json.valueToTree(images("same-illustration-variant")));
        when(client.card(PRINTING)).thenReturn(original);
        when(client.printings("oracleid:" + ORACLE))
                .thenReturn(page(List.of(original, rareVariant, sameIllustration)));

        List<Artwork> artworks = lookup.artworks(PRINTING, null);

        assertThat(artworks).extracting(Artwork::scryfallCardId).containsExactly(PRINTING, id(10));
        assertThat(artworks).extracting(Artwork::illustrationId)
                .containsExactly(id(300).toString(), id(301).toString());
        assertThat(artworks.get(1).artCropUrl()).endsWith("rare-variant-crop.jpg");
        assertThat(artworks.get(1).artist()).isEqualTo("Rare Variant Artist");
    }

    @Test
    void ordinaryNoncommanderArtworkDiscoveryDoesNotMakeTheCardCommanderEligible() {
        ObjectNode island = card(PRINTING, ORACLE, "Island");
        island.put("type_line", "Basic Land — Island");
        island.put("oracle_text", "{T}: Add {U}.");
        island.put("illustration_id", id(300).toString());
        island.put("artist", "Island Artist");
        island.set("color_identity", json.valueToTree(List.of("U")));
        island.set("keywords", json.valueToTree(List.of()));
        island.set("image_uris", json.valueToTree(images("island")));
        when(client.card(PRINTING)).thenReturn(island);
        when(client.printings("oracleid:" + ORACLE)).thenReturn(page(List.of(island)));

        assertThat(lookup.cardDetails(PRINTING).commanderSelections()).isEmpty();
        assertThat(lookup.artworks(PRINTING, null)).singleElement().satisfies(artwork -> {
            assertThat(artwork.artCropUrl()).endsWith("island-crop.jpg");
            assertThat(artwork.artist()).isEqualTo("Island Artist");
        });
        assertThatThrownBy(() -> lookup.resolveCommanderOnline(new CommanderSelectionRef(PRINTING, null)))
                .isInstanceOf(InvalidScryfallSelectionException.class);
        assertThatThrownBy(() -> lookup.artworks(PRINTING, 0))
                .isInstanceOf(InvalidScryfallSelectionException.class);
    }

    @Test
    void keepsBothSelectedReversiblePrintingArtworksWhenAlternativePrintingsAreEmpty() {
        UUID firstOracle = id(100);
        UUID secondOracle = id(101);
        ObjectNode reversible = reversible(firstOracle, secondOracle);
        ObjectNode firstRules = card(id(10), firstOracle, "Commander White");
        ObjectNode secondRules = card(id(11), secondOracle, "Commander Red");
        when(client.card(PRINTING)).thenReturn(reversible);
        when(client.search(anyString())).thenReturn(page(List.of(firstRules, secondRules)));
        when(client.printings("oracleid:" + secondOracle)).thenReturn(page(List.of()));
        lookup.cardDetails(PRINTING); // The artwork route must retain all original imagery through the detail cache.

        List<Artwork> artworks = lookup.artworks(PRINTING, 1);

        assertThat(artworks).hasSize(2);
        assertThat(artworks).extracting(Artwork::artworkFaceIndex).containsExactly(1, 0);
        assertThat(artworks).allMatch(artwork -> artwork.scryfallCardId().equals(PRINTING));
        assertThat(artworks).extracting(Artwork::artist).containsExactly("Back Artist", "Front Artist");
        verify(client, times(1)).card(PRINTING);
    }

    @Test
    void rejectsUnrelatedArtworkPrintingAndDoesNotTurnUpstreamFailureIntoAnEmptyList() {
        when(client.card(PRINTING)).thenReturn(card(PRINTING, ORACLE, "Atraxa"));
        when(client.printings(anyString())).thenReturn(page(List.of(card(id(10), id(100), "Other"))));
        assertThatThrownBy(() -> lookup.artworks(PRINTING, null))
                .isInstanceOf(MalformedScryfallResponseException.class);
        when(client.printings(anyString())).thenThrow(new ScryfallClientException(Kind.UNAVAILABLE));
        assertThatThrownBy(() -> lookup.artworks(PRINTING, null))
                .isInstanceOfSatisfying(ScryfallClientException.class,
                        exception -> assertThat(exception.kind()).isEqualTo(Kind.UNAVAILABLE));
    }

    @Test
    void limitsArtworkPaginationToThreePagesWithoutFollowingTheFourth() {
        ObjectNode card = card(PRINTING, ORACLE, "Atraxa");
        when(client.card(PRINTING)).thenReturn(card);
        when(client.printings(anyString())).thenReturn(page(List.of(card), "https://api.scryfall.com/cards/search?page=2"));
        when(client.nextPage("https://api.scryfall.com/cards/search?page=2"))
                .thenReturn(page(List.of(card), "https://api.scryfall.com/cards/search?page=3"));
        when(client.nextPage("https://api.scryfall.com/cards/search?page=3"))
                .thenReturn(page(List.of(card), "https://api.scryfall.com/cards/search?page=4"));

        assertThat(lookup.artworks(PRINTING, null)).isEmpty();

        verify(client, times(2)).nextPage(anyString());
        verify(client, never()).nextPage("https://api.scryfall.com/cards/search?page=4");
    }

    @Test
    void rejectsPaginationLoopsAndMissingContinuationMetadata() {
        String next = "https://api.scryfall.com/cards/search?page=2";
        when(client.search(anyString())).thenReturn(page(List.of(), next));
        when(client.nextPage(next)).thenReturn(page(List.of(), next));
        assertThatThrownBy(() -> lookup.searchCommanders("Atraxa"))
                .isInstanceOf(MalformedScryfallResponseException.class);

        ObjectNode malformed = page(List.of());
        malformed.put("has_more", true);
        when(client.search(anyString())).thenReturn(malformed);
        assertThatThrownBy(() -> lookup.searchCommanders("Different"))
                .isInstanceOf(MalformedScryfallResponseException.class);
    }

    @Test
    void aMissingContinuationPageIsAnUpstreamFailureRatherThanUnknownCard() {
        String next = "https://api.scryfall.com/cards/search?page=2";
        when(client.search(anyString())).thenReturn(page(List.of(), next));
        when(client.nextPage(next)).thenThrow(new ScryfallClientException(Kind.NOT_FOUND));

        assertThatThrownBy(() -> lookup.searchCommanders("Atraxa"))
                .isInstanceOf(MalformedScryfallResponseException.class);
    }

    private ObjectNode reversible(UUID firstOracle, UUID secondOracle) {
        ObjectNode card = card(PRINTING, ORACLE, "Commander White // Commander Red");
        card.put("layout", "reversible_card");
        card.remove("oracle_id");
        card.remove("color_identity");
        card.set("card_faces", json.valueToTree(List.of(
                Map.of("oracle_id", firstOracle.toString(), "name", "Commander White",
                        "image_uris", images("front"), "illustration_id", id(300).toString(), "artist", "Front Artist"),
                Map.of("oracle_id", secondOracle.toString(), "name", "Commander Red",
                        "image_uris", images("back"), "illustration_id", id(301).toString(), "artist", "Back Artist"))));
        return card;
    }

    private ObjectNode twoFaced(UUID printing, UUID oracle) {
        ObjectNode card = card(printing, oracle, "Atraxa // Back");
        card.put("layout", "transform");
        card.set("card_faces", json.valueToTree(List.of(
                Map.of("name", "Atraxa", "image_uris", images("front"),
                        "illustration_id", id(300).toString(), "artist", "Front Artist"),
                Map.of("name", "Back", "image_uris", images("back"),
                        "illustration_id", id(301).toString(), "artist", "Back Artist"))));
        return card;
    }

    private ObjectNode card(UUID printing, UUID oracle, String name) {
        ObjectNode card = json.createObjectNode();
        card.put("object", "card");
        card.put("id", printing.toString());
        card.put("oracle_id", oracle.toString());
        card.put("name", name);
        card.put("lang", "en");
        card.put("layout", "normal");
        card.put("type_line", "Legendary Creature — Human");
        card.put("oracle_text", "Vigilance");
        card.put("scryfall_uri", "https://scryfall.com/card/test/1");
        card.set("legalities", json.valueToTree(Map.of("commander", "legal")));
        card.set("color_identity", json.valueToTree(List.of("G", "U", "W", "B")));
        card.set("keywords", json.valueToTree(List.of("Vigilance")));
        return card;
    }

    private ObjectNode page(List<JsonNode> cards) {
        ObjectNode page = json.createObjectNode();
        page.put("object", "list");
        page.put("has_more", false);
        page.set("data", json.valueToTree(cards));
        return page;
    }

    private ObjectNode page(List<JsonNode> cards, String next) {
        ObjectNode page = page(cards);
        page.put("has_more", true);
        page.put("next_page", next);
        return page;
    }

    private static Map<String, String> images(String side) {
        return Map.of("small", "https://cards.scryfall.io/" + side + "-small.jpg",
                "art_crop", "https://cards.scryfall.io/" + side + "-crop.jpg");
    }

    private static UUID id(long suffix) {
        return new UUID(0, suffix);
    }
}
