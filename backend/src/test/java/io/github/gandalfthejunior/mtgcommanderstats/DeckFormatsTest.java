package io.github.gandalfthejunior.mtgcommanderstats;

import java.time.Duration;
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
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckFormat;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameResult;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

class DeckFormatsTest extends GameTestSupport {
    private static final String PDH = "\"format\":\"PAUPER_COMMANDER\"";
    private static final String REGULAR = "\"format\":\"COMMANDER\"";

    @Test
    void defaultsToCommanderAndOmittedOrUnchangedFormatPreservesSnapshotsOffline() throws Exception {
        Actor owner = register("owner", "Owner");
        UUID deck = deck(owner);
        JsonNode saved = read(owner, deck);
        assertThat(saved.path("format").asText()).isEqualTo("COMMANDER");
        provider.offline = true;
        int calls = provider.calls.get();
        assertThat(update(owner, deck, REGULAR, 200).path("commanders")).isEqualTo(saved.path("commanders"));
        assertThat(update(owner, deck, "\"manaBoxUrl\":\"https://manabox.app/decks/Example\"", 200).path("format").asText())
                .isEqualTo("COMMANDER");
        assertThat(read(owner, deck).path("format").asText()).isEqualTo("COMMANDER");
        assertThat(provider.calls.get()).isEqualTo(calls);
    }

    @ParameterizedTest
    @ValueSource(strings = {"null", "\"PAUPER\"", "\"commander\"", "\"\"", "1", "true", "{}", "[]"})
    void rejectsExplicitNullUnknownAndNonStringFormatsWithoutMutation(String format) throws Exception {
        Actor owner = register("owner", "Owner");
        UUID deck = deck(owner);
        JsonNode before = read(owner, deck);
        String body = deckBody("Invalid", "Krenko", List.of("R"));
        expect(owner, "POST", "/api/decks", body.substring(0, body.length() - 1) + ",\"format\":" + format + "}", 400);
        update(owner, deck, "\"format\":" + format, 400);
        assertThat(read(owner, deck)).isEqualTo(before);
    }

    @Test
    void validatesAllCommandersOnFormatSwitchAndRollsBackTheEntireWrite() throws Exception {
        Actor owner = register("owner", "Owner");
        UUID deck = deck(owner);
        JsonNode before = read(owner, deck);
        update(owner, deck, PDH + ",\"manaBoxUrl\":\"https://manabox.app/decks/Failure\"", 400);
        assertThat(read(owner, deck)).isEqualTo(before);
        eligibleSaved(owner, deck);
        provider.offline = true;
        JsonNode failure = update(owner, deck, PDH, 503);
        assertThat(failure.path("code").asText()).isEqualTo("SCRYFALL_UNAVAILABLE");
        assertThat(read(owner, deck)).isEqualTo(before);
        provider.offline = false;
        JsonNode changed = update(owner, deck, PDH, 200);
        assertThat(changed.path("format").asText()).isEqualTo("PAUPER_COMMANDER");
        assertThat(changed.path("commanders")).isEqualTo(before.path("commanders"));
        provider.offline = true;
        int calls = provider.calls.get();
        update(owner, deck, PDH + ",\"commanders\":" + inputs(changed), 200);
        update(owner, deck, "\"manaBoxUrl\":null", 200);
        assertThat(provider.calls.get()).isEqualTo(calls);
        provider.offline = false;
        assertThat(update(owner, deck, REGULAR, 200).path("format").asText()).isEqualTo("COMMANDER");
    }

    @Test
    void pauperCompanionRequiresExplicitRemovalInTheSameAtomicUpdate() throws Exception {
        Actor owner = register("owner", "Owner");
        UUID deck = deck(owner);
        eligibleSaved(owner, deck);
        ObjectNode companion = card("Companion", "Creature — Cat", "Companion — Test condition.");
        companion.putArray("keywords").add("Companion");
        UUID print = store(companion);
        update(owner, deck, "\"companion\":" + companion(print), 200);
        JsonNode before = read(owner, deck);
        JsonNode invalid = update(owner, deck, PDH, 400);
        assertThat(invalid.path("detail").asText()).contains("explicitly remove");
        assertThat(read(owner, deck)).isEqualTo(before);
        JsonNode pdh = update(owner, deck, PDH + ",\"companion\":null", 200);
        assertThat(pdh.path("companion").isNull()).isTrue();
        update(owner, deck, "\"companion\":" + companion(print), 400);
        String create = "{\"name\":\"Invalid\"," + PDH + ",\"commanders\":" + inputs(pdh) + ",\"companion\":" + companion(print) + "}";
        expect(owner, "POST", "/api/decks", create, 400);
        assertThat(read(owner, deck)).isEqualTo(pdh);
    }

    @Test
    void pairsRequireIndependentEligibilityAndGenuinePairingAndRemainIntactOnFailure() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode a = card("First Partner", "Creature — Human", "Partner");
        ObjectNode b = card("Second Partner", "Creature — Elf", "Partner");
        List<CommanderInput> pair = List.of(input(store(a)), input(store(b)));
        JsonNode saved = createPdh(owner, pair, 201);
        assertThat(saved.path("commanders")).hasSize(2);
        ObjectNode c = card("No Pairing Permission", "Creature — Dwarf", "");
        update(owner, id(saved), "\"commanders\":" + json.writeValueAsString(List.of(pair.get(0), input(store(c)))), 400);
        b.put("testPdhEligible", false);
        store(b);
        createPdh(owner, pair, 400);
        assertThat(read(owner, id(saved))).isEqualTo(saved);
        ObjectNode chooser = card("Background Chooser", "Legendary Creature — Dragon", "Choose a Background");
        ObjectNode background = card("Background", "Legendary Enchantment — Background", "");
        List<CommanderInput> backgrounds = List.of(input(store(chooser)), input(store(background)));
        createPdh(owner, backgrounds, 201);
        createPdh(owner, List.of(backgrounds.get(1)), 400);
        ObjectNode regularA = a.deepCopy().put("type_line", "Legendary Creature — Human");
        ObjectNode regularB = b.deepCopy().put("type_line", "Legendary Creature — Elf").put("testPdhEligible", true);
        store(regularA);
        store(regularB);
        JsonNode regular = expect(owner, "POST", "/api/decks", "{\"name\":\"Pair\",\"commanders\":" + json.writeValueAsString(pair) + "}", 201);
        assertThat(update(owner, id(regular), PDH, 200).path("commanders")).isEqualTo(regular.path("commanders"));
    }

    @Test
    void pdhChosenColorsAndGameplaySelectorsCannotBypassAtomicValidation() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode chooser = card("Color Chooser", "Creature — Shapeshifter",
                "Partner\nIf Color Chooser is your commander, choose a color before the game begins. It is the chosen color.");
        chooser.putArray("color_identity");
        CommanderInput first = new CommanderInput(new CommanderSelectionRef(store(chooser), null), "U");
        CommanderInput second = input(store(card("Red Partner", "Creature — Human", "Partner")));
        JsonNode before = createPdh(owner, List.of(first, second), 201);
        assertThat(before.path("colorIdentity").valueStream().map(JsonNode::asText).toList()).containsExactly("U", "R");
        List<CommanderInput> missingColor = List.of(new CommanderInput(first.selectionRef(), null), second);
        update(owner, id(before), "\"commanders\":" + json.writeValueAsString(missingColor)
                + ",\"manaBoxUrl\":\"https://manabox.app/decks/Failure\"", 400);
        List<CommanderInput> invalidFace = List.of(new CommanderInput(
                new CommanderSelectionRef(first.selectionRef().scryfallCardId(), 1), "U"), second);
        update(owner, id(before), "\"commanders\":" + json.writeValueAsString(invalidFace), 400);
        assertThat(read(owner, id(before))).isEqualTo(before);
        List<CommanderInput> changed = List.of(new CommanderInput(first.selectionRef(), "W"), second);
        JsonNode updated = update(owner, id(before), "\"commanders\":" + json.writeValueAsString(changed), 200);
        assertThat(updated.path("colorIdentity").valueStream().map(JsonNode::asText).toList()).containsExactly("W", "R");
        assertThat(updated.path("format").asText()).isEqualTo("PAUPER_COMMANDER");
    }

    @Test
    void nonlegendaryPdhCannotSwitchToCommanderAndChangedSelectionsAreAlwaysValidated() throws Exception {
        Actor owner = register("owner", "Owner");
        JsonNode saved = createPdh(owner, List.of(input(store(card("Nonlegendary", "Artifact — Vehicle", "")))), 201);
        UUID deck = id(saved);
        update(owner, deck, REGULAR, 400);
        assertThat(read(owner, deck)).isEqualTo(saved);
        provider.offline = true;
        List<CommanderInput> replacement = List.of(input(store(card("New", "Artifact — Spacecraft", ""))));
        update(owner, deck, "\"commanders\":" + json.writeValueAsString(replacement), 503);
        assertThat(read(owner, deck)).isEqualTo(saved);
        provider.offline = false;
        assertThat(update(owner, deck, "\"commanders\":" + json.writeValueAsString(replacement), 200).path("format").asText()).isEqualTo("PAUPER_COMMANDER");
    }

    @Test
    void mixedGamesExposePersistedFormatsAndRetainThemAfterArchiveDepartureReassignAndDeletion() throws Exception {
        Fixture f = fixture();
        eligibleSaved(f.creator(), f.creatorDeck());
        update(f.creator(), f.creatorDeck(), PDH, 200);
        provider.offline = true;
        assertThat(expect(f.owner(), "GET", f.selection(f.creator().id()), "", 200).get(0).path("format").asText()).isEqualTo("PAUPER_COMMANDER");
        JsonNode game = expect(f.owner(), "POST", f.path(), body(f), 201);
        assertFormats(game, f.creatorDeck(), f.memberDeck());
        assertFormats(expect(f.owner(), "GET", f.path(), "", 200).get(0), f.creatorDeck(), f.memberDeck());
        assertFormats(expect(f.owner(), "GET", f.path() + "/" + id(game), "", 200), f.creatorDeck(), f.memberDeck());
        expect(f.creator(), "POST", "/api/decks/" + f.creatorDeck() + "/archive", "", 200);
        expect(f.creator(), "DELETE", "/api/groups/" + f.groupId() + "/membership", "", 204);
        assertFormats(expect(f.owner(), "GET", f.path(), "", 200).get(0), f.creatorDeck(), f.memberDeck());
        JsonNode stats = expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", 200);
        assertThat(stats.path("decks").valueStream().filter(d -> d.path("deckId").asText().equals(f.creatorDeck().toString()))
                .findFirst().orElseThrow().path("format").asText()).isEqualTo("PAUPER_COMMANDER");
        update(f.creator(), f.creatorDeck(), REGULAR, 409);
        update(f.member(), f.memberDeck(), PDH, 409);
        expect(f.owner(), "PUT", f.path() + "/" + id(game), body(List.of(assignment(f.owner().id(), f.ownerDeck()),
                assignment(f.member().id(), f.memberDeck())), "DRAW", null), 200);
        expect(f.owner(), "DELETE", f.path() + "/" + id(game), "", 204);
        update(f.creator(), f.creatorDeck(), REGULAR, 409);
    }

    @Test
    void rollbackDoesNotLockFormatAndAllPdhAssignmentsUseTheSameStatistics() throws Exception {
        Fixture f = fixture();
        eligibleSaved(f.creator(), f.creatorDeck());
        eligibleSaved(f.member(), f.memberDeck());
        transactions.executeWithoutResult(status -> {
            createGame(f.owner().id(), f.groupId(), assignments(f), GameResult.DRAW, null);
            status.setRollbackOnly();
        });
        assertThat(read(f.creator(), f.creatorDeck()).path("everUsed").asBoolean()).isFalse();
        update(f.creator(), f.creatorDeck(), PDH, 200);
        update(f.member(), f.memberDeck(), PDH, 200);
        expect(f.owner(), "POST", f.path(), body(f), 201);
        JsonNode stats = expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", 200);
        assertThat(stats.path("decks")).hasSize(2);
        assertThat(stats.path("decks").valueStream().map(d -> d.path("format").asText()).toList())
                .containsOnly("PAUPER_COMMANDER");
        assertThat(stats.path("decks").valueStream().map(d -> d.path("games").asInt()).toList()).containsOnly(1);
    }

    @Test
    void artworkAndSafeEditsPreserveUsedPdhGameplayAfterEligibilityChanges() throws Exception {
        Fixture f = fixture();
        eligibleSaved(f.creator(), f.creatorDeck());
        update(f.creator(), f.creatorDeck(), PDH, 200);
        expect(f.owner(), "POST", f.path(), body(f), 201);
        expect(f.creator(), "POST", "/api/decks/" + f.creatorDeck() + "/archive", "", 200);
        JsonNode before = read(f.creator(), f.creatorDeck());
        UUID print = UUID.fromString(before.path("commanders").get(0).path("scryfallCardId").asText());
        ObjectNode artwork = ((ObjectNode) provider.card(print)).deepCopy();
        artwork.put("id", UUID.randomUUID().toString()).put("testPdhEligible", false);
        artwork.withObject("legalities").put("commander", "banned");
        artwork.putObject("image_uris").put("art_crop", "https://cards.scryfall.io/pdh-test-crop.jpg");
        JsonNode changed = expect(f.creator(), "PUT", "/api/decks/" + f.creatorDeck() + "/commanders/1/artwork",
                json.writeValueAsString(Map.of("scryfallCardId", store(artwork))), 200);
        assertThat(changed.path("format")).isEqualTo(before.path("format"));
        assertThat(changed.path("colorIdentity")).isEqualTo(before.path("colorIdentity"));
        assertThat(changed.path("everUsed").asBoolean()).isTrue();
        assertThat(changed.path("commanders").get(0).path("oracleId")).isEqualTo(before.path("commanders").get(0).path("oracleId"));
        provider.offline = true;
        int calls = provider.calls.get();
        update(f.creator(), f.creatorDeck(), PDH + ",\"commanders\":" + inputs(changed), 200);
        update(f.creator(), f.creatorDeck(), "\"manaBoxUrl\":\"https://manabox.app/decks/AfterBan\"", 200);
        expect(f.owner(), "GET", f.path(), "", 200);
        assertThat(provider.calls.get()).isEqualTo(calls);
    }

    @Test
    void authorizationCsrfSearchDiscriminatorAndMissingDeckRemainEnforced() throws Exception {
        Fixture f = fixture();
        JsonNode before = read(f.creator(), f.creatorDeck());
        update(f.outsider(), f.creatorDeck(), PDH, 403);
        update(new Actor(f.creator().cookie(), null, f.creator().id()), f.creatorDeck(), PDH, 403);
        update(null, f.creatorDeck(), PDH, 403);
        update(f.creator(), UUID.randomUUID(), PDH, 404);
        expect(null, "GET", "/api/decks", "", 401);
        expect(null, "GET", "/api/scryfall/commanders?q=Test&format=PAUPER_COMMANDER", "", 401);
        for (String invalid : List.of("UNKNOWN", "", "null", "commander")) {
            expect(f.creator(), "GET", "/api/scryfall/commanders?q=Test&format=" + invalid, "", 400);
        }
        expect(f.creator(), "GET", "/api/scryfall/commanders?q=Test&format=PAUPER_COMMANDER", "", 200);
        assertThat(read(f.creator(), f.creatorDeck())).isEqualTo(before);
    }

    @Test
    void formatChangeAndCommittedFirstUseSerializeInBothOrders() throws Exception {
        Fixture f = fixture();
        eligibleSaved(f.creator(), f.creatorDeck());
        race(() -> deckService.update(f.creator().id(), f.creatorDeck(), "Changed", null, false, null, false, null, DeckFormat.PAUPER_COMMANDER),
                () -> expect(f.owner(), "POST", f.path(), body(f), 201));
        assertThat(read(f.creator(), f.creatorDeck()).path("format").asText()).isEqualTo("PAUPER_COMMANDER");
        assertThat(read(f.creator(), f.creatorDeck()).path("everUsed").asBoolean()).isTrue();
        eligibleSaved(f.owner(), f.ownerDeck());
        race(() -> createGame(f.owner().id(), f.groupId(), List.of(assignment(f.owner().id(), f.ownerDeck()),
                        assignment(f.member().id(), f.memberDeck())), GameResult.DRAW, null),
                () -> update(f.owner(), f.ownerDeck(), PDH, 409));
        assertThat(read(f.owner(), f.ownerDeck()).path("format").asText()).isEqualTo("COMMANDER");
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
                } catch (Exception exception) { throw new IllegalStateException(exception); }
            }));
            try {
                assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
                Future<?> waiting = executor.submit(waitingAction);
                await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
                    assertThat(jdbc.queryForObject("select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query like '%decks%'", Long.class)).isPositive();
                    assertThat(waiting.isDone()).isFalse();
                });
                release.countDown();
                holder.get(10, TimeUnit.SECONDS);
                waiting.get(10, TimeUnit.SECONDS);
            } finally { release.countDown(); }
        }
    }

    private void assertFormats(JsonNode game, UUID pdh, UUID regular) {
        for (JsonNode participant : game.path("participants")) {
            String deck = participant.path("deckId").asText();
            assertThat(participant.path("deck").path("format").asText())
                    .isEqualTo(deck.equals(pdh.toString()) ? "PAUPER_COMMANDER" : "COMMANDER");
            assertThat(deck).isIn(pdh.toString(), regular.toString());
        }
    }

    private void eligibleSaved(Actor owner, UUID deck) throws Exception {
        UUID print = UUID.fromString(read(owner, deck).path("commanders").get(0).path("scryfallCardId").asText());
        ObjectNode card = ((ObjectNode) provider.card(print)).deepCopy().put("testPdhEligible", true);
        store(card);
    }

    private String inputs(JsonNode deck) {
        return json.writeValueAsString(deck.path("commanders").valueStream()
                .map(c -> new CommanderInput(json.treeToValue(c.path("selectionRef"), CommanderSelectionRef.class),
                        c.path("chosenColor").isString() ? c.path("chosenColor").asText() : null)).toList());
    }

    private JsonNode createPdh(Actor actor, List<CommanderInput> inputs, int status) throws Exception {
        return expect(actor, "POST", "/api/decks", "{\"name\":\"PDH\"," + PDH + ",\"commanders\":" + json.writeValueAsString(inputs) + "}", status);
    }

    private JsonNode update(Actor actor, UUID deck, String fields, int status) throws Exception {
        return expect(actor, "PUT", "/api/decks/" + deck, "{\"name\":\"Deck\"," + fields + "}", status);
    }

    private JsonNode read(Actor owner, UUID deck) throws Exception {
        return expect(owner, "GET", "/api/decks", "", 200).valueStream()
                .filter(d -> d.path("id").asText().equals(deck.toString())).findFirst().orElseThrow();
    }

    private String companion(UUID id) { return json.writeValueAsString(Map.of("selectionRef", new CommanderSelectionRef(id, null))); }
    private CommanderInput input(UUID id) { return new CommanderInput(new CommanderSelectionRef(id, null), null); }
    private UUID store(ObjectNode card) {
        UUID id = UUID.fromString(card.path("id").asText());
        CommanderTestProvider.put(id, card.toString());
        return id;
    }
    private ObjectNode card(String name, String type, String text) {
        ObjectNode card = json.createObjectNode();
        card.put("id", UUID.randomUUID().toString()).put("oracle_id", UUID.randomUUID().toString());
        card.put("name", name).put("type_line", type).put("oracle_text", text).put("layout", "normal").put("lang", "en");
        card.put("testPdhEligible", true);
        card.putObject("legalities").put("commander", "legal");
        card.putArray("color_identity").add("R");
        return card;
    }
}
