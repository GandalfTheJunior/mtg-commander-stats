package io.github.gandalfthejunior.mtgcommanderstats;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import io.github.gandalfthejunior.mtgcommanderstats.deck.application.CommanderInput;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameResult;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

class CommanderArtworkTest extends GameTestSupport {
    @ParameterizedTest
    @ValueSource(strings = {"transform", "modal_dfc"})
    void bothSidesArePresentationOnlyAndSelectorsAreOriginalPrintingIndices(String layout) throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode card = card("Front // Back", "");
        card.put("layout", layout);
        card.remove("image_uris");
        card.set("card_faces", json.valueToTree(List.of(face("Front"), face("Back"))));
        UUID printing = store(card);
        JsonNode initial = create(owner, List.of(input(printing, null)));
        String path = artworkPath(id(initial), 1);
        String payload = payload(printing, 1);
        JsonNode updated = expect(owner, "PUT", path, payload, 200);
        assertPresentationOnly(initial, updated, 1);
        assertThat(updated.path("commanders").get(0).path("artist").asText()).isEqualTo("Back artist");
        assertThat(updated.path("commanders").get(0).path("artworkFaceIndex").asInt()).isEqualTo(1);
        assertThat(updated.path("commanders").get(0).path("selectionRef")).isEqualTo(initial.path("commanders").get(0).path("selectionRef"));
        for (String invalid : List.of(payload(printing, null), payload(printing, -1), payload(printing, 2),
                "{\"scryfallCardId\":\"" + printing + "\",\"artworkFaceIndex\":null}",
                "{\"scryfallCardId\":\"" + printing + "\",\"artworkFaceIndex\":\"1\"}",
                "{\"scryfallCardId\":\"" + printing + "\",\"artworkFaceIndex\":1.0}",
                "{\"scryfallCardId\":\"" + printing + "\",\"artworkFaceIndex\":true}",
                "{\"scryfallCardId\":\"" + printing + "\",\"artworkFaceIndex\":999999999999}")) {
            expect(owner, "PUT", path, invalid, 400);
            assertThat(read(owner, id(initial))).isEqualTo(updated);
        }
        JsonNode front = expect(owner, "PUT", path, payload(printing, 0), 200);
        assertThat(front.path("commanders").get(0).path("artist").asText()).isEqualTo("Front artist");
        ((ObjectNode) card.path("card_faces").get(0)).remove("image_uris");
        store(card);
        JsonNode onlyBack = expect(owner, "PUT", path, payload(printing, null), 200);
        assertThat(onlyBack.path("commanders").get(0).path("artworkFaceIndex").asInt()).isEqualTo(1);
        expect(owner, "PUT", path, payload(printing, 0), 400);
        expect(owner, "PUT", path, payload(printing, 1), 200);
        ((ObjectNode) card.path("card_faces").get(1)).remove("image_uris");
        store(card);
        expect(owner, "PUT", path, payload(printing, null), 400);
        assertThat(read(owner, id(initial))).isEqualTo(onlyBack);
        assertThat(create(owner, List.of(input(printing, null))).path("commanders").get(0).path("artCropUrl").isNull()).isTrue();
    }

    @Test
    void printingValidationSecurityOutageAndNullableAttributionAreAtomic() throws Exception {
        Actor owner = register("owner", "Owner");
        Actor other = register("other", "Other");
        ObjectNode original = card("Commander", "");
        UUID printing = store(original);
        JsonNode initial = create(owner, List.of(input(printing, null)));
        String path = artworkPath(id(initial), 1);
        ObjectNode alternate = original.deepCopy();
        UUID alternative = UUID.randomUUID();
        alternate.put("id", alternative.toString()).put("artist", "New artist")
                .put("illustration_id", UUID.randomUUID().toString()).put("scryfall_uri", "https://scryfall.com/card/new-print");
        alternate.putObject("image_uris").put("art_crop", "https://cards.scryfall.io/art_crop/new.jpg");
        store(alternate);
        String body = payload(alternative, null);
        expect(other, "PUT", path, body, 403);
        expect(null, "PUT", path, body, 403);
        expect(new Actor(owner.cookie(), null, owner.id()), "PUT", path, body, 403);
        expect(new Actor(owner.cookie(), "invalid", owner.id()), "PUT", path, body, 403);
        expect(owner, "PUT", artworkPath(UUID.randomUUID(), 1), body, 404);
        expect(owner, "PUT", artworkPath(id(initial), 2), body, 404);
        expect(owner, "PUT", artworkPath(id(initial), 0), body, 400);
        for (String invalid : List.of("{}", "{\"scryfallCardId\":null}", "{\"scryfallCardId\":\"bad\"}",
                payload(alternative, 0), body.replace("}", ",\"artCropUrl\":\"https://evil.test/art.jpg\"}"),
                body.replace("}", ",\"artist\":\"Fake\"}"))) {
            expect(owner, "PUT", path, invalid, 400);
        }
        UUID wrong = store(card("Different Commander", ""));
        expect(owner, "PUT", path, payload(wrong, null), 400);
        provider.offline = true;
        JsonNode failure = expect(owner, "PUT", path, body, 503);
        assertThat(failure.path("code").asText()).isEqualTo("SCRYFALL_UNAVAILABLE");
        assertThat(read(owner, id(initial))).isEqualTo(initial);
        provider.offline = false;
        JsonNode updated = expect(owner, "PUT", path, body, 200);
        assertPresentationOnly(initial, updated, 1);
        assertThat(updated.path("commanders").get(0).path("artist").asText()).isEqualTo("New artist");
        assertThat(updated.path("commanders").get(0).path("illustrationId")).isEqualTo(alternate.path("illustration_id"));
        assertThat(updated.path("commanders").get(0).path("scryfallUri").asText()).isEqualTo("https://scryfall.com/card/new-print");
        alternate.remove(List.of("artist", "illustration_id", "scryfall_uri"));
        store(alternate);
        JsonNode noAttribution = expect(owner, "PUT", path, body, 200);
        for (String field : List.of("artist", "illustrationId", "scryfallUri")) {
            assertThat(noAttribution.path("commanders").get(0).path(field).isNull()).isTrue();
        }
        provider.offline = true;
        int calls = provider.calls.get();
        assertThat(read(owner, id(initial))).isEqualTo(noAttribution);
        assertThat(provider.calls.get()).isEqualTo(calls);
    }

    @Test
    void reversiblePrintingFindsPersistedOracleFaceIndependentlyOfDisplayFaceAndOrientation() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode first = card("First Commander", "");
        ObjectNode second = card("Second Commander", "");
        store(first); store(second);
        ObjectNode reversible = first.deepCopy();
        reversible.put("id", UUID.randomUUID().toString()).put("layout", "reversible_card");
        reversible.remove(List.of("oracle_id", "image_uris"));
        reversible.set("card_faces", json.valueToTree(List.of(first, second)));
        UUID printing = store(reversible);
        CommanderInput selection = new CommanderInput(new CommanderSelectionRef(printing, 1), null);
        JsonNode initial = create(owner, List.of(selection));
        ObjectNode otherPrinting = reversible.deepCopy();
        otherPrinting.put("id", UUID.randomUUID().toString());
        otherPrinting.set("card_faces", json.valueToTree(List.of(second, first)));
        UUID alternate = store(otherPrinting);
        JsonNode updated = expect(owner, "PUT", artworkPath(id(initial), 1), payload(alternate, 1), 200);
        assertPresentationOnly(initial, updated, 1);
        JsonNode slot = updated.path("commanders").get(0);
        assertThat(slot.path("oracleId").asText()).isEqualTo(second.path("oracle_id").asText());
        assertThat(slot.path("selectionRef").path("gameplayFaceIndex").asInt()).isZero();
        assertThat(slot.path("artworkFaceIndex").asInt()).isEqualTo(1);
        assertThat(slot.path("artist").asText()).isEqualTo(first.path("artist").asText());
        JsonNode details = expect(owner, "GET", "/api/scryfall/cards/" + alternate, "", 200);
        assertThat(details.path("gameplayCards").get(0).path("oracleId")).isEqualTo(slot.path("oracleId"));
        // Same top-level printed name/identity is insufficient when its selected face is absent.
        otherPrinting.set("card_faces", json.valueToTree(List.of(first, first)));
        otherPrinting.put("oracle_id", second.path("oracle_id").asText());
        store(otherPrinting);
        expect(owner, "PUT", artworkPath(id(initial), 1), payload(alternate, 1), 400);
        assertThat(read(owner, id(initial))).isEqualTo(updated);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void usedArchivedDecksKeepBothChoicesIdentityLifecycleAndHistoricalReferences(boolean dual) throws Exception {
        Fixture f = fixture();
        List<CommanderInput> inputs = colorPartners(dual);
        String path = "/api/decks/" + f.creatorDeck();
        expect(f.creator(), "PUT", path, json.writeValueAsString(Map.of("name", "Colors", "commanders", inputs)), 200);
        JsonNode game = expect(f.owner(), "POST", f.path(), body(f), 201);
        for (boolean archived : List.of(false, true)) {
            if (archived) expect(f.creator(), "POST", path + "/archive", "", 200);
            for (int position = 1; position <= inputs.size(); position++) {
                JsonNode before = read(f.creator(), f.creatorDeck());
                ObjectNode alternative = ((ObjectNode) provider.card(inputs.get(position - 1).selectionRef().scryfallCardId())).deepCopy();
                alternative.put("id", UUID.randomUUID().toString()).put("artist", "New art " + archived + position);
                UUID print = store(alternative);
                JsonNode updated = expect(f.creator(), "PUT", artworkPath(f.creatorDeck(), position), payload(print, null), 200);
                assertPresentationOnly(before, updated, position);
                assertThat(updated.path("everUsed").asBoolean()).isTrue();
                assertThat(updated.path("archived").asBoolean()).isEqualTo(archived);
                JsonNode history = expect(f.owner(), "GET", f.path() + "/" + id(game), "", 200);
                assertThat(history.path("id")).isEqualTo(game.path("id"));
                assertThat(history.path("participants").valueStream().map(p -> p.path("deckId").asText()).toList())
                        .contains(f.creatorDeck().toString(), f.memberDeck().toString());
                expect(f.creator(), "PUT", path, json.writeValueAsString(Map.of("name", "Stale", "commanders", inputs)), 400);
                assertThat(read(f.creator(), f.creatorDeck())).isEqualTo(updated);
            }
        }
        expect(f.owner(), "DELETE", f.path() + "/" + id(game), "", 204);
        assertThat(read(f.creator(), f.creatorDeck()).path("everUsed").asBoolean()).isTrue();
    }

    @Test
    void artworkAndFirstUseOrStaleFullPutSerializeOnTheSameDeckLock() throws Exception {
        Fixture f = fixture();
        List<CommanderInput> inputs = colorPartners(true);
        deckService.update(f.creator().id(), f.creatorDeck(), "Colors", inputs);
        JsonNode initial = read(f.creator(), f.creatorDeck());
        ObjectNode alternative = ((ObjectNode) provider.card(inputs.get(0).selectionRef().scryfallCardId())).deepCopy();
        alternative.put("id", UUID.randomUUID().toString()).put("artist", "Concurrent art");
        UUID print = store(alternative);
        race(() -> gameService.create(f.owner().id(), f.groupId(), assignments(f), GameResult.DRAW, null),
                () -> expect(f.creator(), "PUT", artworkPath(f.creatorDeck(), 1), payload(print, null), 200));
        JsonNode used = read(f.creator(), f.creatorDeck());
        assertThat(used.path("everUsed").asBoolean()).isTrue();
        assertThat(used.path("commanders").get(0).path("scryfallCardId").asText()).isEqualTo(print.toString());
        assertThat(used.path("commanders").get(1)).isEqualTo(initial.path("commanders").get(1));
        race(() -> deckService.changeArtwork(f.creator().id(), f.creatorDeck(), 1, inputs.get(0).selectionRef().scryfallCardId(), null),
                () -> expect(f.creator(), "PUT", "/api/decks/" + f.creatorDeck(), "{\"name\":\"Renamed\"}", 200));
        assertThat(read(f.creator(), f.creatorDeck()).path("commanders")).isEqualTo(initial.path("commanders"));
        race(() -> deckService.changeArtwork(f.creator().id(), f.creatorDeck(), 1, print, null),
                () -> expect(f.creator(), "PUT", "/api/decks/" + f.creatorDeck(), json.writeValueAsString(Map.of("name", "Stale", "commanders", inputs)), 400));
        assertThat(read(f.creator(), f.creatorDeck()).path("commanders")).isEqualTo(used.path("commanders"));
    }

    private void race(Callable<?> holderAction, Callable<?> waitingAction) throws Exception {
        CountDownLatch ready = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<?> holder = executor.submit(() -> transactions.executeWithoutResult(status -> {
                try {
                    holderAction.call();
                    decks.flush();
                    ready.countDown();
                    assertThat(release.await(20, TimeUnit.SECONDS)).isTrue();
                } catch (Exception exception) {
                    throw new IllegalStateException(exception);
                }
            }));
            try {
                assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
                Future<?> waiting = executor.submit(waitingAction);
                await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
                    Long blocked = jdbc.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%decks%'", Long.class);
                    assertThat(blocked).isPositive();
                    assertThat(waiting.isDone()).isFalse();
                });
                release.countDown(); holder.get(10, TimeUnit.SECONDS); waiting.get(10, TimeUnit.SECONDS);
            } finally { release.countDown(); }
        }
    }

    private List<CommanderInput> colorPartners(boolean dual) {
        List<CommanderInput> result = new ArrayList<>();
        for (int i = 0; i < (dual ? 2 : 1); i++) {
            String name = i == 0 ? "The Prismatic Piper" : "Other Piper";
            ObjectNode card = card(name, "Partner\nIf " + name + " is your commander, choose a color before the game begins. " + name + " is the chosen color.");
            result.add(input(store(card), i == 0 ? "R" : "U"));
        }
        return result;
    }

    private void assertPresentationOnly(JsonNode before, JsonNode after, int position) {
        ObjectNode expected = ((ObjectNode) before).deepCopy();
        ObjectNode actual = ((ObjectNode) after).deepCopy();
        List<String> presentation = List.of("scryfallCardId", "selectionRef", "artworkFaceIndex", "artCropUrl", "artist", "illustrationId", "scryfallUri");
        ((ObjectNode) expected.path("commanders").get(position - 1)).remove(presentation);
        ((ObjectNode) actual.path("commanders").get(position - 1)).remove(presentation);
        assertThat(actual).isEqualTo(expected);
    }

    private JsonNode read(Actor owner, UUID deckId) throws Exception {
        return expect(owner, "GET", "/api/decks", "", 200).valueStream().filter(deck -> deck.path("id").asText().equals(deckId.toString())).findFirst().orElseThrow();
    }

    private JsonNode create(Actor owner, List<CommanderInput> inputs) throws Exception {
        return expect(owner, "POST", "/api/decks", json.writeValueAsString(Map.of("name", "Artwork", "commanders", inputs)), 201);
    }

    private ObjectNode card(String name, String text) {
        ObjectNode card = json.createObjectNode();
        card.put("object", "card").put("id", UUID.randomUUID().toString()).put("oracle_id", UUID.randomUUID().toString())
                .put("name", name).put("lang", "en").put("layout", "normal").put("type_line", "Legendary Creature — Test").put("oracle_text", text);
        card.putObject("legalities").put("commander", "legal");
        card.putArray("color_identity").add("G");
        card.put("artist", name + " artist").put("illustration_id", UUID.randomUUID().toString()).put("scryfall_uri", "https://scryfall.com/card/test");
        card.putObject("image_uris").put("art_crop", "https://cards.scryfall.io/art_crop/" + UUID.randomUUID() + ".jpg");
        return card;
    }

    private ObjectNode face(String name) {
        ObjectNode face = card(name, "");
        face.remove(List.of("id", "oracle_id", "layout", "legalities"));
        return face;
    }

    private UUID store(ObjectNode card) {
        UUID id = UUID.fromString(card.path("id").asText());
        CommanderTestProvider.put(id, card.toString());
        return id;
    }

    private CommanderInput input(UUID printing, String choice) { return new CommanderInput(new CommanderSelectionRef(printing, null), choice); }
    private String artworkPath(UUID deckId, int position) { return "/api/decks/" + deckId + "/commanders/" + position + "/artwork"; }
    private String payload(UUID printing, Integer face) {
        return json.writeValueAsString(face == null ? Map.of("scryfallCardId", printing) : Map.of("scryfallCardId", printing, "artworkFaceIndex", face));
    }
}
