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
import io.github.gandalfthejunior.mtgcommanderstats.deck.application.CompanionInput;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameResult;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

class DeckCompanionsTest extends GameTestSupport {
    @Test
    void missingCompanionArtworkPrintingHasAnActionableCompanionError() throws Exception {
        Actor owner = register("owner", "Owner");
        UUID printing = store(card("Companion", List.of("R")));
        JsonNode deck = create(owner, CommanderTestProvider.inputs("Krenko", List.of("R")), printing);
        int calls = provider.calls.get();
        JsonNode error = expect(owner, "PUT", artPath(id(deck)), "{}", 400);
        assertThat(error.path("code").asText()).isEqualTo("INVALID_COMPANION");
        assertThat(error.path("detail").asText()).contains("Companion", "scryfallCardId").doesNotContain("Commander");
        assertThat(provider.calls.get()).isEqualTo(calls);
        assertThat(read(owner, id(deck))).isEqualTo(deck);
    }

    @Test
    void absentNullAddSwapRemoveAndIdempotenceHaveDistinctOfflineSafeSemantics() throws Exception {
        Actor owner = register("owner", "Owner");
        List<CommanderInput> commanders = CommanderTestProvider.inputs("Commander", List.of("W", "B"));
        JsonNode initial = create(owner, commanders, null);
        UUID deck = id(initial);
        ObjectNode nullBody = (ObjectNode) json.readTree(createBody(commanders, null));
        nullBody.putNull("companion");
        JsonNode explicitNull = expect(owner, "POST", "/api/decks", nullBody.toString(), 201);
        assertThat(explicitNull.path("companion").isNull()).isTrue();
        expect(owner, "DELETE", "/api/decks/" + id(explicitNull), "", 204);
        assertThat(initial.has("companion")).isTrue();
        assertThat(initial.path("companion").isNull()).isTrue();
        UUID first = store(card("Lurrus of the Dream-Den", List.of("B", "W")));
        JsonNode added = update(owner, deck, "\"companion\":" + inputJson(first), 200);
        assertThat(added.path("companion").path("colorIdentity").valueStream().map(JsonNode::asText).toList()).containsExactly("W", "B");
        assertThat(added.path("commanders")).isEqualTo(initial.path("commanders"));
        assertThat(added.path("companion").has("position")).isFalse();
        assertThat(added.path("companion").has("pairing")).isFalse();
        provider.offline = true;
        int calls = provider.calls.get();
        JsonNode renamed = update(owner, deck, "\"companion\":" + inputJson(first), 200);
        assertThat(renamed.path("companion")).isEqualTo(added.path("companion"));
        assertThat(update(owner, deck, "\"manaBoxUrl\":\"https://manabox.app/decks/Example\"", 200).path("companion"))
                .isEqualTo(added.path("companion"));
        assertThat(read(owner, deck).path("companion")).isEqualTo(added.path("companion"));
        assertThat(provider.calls.get()).isEqualTo(calls);
        provider.offline = false;
        UUID second = store(card("Other Companion", List.of("W")));
        JsonNode swapped = update(owner, deck, "\"companion\":" + inputJson(second), 200);
        assertThat(swapped.path("companion").path("name").asText()).isEqualTo("Other Companion");
        provider.offline = true;
        assertThat(update(owner, deck, "\"companion\":null", 200).path("companion").isNull()).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from deck_companions", Long.class)).isZero();
        provider.offline = false;
        update(owner, deck, "\"companion\":" + inputJson(first), 200);
        expect(owner, "DELETE", "/api/decks/" + deck, "", 204);
        assertThat(jdbc.queryForObject("select count(*) from deck_companions", Long.class)).isZero();
    }

    @Test
    void prospectiveCommanderColorsAndCompanionAreValidatedTogetherWithoutPartialWrites() throws Exception {
        Actor owner = register("owner", "Owner");
        UUID companion = store(card("White Companion", List.of("W")));
        List<CommanderInput> white = CommanderTestProvider.inputs("White", List.of("W"));
        UUID deck = id(create(owner, white, companion));
        JsonNode initial = read(owner, deck);
        List<CommanderInput> blue = CommanderTestProvider.inputs("Blue", List.of("U"));
        String fields = "\"commanders\":" + json.writeValueAsString(blue) + ",\"manaBoxUrl\":\"https://manabox.app/decks/New\"";
        JsonNode failure = update(owner, deck, fields, 400);
        assertThat(failure.path("code").asText()).isEqualTo("INVALID_COMPANION");
        assertThat(failure.path("detail").asText()).contains("prospective Commander", "explicitly remove");
        assertThat(read(owner, deck)).isEqualTo(initial);
        UUID newCompanion = store(card("Blue Companion", List.of("U")));
        JsonNode compatible = update(owner, deck, fields + ",\"companion\":" + inputJson(newCompanion), 200);
        assertThat(compatible.path("companion").path("name").asText()).isEqualTo("Blue Companion");
        List<CommanderInput> wider = CommanderTestProvider.inputs("Wider", List.of("W", "U"));
        provider.offline = true;
        int calls = provider.calls.get();
        assertThat(update(owner, deck, "\"companion\":" + inputJson(newCompanion), 200).path("companion"))
                .isEqualTo(compatible.path("companion"));
        assertThat(provider.calls.get()).isEqualTo(calls);
        provider.offline = false;
        JsonNode changed = update(owner, deck, "\"commanders\":" + json.writeValueAsString(wider), 200);
        assertThat(changed.path("companion")).isEqualTo(compatible.path("companion"));
        update(owner, deck, "\"commanders\":" + json.writeValueAsString(white) + ",\"companion\":null", 200);
    }

    @Test
    void effectiveColorsIncludeBothCommandersAndPregameChoicesButCompanionNeverExpandsThem() throws Exception {
        Actor owner = register("owner", "Owner");
        List<CommanderInput> pair = new ArrayList<>();
        for (String color : List.of("W", "U")) {
            ObjectNode piper = card("Piper " + color, List.of());
            piper.putArray("keywords").add("Partner");
            piper.put("oracle_text", "Partner\nIf Piper " + color + " is your commander, choose a color before the game begins. It is the chosen color.");
            pair.add(new CommanderInput(new CommanderSelectionRef(store(piper), null), color));
        }
        UUID both = store(card("Both Colors", List.of("U", "W")));
        JsonNode deck = create(owner, pair, both);
        assertThat(deck.path("colorIdentity").valueStream().map(JsonNode::asText).toList()).containsExactly("W", "U");
        List<CommanderInput> changedChoice = List.of(pair.get(0), new CommanderInput(pair.get(1).selectionRef(), "R"));
        update(owner, id(deck), "\"commanders\":" + json.writeValueAsString(changedChoice), 400);
        assertThat(read(owner, id(deck))).isEqualTo(deck);
        List<CommanderInput> ordinaryPair = List.of(partner("White Partner", "W"), partner("Blue Partner", "U"));
        create(owner, ordinaryPair, both);
        UUID colorless = store(card("Colorless Companion", List.of()));
        create(owner, CommanderTestProvider.inputs("Colorless", List.of()), colorless);
        expect(owner, "POST", "/api/decks", createBody(CommanderTestProvider.inputs("Colorless", List.of()), both), 400);
    }

    @ParameterizedTest
    @ValueSource(strings = {"Lutri, the Spellchaser", "Yorion, Sky Nomad", "Doctor", "Ordinary", "Banned"})
    void invalidNewSelectionsAreRejectedServerSide(String kind) throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode card = card(kind, List.of("R"));
        if (kind.equals("Doctor")) {
            card.putArray("keywords").add("Doctor's companion");
            card.put("oracle_text", "Doctor's companion (You can have two commanders.)");
        }
        if (kind.equals("Ordinary")) {
            card.putArray("keywords").add("Flying");
            card.put("oracle_text", "Flying");
        }
        if (kind.equals("Banned")) card.withObject("legalities").put("commander", "banned");
        UUID printing = store(card);
        JsonNode error = expect(owner, "POST", "/api/decks", createBody(CommanderTestProvider.inputs("Krenko", List.of("R")), printing), 400);
        assertThat(error.path("code").asText()).isEqualTo("INVALID_COMPANION");
        assertThat(decks.count()).isZero();
    }

    @Test
    void bansDoNotRevalidateSavedSelectionsHistoryOrArtworkButChangedSelectionsStayFresh() throws Exception {
        Fixture f = fixture();
        ObjectNode companion = card("Saved Companion", List.of("R"));
        UUID printing = store(companion);
        JsonNode saved = update(f.creator(), f.creatorDeck(), "\"companion\":" + inputJson(printing), 200);
        companion.withObject("legalities").put("commander", "banned");
        store(companion);
        int calls = provider.calls.get();
        provider.offline = true;
        assertThat(update(f.creator(), f.creatorDeck(), "\"companion\":" + inputJson(printing), 200).path("companion")).isEqualTo(saved.path("companion"));
        JsonNode selection = expect(f.owner(), "GET", f.selection(f.creator().id()), "", 200).get(0);
        assertThat(selection.path("companion")).isEqualTo(saved.path("companion"));
        JsonNode game = expect(f.owner(), "POST", f.path(), body(f), 201);
        JsonNode history = expect(f.owner(), "GET", f.path(), "", 200).get(0);
        assertThat(participantDeck(history, f.creatorDeck()).path("companion")).isEqualTo(saved.path("companion"));
        assertThat(participantDeck(expect(f.owner(), "GET", f.path() + "/" + id(game), "", 200), f.memberDeck()).path("companion").isNull()).isTrue();
        expect(f.outsider(), "GET", f.path(), "", 403);
        expect(f.outsider(), "GET", f.selection(f.creator().id()), "", 403);
        assertThat(provider.calls.get()).isEqualTo(calls);
        provider.offline = false;
        ObjectNode alternative = companion.deepCopy().put("id", UUID.randomUUID().toString());
        UUID alt = store(alternative);
        update(f.creator(), f.creatorDeck(), "\"companion\":" + inputJson(alt), 400);
        JsonNode art = expect(f.creator(), "PUT", artPath(f.creatorDeck()), artBody(alt), 200);
        assertThat(art.path("companion").path("oracleId")).isEqualTo(saved.path("companion").path("oracleId"));
        expect(f.owner(), "DELETE", f.path() + "/" + id(game), "", 204);
        update(f.creator(), f.creatorDeck(), "\"companion\":null", 409);
        assertThat(read(f.creator(), f.creatorDeck()).path("everUsed").asBoolean()).isTrue();
    }

    @Test
    void printingOnlyPutCannotOverwriteNewArtworkAndProviderFailuresRollbackEverything() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode original = card("Companion", List.of("R"));
        UUID print = store(original);
        UUID deck = id(create(owner, CommanderTestProvider.inputs("Krenko", List.of("R")), print));
        JsonNode initial = read(owner, deck);
        UUID alternative = store(original.deepCopy().put("id", UUID.randomUUID().toString()).put("artist", "New artist"));
        update(owner, deck, "\"companion\":" + inputJson(alternative), 400);
        assertThat(read(owner, deck)).isEqualTo(initial);
        provider.offline = true;
        JsonNode failed = update(owner, deck, "\"companion\":" + inputJson(alternative) + ",\"manaBoxUrl\":\"https://manabox.app/decks/Failure\"", 503);
        assertThat(failed.path("code").asText()).isEqualTo("SCRYFALL_UNAVAILABLE");
        assertThat(read(owner, deck)).isEqualTo(initial);
        provider.offline = false;
        JsonNode updated = expect(owner, "PUT", artPath(deck), artBody(alternative), 200);
        assertThat(updated.path("companion").path("artist").asText()).isEqualTo("New artist");
        update(owner, deck, "\"companion\":" + inputJson(print), 400);
        assertThat(read(owner, deck)).isEqualTo(updated);
    }

    @Test
    void artworkOnUsedArchivedDecksPreservesGameplayAndRejectsInvalidSidesMetadataOrIdentity() throws Exception {
        Fixture f = fixture();
        ObjectNode companion = card("Companion", List.of("R"));
        UUID original = store(companion);
        update(f.creator(), f.creatorDeck(), "\"companion\":" + inputJson(original), 200);
        JsonNode game = expect(f.owner(), "POST", f.path(), body(f), 201);
        ObjectNode alternative = companion.deepCopy().put("id", UUID.randomUUID().toString()).put("layout", "transform");
        alternative.remove(List.of("image_uris", "artist"));
        ObjectNode front = card("Front", List.of("R"));
        ObjectNode back = card("Back", List.of("R")).put("artist", "Back artist");
        alternative.putArray("card_faces").add(front).add(back);
        UUID print = store(alternative);
        for (boolean archived : List.of(false, true)) {
            if (archived) expect(f.creator(), "POST", "/api/decks/" + f.creatorDeck() + "/archive", "", 200);
            JsonNode before = read(f.creator(), f.creatorDeck());
            String body = artBody(print).replace("}", ",\"artworkFaceIndex\":1}");
            JsonNode changed = expect(f.creator(), "PUT", artPath(f.creatorDeck()), body, 200);
            assertArtworkOnly(before, changed);
            assertThat(changed.path("companion").path("artworkFaceIndex").asInt()).isEqualTo(1);
            assertThat(changed.path("companion").path("artist").asText()).isEqualTo("Back artist");
            for (String invalid : List.of(artBody(print), body.replace(":1}", ":2}"), body.replace(":1}", ":-1}"),
                    body.replace(":1}", ":1.0}"), body.replace(":1}", ":\"1\"}"), body.replace(":1}", ":null}"),
                    "{}", "{\"scryfallCardId\":\"bad\"}", body.replace("}", ",\"artCropUrl\":\"https://evil.test/a\"}"))) {
                expect(f.creator(), "PUT", artPath(f.creatorDeck()), invalid, 400);
                assertThat(read(f.creator(), f.creatorDeck())).isEqualTo(changed);
            }
            UUID wrong = store(card("Wrong Oracle", List.of("R")));
            expect(f.creator(), "PUT", artPath(f.creatorDeck()), artBody(wrong), 400);
            expect(f.creator(), "PUT", artPath(UUID.randomUUID()), artBody(print), 404);
            expect(null, "PUT", artPath(f.creatorDeck()), body, 403);
            expect(new Actor(f.creator().cookie(), null, f.creator().id()), "PUT", artPath(f.creatorDeck()), body, 403);
            provider.offline = true;
            expect(f.creator(), "PUT", artPath(f.creatorDeck()), body, 503);
            assertThat(read(f.creator(), f.creatorDeck())).isEqualTo(changed);
            provider.offline = false;
            assertThat(participantDeck(expect(f.owner(), "GET", f.path() + "/" + id(game), "", 200), f.creatorDeck()).path("companion"))
                    .isEqualTo(changed.path("companion"));
        }
        front.remove("image_uris");
        back.remove("artist");
        store(alternative);
        JsonNode single = expect(f.creator(), "PUT", artPath(f.creatorDeck()), artBody(print), 200);
        assertThat(single.path("companion").path("artworkFaceIndex").asInt()).isEqualTo(1);
        assertThat(single.path("companion").path("artist").isNull()).isTrue();
        back.remove("image_uris");
        store(alternative);
        expect(f.creator(), "PUT", artPath(f.creatorDeck()), artBody(print), 400);
        assertThat(read(f.creator(), f.creatorDeck())).isEqualTo(single);
    }

    @Test
    void missingInitialArtIsValidAndReversibleArtworkRemapsOnlyThePrintingLocalGameplaySelector() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode companion = card("No art", List.of("R"));
        companion.remove(List.of("image_uris", "artist"));
        UUID original = store(companion);
        JsonNode initial = create(owner, CommanderTestProvider.inputs("Krenko", List.of("R")), original);
        assertThat(initial.path("companion").path("artCropUrl").isNull()).isTrue();
        UUID deck = id(initial);
        ObjectNode other = card("Other face", List.of("R"));
        store(other);
        // Independently identified faces carry authoritative rules/colors in this stub.
        ObjectNode printing = card("Other face // No art", List.of("R")).put("layout", "reversible_card");
        printing.remove(List.of("oracle_id", "image_uris"));
        printing.putArray("card_faces").add(other).add(companion);
        UUID reversible = store(printing);
        ObjectNode selectionBody = (ObjectNode) json.readTree(createBody(CommanderTestProvider.inputs("Krenko", List.of("R")), reversible));
        ((ObjectNode) selectionBody.path("companion").path("selectionRef")).put("gameplayFaceIndex", 1);
        JsonNode selected = expect(owner, "POST", "/api/decks", selectionBody.toString(), 201);
        assertThat(selected.path("companion").path("name").asText()).isEqualTo("No art");
        for (String invalid : List.of("1.0", "\"1\"", "true", "null", "-1", "3")) {
            String malformed = selectionBody.toString().replace("\"gameplayFaceIndex\":1", "\"gameplayFaceIndex\":" + invalid);
            expect(owner, "POST", "/api/decks", malformed, 400);
        }
        JsonNode changed = expect(owner, "PUT", artPath(deck), artBody(reversible).replace("}", ",\"artworkFaceIndex\":0}"), 200);
        assertArtworkOnly(initial, changed);
        assertThat(changed.path("companion").path("selectionRef").path("gameplayFaceIndex").asInt()).isEqualTo(1);
        assertThat(changed.path("companion").path("artworkFaceIndex").asInt()).isZero();
        expect(owner, "GET", "/api/scryfall/cards/" + reversible + "/artworks?gameplayFaceIndex=1", "", 200);
        printing.putArray("card_faces").add(companion).add(other);
        store(printing);
        JsonNode swapped = expect(owner, "PUT", artPath(deck), artBody(reversible), 200);
        assertThat(swapped.path("companion").path("selectionRef").path("gameplayFaceIndex").asInt()).isZero();
        assertThat(swapped.path("companion").path("oracleId")).isEqualTo(initial.path("companion").path("oracleId"));
    }

    private void assertArtworkOnly(JsonNode before, JsonNode after) {
        ObjectNode expected = ((ObjectNode) before).deepCopy();
        ObjectNode actual = ((ObjectNode) after).deepCopy();
        List<String> presentation = List.of("selectionRef", "scryfallCardId", "artworkFaceIndex", "artCropUrl", "illustrationId", "artist", "scryfallUri");
        ((ObjectNode) expected.path("companion")).remove(presentation);
        ((ObjectNode) actual.path("companion")).remove(presentation);
        assertThat(actual).isEqualTo(expected);
    }

    @Test
    void authenticationOwnershipCsrfAndMalformedBodiesCannotWriteCompanionMetadata() throws Exception {
        Actor owner = register("owner", "Owner");
        Actor other = register("other", "Other");
        UUID deck = deck(owner);
        UUID companion = store(card("Companion", List.of("R")));
        expect(null, "GET", "/api/scryfall/companions?q=Companion", "", 401);
        expect(owner, "GET", "/api/scryfall/companions?q=x", "", 400);
        assertThat(expect(owner, "GET", "/api/scryfall/companions?q=Companion", "", 200).isArray()).isTrue();
        update(other, deck, "\"companion\":" + inputJson(companion), 403);
        update(new Actor(owner.cookie(), null, owner.id()), deck, "\"companion\":" + inputJson(companion), 403);
        update(new Actor(owner.cookie(), "invalid", owner.id()), deck, "\"companion\":" + inputJson(companion), 403);
        update(null, deck, "\"companion\":" + inputJson(companion), 403);
        update(owner, UUID.randomUUID(), "\"companion\":null", 404);
        for (String invalid : List.of("[]", "true", "\"card\"", "{}", "{\"selectionRef\":null}",
                "{\"selectionRef\":{}}", "{\"selectionRef\":{\"scryfallCardId\":\"bad\"}}",
                inputJson(companion).replace("}}", "},\"name\":\"Forged\"}"),
                inputJson(companion).replace("}}", "},\"chosenColor\":\"R\"}"),
                inputJson(companion).replace("}}", ",\"gameplayFaceIndex\":1}}"))) {
            update(owner, deck, "\"companion\":" + invalid, 400);
        }
        assertThat(read(owner, deck).path("companion").isNull()).isTrue();
        update(owner, deck, "\"companion\":" + inputJson(UUID.randomUUID()), 404);
        expect(owner, "PUT", artPath(deck), artBody(companion), 404);
        expect(other, "PUT", artPath(deck), artBody(companion), 403);
    }

    @Test
    void firstUseLocksAddSwapAndRemovalPermanentlyAndRollbackDoesNotLock() throws Exception {
        Fixture f = fixture();
        UUID first = store(card("First Companion", List.of("R")));
        UUID second = store(card("Second Companion", List.of("R")));
        update(f.creator(), f.creatorDeck(), "\"companion\":" + inputJson(first), 200);
        transactions.executeWithoutResult(status -> {
            createGame(f.owner().id(), f.groupId(), assignments(f), GameResult.DRAW, null);
            status.setRollbackOnly();
        });
        assertThat(read(f.creator(), f.creatorDeck()).path("everUsed").asBoolean()).isFalse();
        update(f.creator(), f.creatorDeck(), "\"companion\":" + inputJson(second), 200);
        JsonNode game = expect(f.owner(), "POST", f.path(), body(f), 201);
        update(f.creator(), f.creatorDeck(), "\"companion\":" + inputJson(first), 409);
        update(f.creator(), f.creatorDeck(), "\"companion\":null", 409);
        update(f.member(), f.memberDeck(), "\"companion\":" + inputJson(first), 409);
        update(f.member(), f.memberDeck(), "\"companion\":null", 200);
        update(f.creator(), f.creatorDeck(), "\"companion\":" + inputJson(second), 200);
        // Moving all assignments away cannot unlock either the old or newly assigned decks.
        List<io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameParticipant> replacement = List.of(
                assignment(f.owner().id(), f.ownerDeck()), assignment(f.member().id(), f.memberDeck()));
        expect(f.owner(), "PUT", f.path() + "/" + id(game), body(replacement, "DRAW", null), 200);
        expect(f.owner(), "DELETE", f.path() + "/" + id(game), "", 204);
        update(f.creator(), f.creatorDeck(), "\"companion\":null", 409);
        expect(f.creator(), "DELETE", "/api/decks/" + f.creatorDeck(), "", 409);
    }

    @Test
    void gameCreationCompanionAndUnrelatedWritesSerializeOnTheExistingDeckLock() throws Exception {
        Fixture f = fixture();
        UUID companion = store(card("Concurrent Companion", List.of("R")));
        race(() -> deckService.update(f.creator().id(), f.creatorDeck(), "Concurrent", null, false, null, true, companionInput(companion)),
                () -> expect(f.owner(), "POST", f.path(), body(f), 201));
        assertThat(read(f.creator(), f.creatorDeck()).path("everUsed").asBoolean()).isTrue();
        assertThat(read(f.creator(), f.creatorDeck()).path("companion").path("name").asText()).isEqualTo("Concurrent Companion");
        race(() -> deckService.update(f.creator().id(), f.creatorDeck(), "Concurrent", null, true, "https://manabox.app/decks/Concurrent"),
                () -> update(f.creator(), f.creatorDeck(), "\"companion\":" + inputJson(companion), 200));
        ObjectNode original = (ObjectNode) provider.card(companion);
        UUID art = store(original.deepCopy().put("id", UUID.randomUUID().toString()).put("artist", "Concurrent art"));
        race(() -> deckService.changeCompanionArtwork(f.creator().id(), f.creatorDeck(), art, null),
                () -> update(f.creator(), f.creatorDeck(), "\"companion\":" + inputJson(companion), 400));
        assertThat(read(f.creator(), f.creatorDeck()).path("companion").path("artist").asText()).isEqualTo("Concurrent art");
        race(() -> createGame(f.owner().id(), f.groupId(), List.of(assignment(f.owner().id(), f.ownerDeck()),
                        assignment(f.member().id(), f.memberDeck())), GameResult.DRAW, null),
                () -> update(f.owner(), f.ownerDeck(), "\"companion\":" + inputJson(companion), 409));
        assertThat(read(f.owner(), f.ownerDeck()).path("companion").isNull()).isTrue();
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

    private CommanderInput partner(String name, String color) {
        ObjectNode partner = card(name, List.of(color)).put("oracle_text", "Partner");
        partner.putArray("keywords").add("Partner");
        return new CommanderInput(new CommanderSelectionRef(store(partner), null), null);
    }

    private JsonNode participantDeck(JsonNode game, UUID deck) {
        return game.path("participants").valueStream().filter(p -> p.path("deckId").asText().equals(deck.toString())).findFirst().orElseThrow().path("deck");
    }

    private JsonNode read(Actor owner, UUID deck) throws Exception {
        return expect(owner, "GET", "/api/decks", "", 200).valueStream().filter(d -> d.path("id").asText().equals(deck.toString())).findFirst().orElseThrow();
    }

    private JsonNode create(Actor owner, List<CommanderInput> commanders, UUID companion) throws Exception {
        return expect(owner, "POST", "/api/decks", createBody(commanders, companion), 201);
    }

    private String createBody(List<CommanderInput> commanders, UUID companion) {
        return "{\"name\":\"Deck\",\"commanders\":" + json.writeValueAsString(commanders)
                + (companion == null ? "" : ",\"companion\":" + inputJson(companion)) + "}";
    }

    private JsonNode update(Actor actor, UUID deck, String fields, int status) throws Exception {
        return expect(actor, "PUT", "/api/decks/" + deck, "{\"name\":\"Renamed\"," + fields + "}", status);
    }

    private CompanionInput companionInput(UUID printing) {
        return new CompanionInput(new CommanderSelectionRef(printing, null));
    }

    private String inputJson(UUID printing) {
        return json.writeValueAsString(companionInput(printing));
    }

    private String artPath(UUID deck) { return "/api/decks/" + deck + "/companion/artwork"; }
    private String artBody(UUID print) { return json.writeValueAsString(Map.of("scryfallCardId", print)); }

    private UUID store(ObjectNode card) {
        UUID id = UUID.fromString(card.path("id").asText());
        CommanderTestProvider.put(id, card.toString());
        return id;
    }

    private ObjectNode card(String name, List<String> colors) {
        String oracleId = switch (name) {
            case "Lutri, the Spellchaser" -> "158a6225-a246-4fd6-aa57-0df8067b4383";
            case "Yorion, Sky Nomad" -> "e15504a7-2b67-4185-b916-172145f10b19";
            default -> UUID.randomUUID().toString();
        };
        ObjectNode card = json.createObjectNode().put("object", "card").put("id", UUID.randomUUID().toString())
                .put("oracle_id", oracleId).put("name", name).put("lang", "en")
                .put("layout", "normal").put("type_line", "Legendary Creature — Test")
                .put("oracle_text", "Companion — Your starting deck meets a condition.").put("artist", "Test artist");
        card.putArray("keywords").add("Companion");
        card.set("color_identity", json.valueToTree(colors));
        card.putObject("legalities").put("commander", "legal");
        card.putObject("image_uris").put("art_crop", "https://cards.scryfall.io/art_crop/test.jpg");
        return card;
    }
}
