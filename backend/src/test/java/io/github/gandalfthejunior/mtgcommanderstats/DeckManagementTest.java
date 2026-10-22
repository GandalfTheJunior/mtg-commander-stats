package io.github.gandalfthejunior.mtgcommanderstats;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.application.CommanderInput;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataIntegrityViolationException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DeckManagementTest extends GameTestSupport {
    @Test
    void createsAuthoritativeSnapshotsAndListsOnlyOwnedDecks() throws Exception {
        Actor alice = register("alice", "Alice");
        Actor bob = register("bob", "Bob");
        JsonNode created = expect(alice, "POST", "/api/decks", deckBody("\u00a0 Atraxa  SUPERFRIENDS \u202f", "Atraxa", List.of("G", "W", "B", "U")), 201);
        assertThat(created.size()).isEqualTo(6);
        assertThat(created.path("name").asText()).isEqualTo("Atraxa  SUPERFRIENDS");
        assertThat(created.path("colorIdentity").toString()).isEqualTo("[\"W\",\"U\",\"B\",\"G\"]");
        JsonNode commander = created.path("commanders").get(0);
        assertThat(commander.path("name").asText()).isEqualTo("Atraxa");
        assertThat(commander.path("oracleId").asText()).isNotEqualTo(commander.path("scryfallCardId").asText());
        assertThat(commander.path("position").asInt()).isEqualTo(1);
        assertThat(commander.path("artCropUrl").isNull()).isTrue();
        assertThat(commander.path("chosenColor").isNull()).isTrue();
        assertThat(commander.path("canBeSoleCommander").asBoolean()).isTrue();
        assertThat(created.toString()).doesNotContain("owner", "password", "email");
        expect(alice, "POST", "/api/decks", deckBody("Atraxa  SUPERFRIENDS", "Karn", List.of()), 201);
        UUID bobDeck = deck(bob);
        assertThat(expect(alice, "GET", "/api/decks", "", 200).size()).isEqualTo(2);
        assertThat(decks.findById(id(created)).orElseThrow().getOwnerId()).isEqualTo(alice.id());
        expect(alice, "PUT", "/api/decks/" + bobDeck, "{\"name\":\"Stolen\"}", 403);
        expect(alice, "DELETE", "/api/decks/" + bobDeck, "", 403);
        expect(alice, "PUT", "/api/decks/" + UUID.randomUUID(), "{\"name\":\"Missing\"}", 404);
        expect(alice, "DELETE", "/api/decks/" + UUID.randomUUID(), "", 404);
        expect(alice, "DELETE", "/api/decks/" + id(created), "", 204);
        assertThat(decks.findById(id(created))).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"name\":null}", "{\"name\":\"\u00a0\u2007\u202f\u0085\"}",
            "{\"name\":\"Deck\"}", "{\"name\":\"Deck\",\"commanders\":[]}",
            "{\"name\":\"Deck\",\"commanders\":[null]}",
            "{\"name\":\"Deck\",\"commander\":\"Karn\",\"colorIdentity\":[]}",
            "{\"name\":\"Deck\",\"commanders\":[{\"selectionRef\":null}]}",
            "{\"name\":\"Deck\",\"commanders\":[{\"selectionRef\":{\"scryfallCardId\":\"bad\"}}]}"})
    void rejectsMissingInvalidAndLegacyInputWithoutPartialWrites(String body) throws Exception {
        Actor alice = register("alice", "Alice");
        expect(alice, "POST", "/api/decks", body, 400);
        assertThat(decks.count()).isZero();
    }

    @Test
    void rejectsClientMetadataAndTwoCommanderWrites() throws Exception {
        Actor alice = register("alice", "Alice");
        ObjectNode body = (ObjectNode) json.readTree(deckBody("Deck", "Karn", List.of()));
        for (String field : List.of("ownerId", "oracleId", "colorIdentity", "everUsed", "artCropUrl")) {
            ObjectNode spoofed = body.deepCopy();
            spoofed.put(field, "untrusted");
            expect(alice, "POST", "/api/decks", spoofed.toString(), 400);
        }
        ObjectNode untrustedCard = body.deepCopy();
        ((ObjectNode) untrustedCard.get("commanders").get(0)).put("requiresChosenColor", true);
        expect(alice, "POST", "/api/decks", untrustedCard.toString(), 400);
        List<CommanderInput> inputs = CommanderTestProvider.inputs("Karn", List.of());
        expect(alice, "POST", "/api/decks", json.writeValueAsString(Map.of("name", "Pair", "commanders", List.of(inputs.getFirst(), inputs.getFirst()))), 400);
        assertThat(decks.count()).isZero();
    }

    @Test
    void colorlessMulticolorReplacementOfflineRenameAndPrintingBoundary() throws Exception {
        Actor alice = register("alice", "Alice");
        JsonNode created = expect(alice, "POST", "/api/decks", deckBody("Deck", "Karn", List.of()), 201);
        String path = "/api/decks/" + id(created);
        assertThat(created.get("colorIdentity").isEmpty()).isTrue();
        JsonNode replacement = expect(alice, "PUT", path, deckBody("New", "Kenrith", List.of("G", "R", "B", "U", "W")), 200);
        assertThat(replacement.get("colorIdentity").toString()).isEqualTo("[\"W\",\"U\",\"B\",\"R\",\"G\"]");
        int calls = provider.calls.get();
        provider.offline = true;
        JsonNode renamed = expect(alice, "PUT", path, "{\"name\":\"Offline\"}", 200);
        assertThat(renamed.get("commanders")).isEqualTo(replacement.get("commanders"));
        assertThat(provider.calls.get()).isEqualTo(calls);
        expect(alice, "GET", "/api/decks", "", 200);
        expect(alice, "POST", "/api/decks", deckBody("Offline creation", "Kenrith", List.of("W")), 503);
        provider.offline = false;
        // A different printing of the same gameplay card cannot be selected through the full PUT.
        expect(alice, "PUT", path, deckBody("Art attempt", "Kenrith", List.of("W", "U", "B", "R", "G")), 400);
        assertThat(expect(alice, "GET", "/api/decks", "", 200).get(0).get("commanders")).isEqualTo(replacement.get("commanders"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"The Prismatic Piper", "Faceless One", "Clara Oswald", "Unseen Test Commander"})
    void validatesChosenColorsDerivesUnionAndKeepsChoiceOffline(String name) throws Exception {
        Actor alice = register("alice", "Alice");
        CommanderInput input = special(name);
        for (String choice : List.of("", "C", "WU", "r")) {
            expect(alice, "POST", "/api/decks", choiceBody("Deck", input.selectionRef(), choice), 400);
        }
        expect(alice, "POST", "/api/decks", json.writeValueAsString(Map.of("name", "Deck", "commanders", List.of(input))), 400);
        JsonNode saved = expect(alice, "POST", "/api/decks", choiceBody("Deck", input.selectionRef(), "R"), 201);
        assertThat(saved.get("colorIdentity").toString()).isEqualTo("[\"U\",\"R\"]");
        assertThat(saved.get("commanders").get(0).get("chosenColor").asText()).isEqualTo("R");
        JsonNode changed = expect(alice, "PUT", "/api/decks/" + id(saved), choiceBody("Deck", input.selectionRef(), "U"), 200);
        assertThat(changed.get("colorIdentity").toString()).isEqualTo("[\"U\"]");
        provider.offline = true;
        JsonNode renamed = expect(alice, "PUT", "/api/decks/" + id(saved), "{\"name\":\"Renamed\"}", 200);
        assertThat(renamed.get("commanders")).isEqualTo(changed.get("commanders"));
    }

    @Test
    void locksChosenColorPermanentlyIncludingArchiveAndGameDeletion() throws Exception {
        Fixture f = fixture();
        CommanderInput input = special("The Prismatic Piper");
        String path = "/api/decks/" + f.creatorDeck();
        JsonNode before = expect(f.creator(), "PUT", path, choiceBody("Piper", input.selectionRef(), "R"), 200);
        JsonNode game = expect(f.owner(), "POST", f.path(), body(f), 201);
        provider.offline = true;
        int callsBeforeReads = provider.calls.get();
        expect(f.owner(), "GET", f.path(), "", 200);
        expect(f.owner(), "GET", f.path() + "/" + id(game), "", 200);
        expect(f.owner(), "GET", f.selection(f.creator().id()), "", 200);
        expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", 200);
        assertThat(provider.calls.get()).isEqualTo(callsBeforeReads);
        provider.offline = false;
        expect(f.owner(), "DELETE", f.path() + "/" + id(game), "", 204);
        expect(f.creator(), "PUT", path, choiceBody("Illegal", input.selectionRef(), "G"), 409);
        expect(f.creator(), "DELETE", path, "", 409);
        expect(f.creator(), "POST", path + "/archive", "", 200);
        provider.offline = true;
        JsonNode renamed = expect(f.creator(), "PUT", path, "{\"name\":\"Archived offline\"}", 200);
        assertThat(renamed.get("everUsed").asBoolean()).isTrue();
        assertThat(renamed.get("archived").asBoolean()).isTrue();
        assertThat(renamed.get("commanders")).isEqualTo(before.get("commanders"));
    }

    @Test
    void rejectsUnexpectedColorInapplicableFaceAndPartnerRequiredCommander() throws Exception {
        Actor alice = register("alice", "Alice");
        CommanderInput ordinary = CommanderTestProvider.inputs("Karn", List.of()).getFirst();
        expect(alice, "POST", "/api/decks", choiceBody("Wrong choice", ordinary.selectionRef(), "R"), 400);
        expect(alice, "POST", "/api/decks", choiceBody("Wrong face", new CommanderSelectionRef(ordinary.selectionRef().scryfallCardId(), 0), null), 400);
        UUID backgroundId = UUID.randomUUID();
        CommanderTestProvider.put(backgroundId, rawCard(backgroundId, UUID.randomUUID(), "Background", "Legendary Enchantment — Background", "", "[]"));
        expect(alice, "POST", "/api/decks", choiceBody("Alone", new CommanderSelectionRef(backgroundId, null), null), 400);
        assertThat(decks.count()).isZero();
    }

    @Test
    void snapshotsFaceLocalArtworkAndRejectsMissingGameplayIdentity() throws Exception {
        Actor alice = register("alice", "Alice");
        UUID print = UUID.randomUUID();
        UUID oracle = UUID.randomUUID();
        String raw = rawCard(print, oracle, "Front // Back", "Legendary Creature — Test", "", "[\"W\",\"B\"]");
        ObjectNode card = (ObjectNode) json.readTree(raw);
        card.put("layout", "transform");
        card.put("scryfall_uri", "https://scryfall.com/card/test");
        card.set("card_faces", json.readTree("""
                [{"name":"Front"},{"name":"Back","image_uris":{"art_crop":"https://cards.scryfall.io/art_crop/back.jpg"},
                  "artist":"Back Artist","illustration_id":"00000000-0000-4000-8000-000000000009"}]
                """));
        CommanderTestProvider.put(print, card.toString());
        JsonNode saved = expect(alice, "POST", "/api/decks", choiceBody("DFC", new CommanderSelectionRef(print, null), null), 201);
        JsonNode snapshot = saved.get("commanders").get(0);
        assertThat(snapshot.get("artworkFaceIndex").asInt()).isEqualTo(1);
        assertThat(snapshot.get("artist").asText()).isEqualTo("Back Artist");
        assertThat(snapshot.get("oracleId").asText()).isEqualTo(oracle.toString());
        assertThat(snapshot.get("selectionRef").has("gameplayFaceIndex")).isFalse();
        provider.offline = true;
        assertThat(expect(alice, "GET", "/api/decks", "", 200).get(0).get("commanders")).isEqualTo(saved.get("commanders"));
        provider.offline = false;
        card.remove("oracle_id");
        CommanderTestProvider.put(print, card.toString());
        expect(alice, "POST", "/api/decks", choiceBody("Unknown", new CommanderSelectionRef(print, null), null), 400);
    }

    @Test
    void databaseProtectsPositionsIdentityColorsAndOwnership() throws Exception {
        Actor alice = register("alice", "Alice");
        UUID deckId = deck(alice);
        for (String update : List.of("position = 0", "position = 3", "chosen_color = 'C'", "chosen_color = 'R'", "base_color_identity = 'UW'", "name = '   '")) {
            assertThatThrownBy(() -> jdbc.update("UPDATE deck_commanders SET " + update + " WHERE deck_id = ?", deckId)).isInstanceOf(DataIntegrityViolationException.class);
        }
        assertThatThrownBy(() -> jdbc.update("UPDATE decks SET owner_id = ? WHERE id = ?", UUID.randomUUID(), deckId)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE decks SET name = '   ' WHERE id = ?", deckId)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE decks SET color_identity = 'WW' WHERE id = ?", deckId)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO deck_commanders SELECT deck_id, 2, oracle_id, name, gameplay_face_index, base_color_identity, requires_chosen_color, can_be_sole_commander, chosen_color, scryfall_card_id, artwork_face_index, art_crop_url, illustration_id, artist, scryfall_uri FROM deck_commanders WHERE deck_id = ?", deckId)).isInstanceOf(DataIntegrityViolationException.class);
        jdbc.update("INSERT INTO deck_commanders SELECT deck_id, 2, ?, 'Second', gameplay_face_index, base_color_identity, requires_chosen_color, can_be_sole_commander, chosen_color, scryfall_card_id, artwork_face_index, art_crop_url, illustration_id, artist, scryfall_uri FROM deck_commanders WHERE deck_id = ? AND position = 1", UUID.randomUUID(), deckId);
        JsonNode dualReady = expect(alice, "GET", "/api/decks", "", 200).get(0).get("commanders");
        assertThat(dualReady.size()).isEqualTo(2);
        assertThat(dualReady.get(0).get("position").asInt()).isEqualTo(1);
        assertThat(dualReady.get(1).get("position").asInt()).isEqualTo(2);
        expect(alice, "PUT", "/api/decks/" + deckId, "{\"name\":\"Invalid\",\"commanders\":null}", 400);

    }

    @Test
    void authenticationCsrfAndOwnershipGuardAllDeckOperations() throws Exception {
        Actor owner = register("owner", "Owner");
        UUID deckId = deck(owner);
        String path = "/api/decks/" + deckId;
        String payload = deckBody("Deck", "Karn", List.of());
        expect(null, "GET", "/api/decks", "", 401);
        for (String method : List.of("POST", "PUT", "DELETE")) {
            String route = method.equals("POST") ? "/api/decks" : path;
            expect(null, method, route, payload, 403);
            expect(new Actor(owner.cookie(), null, owner.id()), method, route, payload, 403);
            expect(new Actor(owner.cookie(), "invalid", owner.id()), method, route, payload, 403);
        }
        expect(new Actor(owner.cookie(), null, owner.id()), "POST", path + "/archive", "", 403);
        Actor other = register("other", "Other");
        expect(other, "POST", path + "/archive", "", 403);
        assertThat(decks.findById(deckId)).isPresent();
    }

    @Test
    void reversibleGameplayFaceIdentityIsIndependentFromItsPrintingAndArtwork() throws Exception {
        Actor alice = register("alice", "Alice");
        UUID printing = UUID.randomUUID();
        UUID firstIdentity = UUID.randomUUID();
        UUID secondIdentity = UUID.randomUUID();
        ObjectNode first = (ObjectNode) json.readTree(rawCard(UUID.randomUUID(), firstIdentity, "First Commander", "Legendary Creature — Test", "", "[\"W\"]"));
        ObjectNode second = (ObjectNode) json.readTree(rawCard(UUID.randomUUID(), secondIdentity, "Second Commander", "Legendary Creature — Test", "", "[\"R\"]"));
        CommanderTestProvider.put(UUID.fromString(first.get("id").asText()), first.toString());
        CommanderTestProvider.put(UUID.fromString(second.get("id").asText()), second.toString());
        first.set("image_uris", json.readTree("{\"art_crop\":\"https://cards.scryfall.io/art_crop/first.jpg\"}"));
        second.set("image_uris", json.readTree("{\"art_crop\":\"https://cards.scryfall.io/art_crop/second.jpg\"}"));
        ObjectNode reversible = (ObjectNode) json.readTree(rawCard(printing, firstIdentity, "First // Second", "Legendary Creature — Test", "", "[]"));
        reversible.remove("oracle_id");
        reversible.put("layout", "reversible_card");
        reversible.set("card_faces", json.valueToTree(List.of(first, second)));
        CommanderTestProvider.put(printing, reversible.toString());
        for (Integer face : new Integer[] {null, -1, 2}) {
            expect(alice, "POST", "/api/decks", choiceBody("Ambiguous", new CommanderSelectionRef(printing, face), null), 400);
        }
        JsonNode saved = expect(alice, "POST", "/api/decks", choiceBody("Second", new CommanderSelectionRef(printing, 1), null), 201);
        JsonNode snapshot = saved.get("commanders").get(0);
        assertThat(snapshot.get("oracleId").asText()).isEqualTo(secondIdentity.toString());
        assertThat(snapshot.get("name").asText()).isEqualTo("Second Commander");
        assertThat(snapshot.get("selectionRef").get("gameplayFaceIndex").asInt()).isEqualTo(1);
        assertThat(snapshot.get("artworkFaceIndex").asInt()).isEqualTo(1);
        assertThat(saved.get("colorIdentity").toString()).isEqualTo("[\"R\"]");
        provider.offline = true;
        assertThat(expect(alice, "GET", "/api/decks", "", 200).get(0).get("commanders")).isEqualTo(saved.get("commanders"));
    }

    private CommanderInput special(String name) {
        UUID print = UUID.randomUUID();
        CommanderTestProvider.put(print, rawCard(print, UUID.randomUUID(), name, "Legendary Creature — Test",
                "If " + name + " is your commander, choose a color before the game begins. " + name + " is the chosen color.", "[\"U\"]"));
        return new CommanderInput(new CommanderSelectionRef(print, null), null);
    }

    private String rawCard(UUID print, UUID oracle, String name, String type, String text, String colors) {
        return """
                {"object":"card","id":"%s","oracle_id":"%s","name":"%s","lang":"en","layout":"normal",
                 "legalities":{"commander":"legal"},"type_line":"%s","oracle_text":"%s","color_identity":%s}
                """.formatted(print, oracle, name, type, text, colors);
    }

    private String choiceBody(String name, CommanderSelectionRef reference, String color) {
        return json.writeValueAsString(Map.of("name", name, "commanders", List.of(new CommanderInput(reference, color))));
    }
}
