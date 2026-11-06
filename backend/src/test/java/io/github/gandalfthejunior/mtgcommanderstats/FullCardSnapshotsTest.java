package io.github.gandalfthejunior.mtgcommanderstats;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;

class FullCardSnapshotsTest extends GameTestSupport {
    @Test
    void createAndReplacePersistBothSnapshotsAndAllAuthorizedReadsStayOffline() throws Exception {
        Fixture f = fixture();
        ObjectNode commander = card("Commander", false);
        ObjectNode companion = card("Companion", true);
        JsonNode created = expect(f.creator(), "POST", "/api/decks", configuration(commander, companion), 201);
        assertFaces(created, commander, companion);
        ObjectNode replacement = card("Replacement", false);
        ObjectNode replacementCompanion = card("Replacement Companion", true);
        JsonNode updated = expect(f.creator(), "PUT", "/api/decks/" + f.creatorDeck(),
                configuration(replacement, replacementCompanion), 200);
        assertFaces(updated, replacement, replacementCompanion);
        JsonNode game = expect(f.owner(), "POST", f.path(), body(f), 201);

        provider.offline = true;
        int calls = provider.calls.get();
        JsonNode own = expect(f.creator(), "GET", "/api/decks", "", 200).valueStream()
                .filter(deck -> id(deck).equals(f.creatorDeck())).findFirst().orElseThrow();
        assertFaces(own, replacement, replacementCompanion);
        JsonNode memberDeck = expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/members/" + f.creator().id() + "/decks", "", 200)
                .valueStream().filter(deck -> id(deck).equals(f.creatorDeck())).findFirst().orElseThrow();
        assertFaces(memberDeck, replacement, replacementCompanion);
        JsonNode details = expect(f.owner(), "GET", f.path() + "/" + id(game), "", 200);
        JsonNode participant = details.path("participants").valueStream()
                .filter(person -> person.path("deckId").asText().equals(f.creatorDeck().toString())).findFirst().orElseThrow();
        assertFaces(participant.path("deck"), replacement, replacementCompanion);
        expect(f.outsider(), "GET", f.path() + "/" + id(game), "", 403);
        assertThat(provider.calls.get()).isEqualTo(calls);
        assertThat(jdbc.queryForObject("select card_faces from deck_commanders where deck_id = ?", String.class, f.creatorDeck()))
                .contains("Replacement", "normal/");
        assertThat(jdbc.queryForObject("select card_faces from deck_companions where deck_id = ?", String.class, f.creatorDeck()))
                .contains("Replacement Companion", "Companion rules");
    }

    @Test
    void artworkWritesReplaceAllFacesWithTheSelectedPrintingWithoutChangingGameplay() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode commander = card("Front // Back", false);
        commander.put("layout", "transform");
        commander.remove("image_uris");
        ObjectNode front = card("Front", false);
        ObjectNode back = card("Back", false);
        back.put("type_line", "Land");
        commander.set("card_faces", json.valueToTree(List.of(front, back)));
        ObjectNode companion = card("Companion", true);
        JsonNode initial = expect(owner, "POST", "/api/decks", configuration(commander, companion), 201);
        assertThat(initial.path("commanders").get(0).path("cardFaces").size()).isEqualTo(2);
        ObjectNode alternate = commander.deepCopy();
        alternate.put("id", UUID.randomUUID().toString());
        ((ObjectNode) alternate.path("card_faces").get(1).path("image_uris"))
                .put("normal", "https://cards.scryfall.io/normal/alternate-back.jpg");
        store(alternate);
        String path = "/api/decks/" + id(initial);
        JsonNode changed = expect(owner, "PUT", path + "/commanders/1/artwork",
                json.writeValueAsString(Map.of("scryfallCardId", alternate.path("id").asText(), "artworkFaceIndex", 1)), 200);
        JsonNode slot = changed.path("commanders").get(0);
        assertThat(slot.path("oracleId")).isEqualTo(initial.path("commanders").get(0).path("oracleId"));
        assertThat(slot.path("scryfallCardId")).isEqualTo(alternate.path("id"));
        assertThat(slot.path("artworkFaceIndex").asInt()).isEqualTo(1);
        assertThat(slot.path("cardFaces").get(0).path("faceIndex").asInt()).isZero();
        assertThat(slot.path("cardFaces").get(1).path("faceIndex").asInt()).isEqualTo(1);
        assertThat(slot.path("cardFaces").get(1).path("typeLine").asText()).isEqualTo("Land");
        assertThat(slot.path("cardFaces").get(1).path("imageUrl").asText()).endsWith("alternate-back.jpg");
        ObjectNode alternateCompanion = companion.deepCopy();
        alternateCompanion.put("id", UUID.randomUUID().toString());
        alternateCompanion.withObject("image_uris").put("normal", "https://cards.scryfall.io/normal/alternate-companion.jpg");
        store(alternateCompanion);
        JsonNode companionChanged = expect(owner, "PUT", path + "/companion/artwork",
                json.writeValueAsString(Map.of("scryfallCardId", alternateCompanion.path("id").asText())), 200);
        assertFaces(companionChanged, null, alternateCompanion);
        assertThat(companionChanged.path("commanders")).isEqualTo(changed.path("commanders"));
        provider.offline = true;
        int calls = provider.calls.get();
        assertThat(expect(owner, "GET", "/api/decks", "", 200).get(0)).isEqualTo(companionChanged);
        assertThat(provider.calls.get()).isEqualTo(calls);
    }

    @Test
    void legacyNullSnapshotsSurviveOfflineRenamesAndRefreshOnArtworkSave() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode commander = card("Commander", false);
        ObjectNode companion = card("Companion", true);
        JsonNode created = expect(owner, "POST", "/api/decks", configuration(commander, companion), 201);
        UUID deck = id(created);
        jdbc.update("update deck_commanders set card_faces = null where deck_id = ?", deck);
        jdbc.update("update deck_companions set card_faces = null where deck_id = ?", deck);
        provider.offline = true;
        int calls = provider.calls.get();
        JsonNode legacy = expect(owner, "PUT", "/api/decks/" + deck, "{\"name\":\"Renamed\"}", 200);
        assertThat(legacy.path("commanders").get(0).path("cardFaces").isNull()).isTrue();
        assertThat(legacy.path("companion").path("cardFaces").isNull()).isTrue();
        assertThat(provider.calls.get()).isEqualTo(calls);
        provider.offline = false;
        expect(owner, "PUT", "/api/decks/" + deck + "/commanders/1/artwork",
                json.writeValueAsString(Map.of("scryfallCardId", commander.path("id").asText())), 200);
        JsonNode refreshed = expect(owner, "PUT", "/api/decks/" + deck + "/companion/artwork",
                json.writeValueAsString(Map.of("scryfallCardId", companion.path("id").asText())), 200);
        assertFaces(refreshed, commander, companion);
    }

    private void assertFaces(JsonNode deck, ObjectNode commander, ObjectNode companion) {
        if (commander != null) assertFace(deck.path("commanders").get(0).path("cardFaces").get(0), commander);
        assertFace(deck.path("companion").path("cardFaces").get(0), companion);
    }

    private void assertFace(JsonNode face, ObjectNode source) {
        assertThat(face.path("name")).isEqualTo(source.path("name"));
        assertThat(face.path("faceIndex").isNull()).isTrue();
        assertThat(face.path("typeLine")).isEqualTo(source.path("type_line"));
        assertThat(face.path("oracleText")).isEqualTo(source.path("oracle_text"));
        assertThat(face.path("imageUrl")).isEqualTo(source.path("image_uris").path("normal"));
    }

    private String configuration(ObjectNode commander, ObjectNode companion) {
        store(commander);
        store(companion);
        return json.writeValueAsString(Map.of("name", "Full cards", "commanders", List.of(selection(commander)), "companion", selection(companion)));
    }

    private Map<String, Object> selection(ObjectNode card) {
        return Map.of("selectionRef", Map.of("scryfallCardId", card.path("id").asText()));
    }

    private void store(ObjectNode card) {
        CommanderTestProvider.put(UUID.fromString(card.path("id").asText()), card.toString());
    }

    private ObjectNode card(String name, boolean companion) {
        ObjectNode card = json.createObjectNode().put("object", "card").put("id", UUID.randomUUID().toString())
                .put("oracle_id", UUID.randomUUID().toString()).put("name", name).put("layout", "normal")
                .put("type_line", "Legendary Creature — Test").put("oracle_text", companion ? "Companion rules" : "Vigilance\nDraw a card.");
        card.putArray("color_identity");
        card.putArray("keywords").add(companion ? "Companion" : "Vigilance");
        card.putObject("legalities").put("commander", "legal");
        card.putObject("image_uris").put("small", "https://cards.scryfall.io/small/test.jpg")
                .put("normal", "https://cards.scryfall.io/normal/" + card.path("id").asText() + ".jpg")
                .put("art_crop", "https://cards.scryfall.io/art_crop/test.jpg");
        return card;
    }
}
