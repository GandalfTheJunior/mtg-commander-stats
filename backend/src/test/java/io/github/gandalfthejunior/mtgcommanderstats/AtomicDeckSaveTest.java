package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import io.github.gandalfthejunior.mtgcommanderstats.deck.application.ArtworkInput;
import io.github.gandalfthejunior.mtgcommanderstats.deck.application.CommanderInput;
import io.github.gandalfthejunior.mtgcommanderstats.deck.application.CompanionInput;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;

class AtomicDeckSaveTest extends GameTestSupport {
    @AfterEach
    void resetProviderFailure() {
        provider.failAndGoOfflineAt = null;
    }

    @Test
    void createAndRepeatSaveKeepArtworkPrintingAndFullCardFacesTogether() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode gameplay = card("Front", "Partner");
        UUID gameplayId = store(gameplay);
        ObjectNode alternate = gameplay.deepCopy();
        alternate.put("id", UUID.randomUUID().toString()).put("artist", "Selected artist");
        alternate.put("layout", "transform").put("name", "Front // Back");
        alternate.remove("image_uris");
        ObjectNode front = face("Front", "Front rules");
        ObjectNode back = face("Back", "Back rules");
        alternate.set("card_faces", json.valueToTree(List.of(front, back)));
        UUID artId = store(alternate);
        CommanderInput input = new CommanderInput(new CommanderSelectionRef(gameplayId, null), null,
                new ArtworkInput(artId, 1));
        String body = json.writeValueAsString(Map.of("name", "Draft", "commanders", List.of(input)));
        JsonNode created = expect(owner, "POST", "/api/decks", body, 201);
        JsonNode selected = created.path("commanders").get(0);
        assertThat(selected.path("scryfallCardId").asText()).isEqualTo(artId.toString());
        assertThat(selected.path("selectionRef").path("scryfallCardId").asText()).isEqualTo(artId.toString());
        assertThat(selected.path("artworkFaceIndex").asInt()).isEqualTo(1);
        assertThat(selected.path("cardFaces").get(1).path("name").asText()).isEqualTo("Back");
        assertThat(selected.path("cardFaces").get(1).path("oracleText").asText()).isEqualTo("Back rules");
        assertThat(selected.path("artist").asText()).isEqualTo("Back artist");

        int calls = provider.calls.get();
        String path = "/api/decks/" + id(created);
        JsonNode repeated = expect(owner, "PUT", path, body, 200);
        assertThat(repeated.path("commanders")).isEqualTo(created.path("commanders"));
        // The stale gameplay printing is validated; the identical selected art is not refreshed.
        assertThat(provider.calls.get()).isEqualTo(calls + 1);
        int after = provider.calls.get();
        JsonNode renamed = expect(owner, "PUT", path, "{\"name\":\"Renamed\"}", 200);
        assertThat(renamed.path("commanders")).isEqualTo(created.path("commanders"));
        assertThat(provider.calls.get()).isEqualTo(after);
        String stale = json.writeValueAsString(Map.of("name", "Legacy", "commanders",
                List.of(new CommanderInput(new CommanderSelectionRef(gameplayId, null), null))));
        expect(owner, "PUT", path, stale, 400);
        assertThat(read(owner, id(created)).path("commanders")).isEqualTo(created.path("commanders"));
    }

    @Test
    void omittedFaceOnSingleBackImageIsAnOfflineNoOp() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode printing = card("Front // Back", "");
        printing.put("layout", "transform");
        printing.remove("image_uris");
        ObjectNode front = face("Front", "Front rules");
        front.remove("image_uris");
        printing.set("card_faces", json.valueToTree(List.of(front, face("Back", "Back rules"))));
        UUID printingId = store(printing);
        CommanderInput input = new CommanderInput(new CommanderSelectionRef(printingId, null), null,
                new ArtworkInput(printingId, null));
        String body = json.writeValueAsString(Map.of("name", "Back image", "commanders", List.of(input)));
        JsonNode created = expect(owner, "POST", "/api/decks", body, 201);
        assertThat(created.path("commanders").get(0).path("artworkFaceIndex").asInt()).isEqualTo(1);
        int calls = provider.calls.get();
        provider.offline = true;
        JsonNode repeated = expect(owner, "PUT", "/api/decks/" + id(created), body, 200);
        assertThat(repeated).isEqualTo(created);
        assertThat(provider.calls.get()).isEqualTo(calls);
        provider.offline = false;
    }

    @Test
    void explicitSelectionOfAnUnavailableDefaultImageIsRejected() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode printing = card("No image", "");
        printing.remove("image_uris");
        UUID printingId = store(printing);
        JsonNode created = expect(owner, "POST", "/api/decks", json.writeValueAsString(Map.of(
                "name", "Default", "commanders", List.of(new CommanderInput(
                        new CommanderSelectionRef(printingId, null), null)))), 201);
        String explicit = json.writeValueAsString(Map.of("name", "Explicit", "commanders", List.of(
                new CommanderInput(new CommanderSelectionRef(printingId, null), null,
                        new ArtworkInput(printingId, null)))));
        expect(owner, "PUT", "/api/decks/" + id(created), explicit, 400);
        assertThat(read(owner, id(created))).isEqualTo(created);
    }

    @Test
    void companionAndCommanderArtworkSaveAtomicallyAndRejectBadInputs() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode commander = card("Commander", "");
        UUID commanderId = store(commander);
        ObjectNode companion = card("Companion", "Companion — Test condition.");
        companion.putArray("keywords").add("Companion");
        UUID companionId = store(companion);
        ObjectNode otherArt = companion.deepCopy();
        otherArt.put("id", UUID.randomUUID().toString()).put("artist", "Other artist");
        UUID companionArt = store(otherArt);
        CommanderInput selectedCommander = new CommanderInput(new CommanderSelectionRef(commanderId, null), null,
                new ArtworkInput(commanderId, null));
        CompanionInput selectedCompanion = new CompanionInput(new CommanderSelectionRef(companionId, null),
                new ArtworkInput(companionArt, null));
        String body = json.writeValueAsString(Map.of("name", "Complete", "commanders", List.of(selectedCommander),
                "companion", selectedCompanion));
        assertThat(body).as(body).doesNotContain("\"artworkFaceIndex\":null", "\"artwork\":null");
        int requiredCalls = provider.calls.get();
        JsonNode created = expect(owner, "POST", "/api/decks", body, 201);
        assertThat(provider.calls.get()).isEqualTo(requiredCalls + 3);
        assertThat(created.path("companion").path("scryfallCardId").asText()).isEqualTo(companionArt.toString());
        assertThat(created.path("companion").path("cardFaces").get(0).path("name").asText()).isEqualTo("Companion");
        assertThat(created.path("commanders").get(0).path("cardFaces").get(0).path("name").asText()).isEqualTo("Commander");
        String path = "/api/decks/" + id(created);
        for (String artwork : List.of("null", "{}", "{\"scryfallCardId\":\"bad\"}",
                "{\"scryfallCardId\":\"" + commanderId + "\",\"artworkFaceIndex\":null}",
                "{\"scryfallCardId\":\"" + commanderId + "\",\"imageUrl\":\"https://evil.test\"}")) {
            expect(owner, "PUT", path, "{\"name\":\"Invalid\",\"commanders\":[{\"selectionRef\":{\"scryfallCardId\":\""
                    + commanderId + "\"},\"artwork\":" + artwork + "}]}", 400);
            assertThat(read(owner, id(created))).isEqualTo(created);
        }
        for (String artwork : List.of("null", "{\"scryfallCardId\":\"" + companionArt
                + "\",\"artworkFaceIndex\":null}", "{\"scryfallCardId\":\"" + companionArt
                + "\",\"oracleId\":\"fake\"}")) {
            expect(owner, "PUT", path, "{\"name\":\"Invalid\",\"companion\":{\"selectionRef\":{\"scryfallCardId\":\""
                    + companionId + "\"},\"artwork\":" + artwork + "}}", 400);
            assertThat(read(owner, id(created))).isEqualTo(created);
        }
        UUID wrong = store(card("Wrong", ""));
        String wrongArt = json.writeValueAsString(Map.of("name", "Wrong", "commanders", List.of(
                new CommanderInput(new CommanderSelectionRef(commanderId, null), null, new ArtworkInput(wrong, null)))));
        expect(owner, "PUT", path, wrongArt, 400);
        assertThat(read(owner, id(created))).isEqualTo(created);
        provider.offline = true;
        expect(owner, "PUT", path, body.replace("Complete", "Outage"), 503);
        provider.offline = false;
        assertThat(read(owner, id(created))).isEqualTo(created);
    }

    @Test
    void keyedCreationReplaysCurrentStateAndIsOwnerScopedUnderConcurrency() throws Exception {
        Actor owner = register("owner", "Owner");
        Actor other = register("other", "Other");
        UUID printing = store(card("Commander", ""));
        String body = json.writeValueAsString(Map.of("name", "First", "commanders",
                List.of(new CommanderInput(new CommanderSelectionRef(printing, null), null))));
        assertThat(body).as(body).doesNotContain("\"artwork\":null");
        String key = UUID.randomUUID().toString();
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<HttpResponse<String>> first = executor.submit(() -> { start.await(); return send(owner, "POST", "/api/decks", body, key); });
            Future<HttpResponse<String>> second = executor.submit(() -> { start.await(); return send(owner, "POST", "/api/decks", body, key); });
            start.countDown();
            HttpResponse<String> a = first.get();
            HttpResponse<String> b = second.get();
            assertThat(List.of(a.statusCode(), b.statusCode())).as(a.body() + " / " + b.body())
                    .containsExactlyInAnyOrder(201, 200);
            assertThat(id(json.readTree(a.body()))).isEqualTo(id(json.readTree(b.body())));
        }
        assertThat(decks.count()).isEqualTo(1);
        JsonNode saved = read(owner, id(json.readTree(send(owner, "POST", "/api/decks", body, key).body())));
        expect(owner, "PUT", "/api/decks/" + id(saved), "{\"name\":\"Updated\"}", 200);
        HttpResponse<String> changedReplay = send(owner, "POST", "/api/decks", body.replace("First", "Changed"), key);
        assertThat(changedReplay.statusCode()).isEqualTo(200);
        assertThat(json.readTree(changedReplay.body()).path("name").asText()).isEqualTo("Updated");
        assertThat(send(other, "POST", "/api/decks", body, key).statusCode()).isEqualTo(201);
        assertThat(decks.count()).isEqualTo(2);
        assertThat(send(owner, "POST", "/api/decks", body, "bad").statusCode()).isEqualTo(400);
    }

    @Test
    void chosenColorChangePreservesArtworkFacesAndTokenRetryState() throws Exception {
        Actor owner = register("owner", "Owner");
        String name = "The Prismatic Piper";
        ObjectNode original = card(name, "If " + name + " is your commander, choose a color before the game begins. "
                + name + " is the chosen color.");
        UUID gameplay = store(original);
        ObjectNode alternate = original.deepCopy().put("id", UUID.randomUUID().toString())
                .put("artist", "Chosen artist");
        UUID artwork = store(alternate);
        CommanderInput selected = new CommanderInput(new CommanderSelectionRef(gameplay, null), "R",
                new ArtworkInput(artwork, null));
        JsonNode created = expect(owner, "POST", "/api/decks", json.writeValueAsString(Map.of("name", "Colors",
                "commanders", List.of(selected))), 201);
        Map<String, Object> retry = jdbc.queryForMap("SELECT token_generation, token_due_at, token_attempts, token_claim"
                + " FROM deck_commanders WHERE deck_id = ?", id(created));
        CommanderInput changed = new CommanderInput(new CommanderSelectionRef(artwork, null), "U");
        JsonNode updated = expect(owner, "PUT", "/api/decks/" + id(created), json.writeValueAsString(
                Map.of("name", "Colors", "commanders", List.of(changed))), 200);
        JsonNode beforeSlot = created.path("commanders").get(0);
        JsonNode afterSlot = updated.path("commanders").get(0);
        for (String field : List.of("selectionRef", "scryfallCardId", "artworkFaceIndex", "artCropUrl", "artist",
                "scryfallUri", "cardFaces", "relatedTokens")) {
            assertThat(afterSlot.path(field)).as(field).isEqualTo(beforeSlot.path(field));
        }
        assertThat(afterSlot.path("chosenColor").asText()).isEqualTo("U");
        assertThat(jdbc.queryForMap("SELECT token_generation, token_due_at, token_attempts, token_claim"
                + " FROM deck_commanders WHERE deck_id = ?", id(created))).isEqualTo(retry);
    }

    @Test
    void reorderingCommandersWithCompanionArtworkPreservesTheirSnapshotsAndTokens() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode first = card("First", "Partner");
        first.putArray("keywords").add("Partner");
        ObjectNode second = card("Second", "Partner");
        second.putArray("keywords").add("Partner");
        ObjectNode companion = card("Companion", "Companion — Test condition.");
        companion.putArray("keywords").add("Companion");
        UUID firstId = store(first);
        UUID secondId = store(second);
        UUID companionId = store(companion);
        UUID firstArtworkId = store(first.deepCopy().put("id", UUID.randomUUID().toString()));
        UUID companionArtworkId = store(companion.deepCopy().put("id", UUID.randomUUID().toString()));
        CommanderInput firstInput = new CommanderInput(new CommanderSelectionRef(firstId, null), null,
                new ArtworkInput(firstArtworkId, null));
        CommanderInput secondInput = new CommanderInput(new CommanderSelectionRef(secondId, null), null);
        String create = json.writeValueAsString(Map.of("name", "Pair", "commanders", List.of(firstInput, secondInput),
                "companion", new CompanionInput(new CommanderSelectionRef(companionId, null))));
        JsonNode saved = expect(owner, "POST", "/api/decks", create, 201);
        String tokenSql = "SELECT oracle_id, related_tokens, token_generation, token_due_at, token_attempts,"
                + " token_claim, token_last_failure FROM deck_commanders WHERE deck_id = ? ORDER BY oracle_id";
        List<Map<String, Object>> tokenState = jdbc.queryForList(tokenSql, id(saved));

        CompanionInput changedCompanion = new CompanionInput(new CommanderSelectionRef(companionId, null),
                new ArtworkInput(companionArtworkId, null));
        String path = "/api/decks/" + id(saved);
        String swap = json.writeValueAsString(Map.of("name", "Swapped", "commanders", List.of(secondInput, firstInput),
                "companion", changedCompanion));
        // The saved first-Commander artwork printing is absent from the mandatory gameplay lookups.
        provider.failAndGoOfflineAt = firstArtworkId;
        JsonNode reordered = expect(owner, "PUT", path, swap, 200);
        provider.failAndGoOfflineAt = null;
        assertThat(provider.offline).isFalse();
        assertThat(reordered.path("commanders").get(0).path("oracleId").asText())
                .isEqualTo(second.path("oracle_id").asText());
        assertThat(reordered.path("commanders").get(1).path("oracleId").asText())
                .isEqualTo(first.path("oracle_id").asText());
        for (String field : List.of("selectionRef", "scryfallCardId", "artworkFaceIndex", "artCropUrl", "artist",
                "scryfallUri", "cardFaces", "relatedTokens")) {
            assertThat(reordered.path("commanders").get(1).path(field))
                    .as(field).isEqualTo(saved.path("commanders").get(0).path(field));
        }
        assertThat(reordered.path("companion").path("scryfallCardId").asText())
                .isEqualTo(companionArtworkId.toString());
        assertThat(jdbc.queryForList(tokenSql, id(saved))).isEqualTo(tokenState);

        String swapBack = json.writeValueAsString(Map.of("name", "Original order", "commanders", List.of(
                new CommanderInput(new CommanderSelectionRef(firstArtworkId, null), null), secondInput),
                "companion", changedCompanion));
        JsonNode originalOrder = expect(owner, "PUT", path, swapBack, 200);
        assertThat(originalOrder.path("commanders").get(0).path("scryfallCardId").asText())
                .isEqualTo(firstArtworkId.toString());
        assertThat(jdbc.queryForList(tokenSql, id(saved))).isEqualTo(tokenState);
    }

    @Test
    void usedArchivedDeckAllowsArtworkAndSecondRequiredFailureRollsBack() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode first = card("First", "Partner");
        first.putArray("keywords").add("Partner");
        ObjectNode second = card("Second", "Partner");
        second.putArray("keywords").add("Partner");
        UUID firstId = store(first);
        UUID secondId = store(second);
        List<CommanderInput> inputs = List.of(new CommanderInput(new CommanderSelectionRef(firstId, null), null),
                new CommanderInput(new CommanderSelectionRef(secondId, null), null));
        JsonNode created = expect(owner, "POST", "/api/decks", json.writeValueAsString(
                Map.of("name", "Pair", "commanders", inputs)), 201);
        ObjectNode firstArt = first.deepCopy().put("id", UUID.randomUUID().toString()).put("artist", "New first");
        ObjectNode secondArt = second.deepCopy().put("id", UUID.randomUUID().toString()).put("artist", "New second");
        UUID firstArtId = store(firstArt);
        UUID secondArtId = store(secondArt);
        List<CommanderInput> changed = List.of(new CommanderInput(new CommanderSelectionRef(firstId, null), null,
                new ArtworkInput(firstArtId, null)), new CommanderInput(new CommanderSelectionRef(secondId, null), null,
                new ArtworkInput(secondArtId, null)));
        String path = "/api/decks/" + id(created);
        String body = json.writeValueAsString(Map.of("name", "Changed", "commanders", changed));
        provider.failAndGoOfflineAt = secondArtId;
        expect(owner, "PUT", path, body, 503);
        provider.failAndGoOfflineAt = null;
        provider.offline = false;
        assertThat(read(owner, id(created))).isEqualTo(created);
        transactions.executeWithoutResult(status -> decks.findById(id(created)).orElseThrow().markUsed());
        expect(owner, "POST", path + "/archive", "", 200);
        JsonNode updated = expect(owner, "PUT", path, body, 200);
        assertThat(updated.path("everUsed").asBoolean()).isTrue();
        assertThat(updated.path("archived").asBoolean()).isTrue();
        assertThat(updated.path("commanders").get(0).path("artist").asText()).isEqualTo("New first");
        assertThat(updated.path("commanders").get(1).path("artist").asText()).isEqualTo("New second");
    }

    @Test
    void quickProfileCreationSharesContractAndClaimClearsConflictingKey() throws Exception {
        Fixture f = fixture();
        UUID profile = UUID.fromString(expect(f.member(), "POST", "/api/groups/" + f.groupId()
                + "/quick-profiles", "", 201).path("userId").asText());
        String key = UUID.randomUUID().toString();
        String body = deckBody("Keyed", "Krenko", List.of("R"));
        UUID accountDeck = id(json.readTree(send(f.member(), "POST", "/api/decks", body, key).body()));
        String profilePath = "/api/groups/" + f.groupId() + "/quick-profiles/" + profile + "/decks";
        HttpResponse<String> created = send(f.member(), "POST", profilePath, body, key);
        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        UUID profileDeck = id(json.readTree(created.body()));
        assertThat(send(f.creator(), "POST", profilePath, body.replace("Keyed", "Replay"), key).statusCode()).isEqualTo(200);
        String code = expect(f.owner(), "POST", "/api/groups/" + f.groupId()
                + "/quick-profiles/" + profile + "/invitation", "", 201).path("code").asText();
        expect(f.member(), "POST", "/api/profile-invitations/" + code + "/accept", "", 204);
        assertThat(decks.findById(profileDeck).orElseThrow().getOwnerId()).isEqualTo(f.member().id());
        assertThat(decks.findById(profileDeck).orElseThrow().getIdempotencyKey()).isNull();
        assertThat(decks.findById(accountDeck).orElseThrow().getIdempotencyKey()).isEqualTo(UUID.fromString(key));
        assertThat(send(f.member(), "POST", "/api/decks", body, key).statusCode()).isEqualTo(200);
    }

    @Test
    void pauperCommanderUsesGameplayEligibilityAndSelectedArtworkPrinting() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode gameplay = card("PDH Commander", "").put("testPdhEligible", true);
        UUID gameplayId = store(gameplay);
        ObjectNode artwork = gameplay.deepCopy().put("id", UUID.randomUUID().toString())
                .put("artist", "Alternate artist").put("testPdhEligible", false);
        UUID artworkId = store(artwork);
        CommanderInput input = new CommanderInput(new CommanderSelectionRef(gameplayId, null), null,
                new ArtworkInput(artworkId, null));
        JsonNode saved = expect(owner, "POST", "/api/decks", json.writeValueAsString(Map.of("name", "PDH",
                "format", "PAUPER_COMMANDER", "commanders", List.of(input))), 201);
        assertThat(saved.path("format").asText()).isEqualTo("PAUPER_COMMANDER");
        assertThat(saved.path("commanders").get(0).path("scryfallCardId").asText()).isEqualTo(artworkId.toString());
        assertThat(saved.path("commanders").get(0).path("artist").asText()).isEqualTo("Alternate artist");
    }

    @Test
    void optionalTokenFailureOnFullArtworkSaveKeepsTheDeckAndQueuesRetry() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode original = card("Commander", "");
        UUID gameplayId = store(original);
        JsonNode created = expect(owner, "POST", "/api/decks", json.writeValueAsString(Map.of("name", "Tokens",
                "commanders", List.of(new CommanderInput(new CommanderSelectionRef(gameplayId, null), null)))), 201);
        ObjectNode alternate = original.deepCopy().put("id", UUID.randomUUID().toString());
        alternate.withArray("all_parts").addObject().put("component", "token")
                .put("id", UUID.randomUUID().toString());
        UUID artworkId = store(alternate);
        CommanderInput changed = new CommanderInput(new CommanderSelectionRef(gameplayId, null), null,
                new ArtworkInput(artworkId, null));
        JsonNode updated = expect(owner, "PUT", "/api/decks/" + id(created), json.writeValueAsString(Map.of(
                "name", "Tokens", "commanders", List.of(changed))), 200);
        assertThat(updated.path("commanders").get(0).path("scryfallCardId").asText()).isEqualTo(artworkId.toString());
        assertThat(updated.path("commanders").get(0).path("relatedTokens").isNull()).isTrue();
        assertThat(jdbc.queryForMap("SELECT token_generation, token_due_at FROM deck_commanders WHERE deck_id = ?",
                id(created))).containsKeys("token_generation", "token_due_at").doesNotContainValue(null);
    }

    @Test
    void optionalTokenOutageCannotPreventLaterMandatoryArtworkValidation() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode first = card("First", "Partner");
        first.putArray("keywords").add("Partner");
        UUID tokenId = UUID.randomUUID();
        first.withArray("all_parts").addObject().put("component", "token").put("id", tokenId.toString());
        ObjectNode second = card("Second", "Partner");
        second.putArray("keywords").add("Partner");
        UUID firstId = store(first);
        UUID secondId = store(second);
        UUID artId = store(second.deepCopy().put("id", UUID.randomUUID().toString()));
        List<CommanderInput> pair = List.of(new CommanderInput(new CommanderSelectionRef(firstId, null), null),
                new CommanderInput(new CommanderSelectionRef(secondId, null), null, new ArtworkInput(artId, null)));
        provider.failAndGoOfflineAt = tokenId;
        JsonNode saved = expect(owner, "POST", "/api/decks", json.writeValueAsString(
                Map.of("name", "Pair", "commanders", pair)), 201);
        provider.failAndGoOfflineAt = null;
        provider.offline = false;
        assertThat(saved.path("commanders").get(0).path("relatedTokens").isNull()).isTrue();
        assertThat(saved.path("commanders").get(1).path("scryfallCardId").asText()).isEqualTo(artId.toString());
    }

    private JsonNode read(Actor owner, UUID deckId) throws Exception {
        return expect(owner, "GET", "/api/decks", "", 200).valueStream()
                .filter(deck -> deck.path("id").asText().equals(deckId.toString())).findFirst().orElseThrow();
    }

    private ObjectNode card(String name, String text) {
        ObjectNode card = json.createObjectNode();
        card.put("object", "card").put("id", UUID.randomUUID().toString()).put("oracle_id", UUID.randomUUID().toString())
                .put("name", name).put("lang", "en").put("layout", "normal")
                .put("type_line", "Legendary Creature — Test").put("oracle_text", text);
        card.putObject("legalities").put("commander", "legal");
        card.putArray("color_identity").add("G");
        card.put("artist", name + " artist").put("scryfall_uri", "https://scryfall.com/card/test");
        card.putObject("image_uris").put("art_crop", "https://cards.scryfall.io/art_crop/" + UUID.randomUUID() + ".jpg");
        return card;
    }

    private ObjectNode face(String name, String text) {
        ObjectNode face = card(name, text);
        face.remove(List.of("id", "oracle_id", "layout", "legalities"));
        return face;
    }

    private UUID store(ObjectNode card) {
        UUID id = UUID.fromString(card.path("id").asText());
        CommanderTestProvider.put(id, card.toString());
        return id;
    }
}
