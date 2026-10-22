package io.github.gandalfthejunior.mtgcommanderstats;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.application.CommanderInput;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;

class CommanderPairsTest extends GameTestSupport {
    private static final String CREATURE = "Legendary Creature — Human";
    private static final String CHOOSE_COLOR = "\nIf %s is your commander, choose a color before the game begins. %s is the chosen color.";

    @ParameterizedTest
    @ValueSource(strings = {"Partner", "Partner with", "Choose a Background", "Doctor's companion", "Friends forever", "Partner—Survivors", "Partner—New label"})
    void legalPairsWorkBothOrdersAndBypassingFiltersCannotSaveInvalidPairs(String mechanic) throws Exception {
        Actor owner = register("owner", "Owner");
        String firstText = mechanic.equals("Partner with") ? "Partner with Second" : mechanic;
        String secondText = mechanic.equals("Partner with") ? "Partner with First" : mechanic;
        String secondType = CREATURE;
        if (mechanic.equals("Choose a Background")) {
            secondType = "Legendary Enchantment — Background";
            secondText = "";
        } else if (mechanic.equals("Doctor's companion")) {
            secondType = "Legendary Creature — Time Lord Doctor";
            secondText = "";
        }
        CommanderInput first = put("First", CREATURE, firstText, List.of("G", "U"), null);
        CommanderInput second = put("Second", secondType, secondText, List.of("W", "U"), null);
        for (List<CommanderInput> pair : List.of(List.of(first, second), List.of(second, first))) {
            JsonNode saved = expect(owner, "POST", "/api/decks", payload(pair), 201);
            assertThat(saved.path("colorIdentity").toString()).isEqualTo("[\"W\",\"U\",\"G\"]");
            assertThat(saved.path("commanders").size()).isEqualTo(2);
            assertThat(saved.path("commanders").get(1).path("position").asInt()).isEqualTo(2);
            provider.offline = true;
            int calls = provider.calls.get();
            JsonNode renamed = expect(owner, "PUT", "/api/decks/" + id(saved), "{\"name\":\"Offline\"}", 200);
            assertThat(renamed.path("commanders")).isEqualTo(saved.path("commanders"));
            expect(owner, "PUT", "/api/decks/" + id(saved), payload(pair), 200);
            assertThat(provider.calls.get()).isEqualTo(calls);
            provider.offline = false;
        }
        CommanderInput invalid = put("Second incompatible", CREATURE, "", List.of(), null);
        List<String> suggestions = names(expect(owner, "GET", "/api/scryfall/commanders?q=Second&partnerOf="
                + first.selectionRef().scryfallCardId(), "", 200));
        assertThat(suggestions).contains("Second").doesNotContain("Second incompatible");
        assertThat(names(expect(owner, "GET", "/api/scryfall/commanders?q=First&partnerOf="
                + second.selectionRef().scryfallCardId(), "", 200))).contains("First");
        expect(owner, "POST", "/api/decks", payload(List.of(first, invalid)), 400);
        expect(owner, "POST", "/api/decks", payload(List.of(first, first)), 400);
        expect(owner, "POST", "/api/decks", payload(List.of(first, second, invalid)), 400);
        JsonNode baseline = expect(owner, "GET", "/api/decks", "", 200).get(0);
        expect(owner, "PUT", "/api/decks/" + id(baseline), payload(List.of(first, invalid)), 400);
        assertThat(expect(owner, "GET", "/api/decks", "", 200).get(0)).isEqualTo(baseline);
        expect(null, "GET", "/api/decks", "", 401);
        expect(null, "POST", "/api/decks", payload(List.of(first, second)), 403);
        expect(new Actor(owner.cookie(), null, owner.id()), "POST", "/api/decks", payload(List.of(first, second)), 403);
        Actor other = register("other", "Other");
        expect(other, "PUT", "/api/decks/" + id(baseline), payload(List.of(first, second)), 403);
    }

    @Test
    void facelessOneCanUseEitherRoleInEitherOrderOrRemainSingle() throws Exception {
        Actor owner = register("owner", "Owner");
        CommanderInput faceless = put("Faceless One", "Legendary Enchantment Creature — Background",
                "Choose a Background" + CHOOSE_COLOR.formatted("Faceless One", "Faceless One"), List.of(), "R");
        CommanderInput renari = put("Renari, Merchant of Marvels", CREATURE, "Choose a Background", List.of("U"), null);
        CommanderInput acolyte = put("Acolyte of Bahamut", "Legendary Enchantment — Background", "", List.of("G"), null);
        expect(owner, "POST", "/api/decks", payload(List.of(acolyte)), 400);
        expect(owner, "POST", "/api/decks", payload(List.of(faceless)), 201);
        for (CommanderInput partner : List.of(renari, acolyte)) {
            for (List<CommanderInput> pair : List.of(List.of(faceless, partner), List.of(partner, faceless))) {
                JsonNode saved = expect(owner, "POST", "/api/decks", payload(pair), 201);
                assertThat(saved.path("colorIdentity").toString()).isEqualTo(partner == renari ? "[\"U\",\"R\"]" : "[\"R\",\"G\"]");
                expect(owner, "POST", "/api/decks", payload(pair.stream().map(input -> input == faceless ? new CommanderInput(input.selectionRef(), null) : input).toList()), 400);
            }
        }
        String route = "/api/scryfall/commanders?q=ar&partnerOf=" + faceless.selectionRef().scryfallCardId();
        assertThat(names(expect(owner, "GET", route, "", 200))).contains("Renari, Merchant of Marvels");
        assertThat(names(expect(owner, "GET", route.replace("q=ar", "q=Bahamut"), "", 200))).contains("Acolyte of Bahamut");
        expect(owner, "GET", route + "&partnerGameplayFaceIndex=0", "", 400);
        expect(owner, "GET", "/api/scryfall/commanders?q=ar&partnerGameplayFaceIndex=0", "", 400);
        provider.offline = true;
        expect(owner, "POST", "/api/decks", payload(List.of(faceless, renari)), 503);
    }

    @ParameterizedTest
    @ValueSource(strings = {"The Prismatic Piper", "Faceless One", "Clara Oswald"})
    void colorChoiceIsIndependentOfPairingAndRequiredPerSlot(String name) throws Exception {
        Actor owner = register("owner", "Owner");
        String role = name.equals("Faceless One") ? "Choose a Background" : name.equals("Clara Oswald") ? "Doctor's companion" : "Partner";
        CommanderInput first = put(name, CREATURE, role + CHOOSE_COLOR.formatted(name, name), List.of("U"), "R");
        CommanderInput partner = role.equals("Choose a Background") ? put("Background", "Legendary Enchantment — Background", "", List.of("G"), null)
                : role.equals("Doctor's companion") ? put("Doctor", "Legendary Creature — Time Lord Doctor", "", List.of("G"), null)
                : put("Another Piper", CREATURE, "Partner" + CHOOSE_COLOR.formatted("Another Piper", "Another Piper"), List.of("G"), "U");
        JsonNode saved = expect(owner, "POST", "/api/decks", payload(List.of(first, partner)), 201);
        assertThat(saved.path("colorIdentity").toString()).isEqualTo("[\"U\",\"R\",\"G\"]");
        for (String choice : List.of("", "C", "WU", "r")) {
            expect(owner, "POST", "/api/decks", payload(List.of(new CommanderInput(first.selectionRef(), choice), partner)), 400);
        }
        expect(owner, "POST", "/api/decks", payload(List.of(new CommanderInput(first.selectionRef(), null), partner)), 400);
        if (partner.chosenColor() != null) {
            expect(owner, "POST", "/api/decks", payload(List.of(first, new CommanderInput(partner.selectionRef(), null))), 400);
        }
    }

    @Test
    void immediatePartnerWithSuggestionMustBeReciprocalAndSingleRemainsLegal() throws Exception {
        Actor owner = register("owner", "Owner");
        CommanderInput first = put("First Named", CREATURE, "Partner with Second Named (Reminder.)", List.of(), null);
        CommanderInput second = put("Second Named", CREATURE, "Partner with First Named (Reminder.)", List.of(), null);
        String route = "/api/scryfall/commanders?partnerOf=" + first.selectionRef().scryfallCardId();
        assertThat(names(expect(owner, "GET", route, "", 200))).containsExactly("Second Named");
        expect(owner, "POST", "/api/decks", payload(List.of(first)), 201);
        JsonNode pair = expect(owner, "POST", "/api/decks", payload(List.of(first, second)), 201);
        assertThat(pair.path("colorIdentity").isEmpty()).isTrue();
        CommanderInput oneWay = put("Second Named", CREATURE, "Partner with Someone Else", List.of(), null);
        expect(owner, "POST", "/api/decks", payload(List.of(first, oneWay)), 400);
    }

    @Test
    void fullPairReplacementCannotChangeOrResetRetainedArtworkAndDuplicatePrintsAreNotDistinctIdentities() throws Exception {
        Actor owner = register("owner", "Owner");
        CommanderInput first = put("First", CREATURE, "Partner", List.of("R"), null);
        CommanderInput second = put("Second", CREATURE, "Partner", List.of("U"), null);
        CommanderInput third = put("Third", CREATURE, "Partner", List.of("G"), null);
        JsonNode saved = expect(owner, "POST", "/api/decks", payload(List.of(first, second)), 201);
        UUID deckId = id(saved);
        jdbc.update("UPDATE deck_commanders SET art_crop_url = ?, artist = ? WHERE deck_id = ? AND position = 1",
                "https://cards.scryfall.io/art_crop/newer.jpg", "Newer artist", deckId);
        JsonNode replaced = expect(owner, "PUT", "/api/decks/" + deckId, payload(List.of(first, third)), 200);
        assertThat(replaced.path("commanders").get(0).path("artist").asText()).isEqualTo("Newer artist");
        assertThat(replaced.path("commanders").get(0).path("artCropUrl").asText()).endsWith("newer.jpg");
        UUID alternateId = UUID.randomUUID();
        ObjectNode alternate = (ObjectNode) provider.card(first.selectionRef().scryfallCardId()).deepCopy();
        alternate.put("id", alternateId.toString());
        CommanderTestProvider.put(alternateId, alternate.toString());
        CommanderInput alternateInput = new CommanderInput(new CommanderSelectionRef(alternateId, null), null);
        expect(owner, "POST", "/api/decks", payload(List.of(first, alternateInput)), 400);
        expect(owner, "PUT", "/api/decks/" + deckId, payload(List.of(alternateInput, second)), 400);
        assertThat(expect(owner, "GET", "/api/decks", "", 200).get(0)).isEqualTo(replaced);
        JsonNode reordered = expect(owner, "PUT", "/api/decks/" + deckId, payload(List.of(third, first)), 200);
        assertThat(reordered.path("commanders").get(1).path("artist").asText()).isEqualTo("Newer artist");
        expect(owner, "PUT", "/api/decks/" + deckId, payload(List.of(third)), 200);
        expect(owner, "PUT", "/api/decks/" + deckId, payload(List.of(first, second)), 200);
    }

    private CommanderInput put(String name, String type, String text, List<String> colors, String chosenColor) {
        UUID print = UUID.randomUUID();
        ObjectNode card = json.createObjectNode();
        card.put("object", "card").put("id", print.toString()).put("oracle_id", UUID.randomUUID().toString())
                .put("name", name).put("layout", "normal").put("lang", "en").put("type_line", type).put("oracle_text", text);
        card.putObject("legalities").put("commander", "legal");
        card.set("color_identity", json.valueToTree(colors));
        CommanderTestProvider.put(print, card.toString());
        return new CommanderInput(new CommanderSelectionRef(print, null), chosenColor);
    }

    private List<String> names(JsonNode choices) {
        List<String> names = new ArrayList<>();
        for (JsonNode choice : choices) {
            names.add(choice.path("name").asText());
        }
        return names;
    }

    private String payload(List<CommanderInput> inputs) {
        return json.writeValueAsString(Map.of("name", "Pair", "commanders", inputs));
    }
}
