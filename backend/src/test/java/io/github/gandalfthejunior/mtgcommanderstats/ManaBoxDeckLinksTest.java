package io.github.gandalfthejunior.mtgcommanderstats;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import io.github.gandalfthejunior.mtgcommanderstats.game.application.ManageGames.DeckSelectionSummary;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ManaBoxDeckLinksTest extends GameTestSupport {
    private static final String LINK = "https://manabox.app/decks/Synthetic-Mixed_123";
    private static final String OTHER_LINK = "https://manabox.app/decks/AnotherSyntheticId";

    @Test
    void ownerCreatesReplacesPreservesAndExplicitlyClearsLinksOffline() throws Exception {
        Actor owner = register("owner", "Owner");
        Actor other = register("other", "Other");
        ObjectNode payload = (ObjectNode) json.readTree(deckBody("Deck", "Karn", List.of()));
        payload.put("manaBoxUrl", LINK + "/");
        JsonNode created = expect(owner, "POST", "/api/decks", payload.toString(), 201);
        UUID deckId = id(created);
        String path = "/api/decks/" + deckId;
        assertThat(created.get("manaBoxUrl").asText()).isEqualTo(LINK);
        assertThat(decks.findById(deckId).orElseThrow().getManaBoxUrl()).isEqualTo(LINK);
        int calls = provider.calls.get();
        provider.offline = true;

        JsonNode preserved = expect(owner, "PUT", path, "{\"name\":\"Renamed\"}", 200);
        assertThat(preserved.get("manaBoxUrl").asText()).isEqualTo(LINK);
        JsonNode replaced = expect(owner, "PUT", path, linkBody("Renamed", OTHER_LINK), 200);
        assertThat(replaced.get("manaBoxUrl").asText()).isEqualTo(OTHER_LINK);
        assertDeckFactsUnchanged(created, replaced);
        assertThat(expect(owner, "GET", "/api/decks", "", 200).get(0)).isEqualTo(replaced);
        assertThat(expect(other, "GET", "/api/decks", "", 200).isEmpty()).isTrue();
        JsonNode cleared = expect(owner, "PUT", path, linkBody("Renamed", null), 200);
        assertThat(cleared.get("manaBoxUrl").isNull()).isTrue();
        assertThat(decks.findById(deckId).orElseThrow().getManaBoxUrl()).isNull();
        assertThat(expect(owner, "PUT", path, "{\"name\":\"Renamed\"}", 200)).isEqualTo(cleared);
        assertThat(provider.calls.get()).isEqualTo(calls);

        provider.offline = false;
        payload.putNull("manaBoxUrl");
        assertThat(expect(owner, "POST", "/api/decks", payload.toString(), 201).get("manaBoxUrl").isNull()).isTrue();
        payload.remove("manaBoxUrl");
        assertThat(expect(owner, "POST", "/api/decks", payload.toString(), 201).get("manaBoxUrl").isNull()).isTrue();
    }

    @Test
    void usedAndArchivedLinkEditsPreserveChosenColorArtworkAndGameFactsWithoutScryfall() throws Exception {
        Fixture f = fixture();
        UUID printing = UUID.randomUUID();
        CommanderTestProvider.put(printing, """
                {"object":"card","id":"%s","oracle_id":"%s","name":"The Prismatic Piper","lang":"en","layout":"normal",
                 "legalities":{"commander":"legal"},"type_line":"Legendary Creature — Shapeshifter",
                 "oracle_text":"If The Prismatic Piper is your commander, choose a color before the game begins. The Prismatic Piper is the chosen color.",
                 "color_identity":[],"image_uris":{"art_crop":"https://cards.scryfall.io/art_crop/synthetic.jpg"},
                 "artist":"Synthetic Artist","scryfall_uri":"https://scryfall.com/card/synthetic"}
                """.formatted(printing, UUID.randomUUID()));
        String path = "/api/decks/" + f.creatorDeck();
        expect(f.creator(), "PUT", path, """
                {"name":"Piper","commanders":[{"selectionRef":{"scryfallCardId":"%s"},"chosenColor":"R"}],"manaBoxUrl":"%s"}
                """.formatted(printing, LINK), 200);
        JsonNode game = expect(f.owner(), "POST", f.path(), body(f), 201);
        JsonNode used = ownedDeck(f.creator(), f.creatorDeck());
        JsonNode stats = expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", 200);
        int calls = provider.calls.get();
        provider.offline = true;
        JsonNode updated = expect(f.creator(), "PUT", path, linkBody("Piper", OTHER_LINK), 200);
        assertDeckFactsUnchanged(used, updated);
        assertThat(expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", 200)).isEqualTo(stats);
        JsonNode archived = expect(f.creator(), "POST", path + "/archive", "", 200);
        assertThat(archived.get("manaBoxUrl").asText()).isEqualTo(OTHER_LINK);
        JsonNode archivedStats = expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", 200);
        JsonNode cleared = expect(f.creator(), "PUT", path, linkBody("Piper", null), 200);
        assertDeckFactsUnchanged(archived, cleared);
        assertThat(cleared.get("everUsed").asBoolean()).isTrue();
        assertThat(cleared.get("archived").asBoolean()).isTrue();
        assertThat(cleared.get("commanders").get(0).get("chosenColor").asText()).isEqualTo("R");
        assertThat(cleared.get("commanders").get(0).get("artist").asText()).isEqualTo("Synthetic Artist");
        JsonNode history = expect(f.owner(), "GET", f.path(), "", 200).get(0);
        assertThat(history.get("id")).isEqualTo(game.get("id"));
        assertThat(history.get("participants").toString()).contains(f.creatorDeck().toString(), f.memberDeck().toString());
        assertThat(expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", 200)).isEqualTo(archivedStats);
        expect(f.creator(), "DELETE", path, "", 409);
        assertThat(provider.calls.get()).isEqualTo(calls);
    }

    @Test
    void invalidLinksAndJsonTypesRejectBothWritesBeforeProviderAccessAndNeverPartiallyWrite() throws Exception {
        Actor owner = register("owner", "Owner");
        UUID deckId = deck(owner);
        String path = "/api/decks/" + deckId;
        JsonNode before = expect(owner, "PUT", path, linkBody("Deck", LINK), 200);
        ObjectNode create = (ObjectNode) json.readTree(deckBody("New", "Karn", List.of()));
        int calls = provider.calls.get();
        provider.offline = true;
        for (String value : List.of("42", "true", "{}", "[]", "\"\"", "\"http://manabox.app/decks/a\"",
                "\"https://www.manabox.app/decks/a\"", "\"https://manabox.app.evil.example/decks/a\"",
                "\"https://manabox.app/decks/a/b\"", "\"https://manabox.app/decks/a?x=1\"",
                "\"https://manabox.app/decks/a#fragment\"", "\"https://user@manabox.app/decks/a\"",
                "\"https://manabox.app:444/decks/a\"", "\"https://manabox.app/decks/%2e%2e\"",
                "\"https://manabox.app/decks/a%2fb\"", "\"https://manabox.app/decks/a%5cb\"",
                "\"https://manabox.app/decks/%ZZ\"", "\"https://manabox.app/decks/a\\\\b\"")) {
            create.set("manaBoxUrl", json.readTree(value));
            expect(owner, "POST", "/api/decks", create.toString(), 400);
            expect(owner, "PUT", path, "{\"name\":\"Must not persist\",\"manaBoxUrl\":" + value + "}", 400);
            assertThat(ownedDeck(owner, deckId)).isEqualTo(before);
            assertThat(decks.count()).isEqualTo(1);
        }
        assertThat(provider.calls.get()).isEqualTo(calls);
    }

    @Test
    void laterValidationAndLifecycleFailuresRollBackValidLinkChanges() throws Exception {
        Fixture f = fixture();
        String path = "/api/decks/" + f.creatorDeck();
        JsonNode before = expect(f.creator(), "PUT", path, linkBody("Deck", LINK), 200);
        expect(f.creator(), "PUT", path, linkBody(" ", OTHER_LINK), 400);
        expect(f.creator(), "PUT", path, "{\"name\":\"Changed\",\"manaBoxUrl\":null,\"commanders\":[]}", 400);
        assertThat(ownedDeck(f.creator(), f.creatorDeck())).isEqualTo(before);
        expect(f.owner(), "POST", f.path(), body(f), 201);
        ObjectNode change = (ObjectNode) json.readTree(deckBody("Illegal", "Karn", List.of()));
        change.put("manaBoxUrl", OTHER_LINK);
        expect(f.creator(), "PUT", path, change.toString(), 409);
        ObjectNode used = (ObjectNode) before.deepCopy();
        used.put("everUsed", true);
        before = used;
        assertThat(ownedDeck(f.creator(), f.creatorDeck())).isEqualTo(before);
        provider.offline = true;
        // The link change also rolls back if a changed Commander cannot be resolved.
        expect(f.creator(), "PUT", path, change.toString(), 503);
        assertThat(ownedDeck(f.creator(), f.creatorDeck())).isEqualTo(before);
    }

    @Test
    void onlyTheOwnerMayReplaceOrRemoveLinksAndWritesRequireCsrf() throws Exception {
        Actor owner = register("owner", "Owner");
        Actor other = register("other", "Other");
        UUID deckId = deck(owner);
        String path = "/api/decks/" + deckId;
        JsonNode before = expect(owner, "PUT", path, linkBody("Deck", LINK), 200);
        for (String link : new String[] {OTHER_LINK, null}) {
            String body = linkBody("Deck", link);
            expect(other, "PUT", path, body, 403);
            expect(null, "PUT", path, body, 403);
            expect(new Actor(owner.cookie(), null, owner.id()), "PUT", path, body, 403);
            expect(new Actor(owner.cookie(), "invalid", owner.id()), "PUT", path, body, 403);
        }
        expect(null, "GET", "/api/decks", "", 401);
        assertThat(send(other, "GET", path, "").statusCode()).isEqualTo(405);
        assertThat(ownedDeck(owner, deckId)).isEqualTo(before);
    }

    @Test
    void gameDetailsAndMemberSelectionExposeLinksWithoutChangingOtherGameResponses() throws Exception {
        Fixture f = fixture();
        expect(f.creator(), "PUT", "/api/decks/" + f.creatorDeck(), linkBody("Deck", LINK), 200);
        expect(f.member(), "PUT", "/api/decks/" + f.memberDeck(), linkBody("Deck", OTHER_LINK), 200);
        // An active but uninvolved member's other deck must never appear in these details.
        expect(f.owner(), "PUT", "/api/decks/" + f.ownerDeck(), linkBody("Deck", "https://manabox.app/decks/UnrelatedSyntheticId"), 200);
        JsonNode created = expect(f.owner(), "POST", f.path(), body(f), 201);
        String path = f.path() + "/" + id(created);
        assertThat(created.toString()).doesNotContain("manaBoxUrl", LINK, OTHER_LINK);
        assertThat(expect(f.owner(), "GET", f.path(), "", 200).toString()).doesNotContain("manaBoxUrl");
        assertThat(expect(f.owner(), "GET", f.selection(f.creator().id()), "", 200).get(0).get("manaBoxUrl").asText())
                .isEqualTo(LINK);
        assertThat(expect(f.owner(), "PUT", path, body(f), 200).toString()).doesNotContain("manaBoxUrl");
        expect(f.creator(), "POST", "/api/decks/" + f.creatorDeck() + "/archive", "", 200);
        int calls = provider.calls.get();
        provider.offline = true;
        JsonNode details = expect(f.member(), "GET", path, "", 200);
        assertThat(participantDeck(details, f.creator().id()).get("manaBoxUrl").asText()).isEqualTo(LINK);
        assertThat(participantDeck(details, f.creator().id()).get("archived").asBoolean()).isTrue();
        assertThat(participantDeck(details, f.member().id()).get("manaBoxUrl").asText()).isEqualTo(OTHER_LINK);
        assertThat(details.toString()).doesNotContain("UnrelatedSyntheticId");
        expect(null, "GET", path, "", 401);
        expect(f.outsider(), "GET", path, "", 403);
        UUID otherGroup = id(expect(f.outsider(), "POST", "/api/groups", "{\"name\":\"Other\"}", 201));
        expect(f.outsider(), "GET", "/api/groups/" + otherGroup + "/games/" + id(created), "", 404);
        expect(f.outsider(), "GET", f.path() + "/" + UUID.randomUUID(), "", 403);

        expect(f.creator(), "DELETE", "/api/groups/" + f.groupId() + "/membership", "", 204);
        JsonNode afterLeave = expect(f.member(), "GET", path, "", 200);
        JsonNode formerDeck = participantDeck(afterLeave, f.creator().id());
        assertThat(formerDeck.has("manaBoxUrl")).isFalse();
        assertThat(formerDeck.get("id").asText()).isEqualTo(f.creatorDeck().toString());
        assertThat(participantDeck(afterLeave, f.member().id()).get("manaBoxUrl").asText()).isEqualTo(OTHER_LINK);
        assertThat(afterLeave.toString()).doesNotContain(LINK);
        expect(f.creator(), "GET", path, "", 403);
        expect(f.creator(), "GET", f.path(), "", 403);
        assertThat(ownedDeck(f.creator(), f.creatorDeck()).get("manaBoxUrl").asText()).isEqualTo(LINK);
        expect(f.owner(), "PUT", path, body(f), 200);
        expect(f.creator(), "PUT", "/api/decks/" + f.creatorDeck(), linkBody("Renamed former deck", OTHER_LINK), 200);
        assertThat(expect(f.member(), "GET", path, "", 200).toString()).doesNotContain(LINK);
        groupService.join(f.creator().id(), groupService.createInvitation(f.owner().id(), f.groupId()).code());
        JsonNode rejoined = expect(f.creator(), "GET", path, "", 200);
        assertThat(participantDeck(rejoined, f.creator().id()).get("manaBoxUrl").asText()).isEqualTo(OTHER_LINK);
        assertThat(participantDeck(rejoined, f.creator().id()).get("name").asText()).isEqualTo("Renamed former deck");
        assertThat(provider.calls.get()).isEqualTo(calls);
    }

    @Test
    void memberSelectionUsesCurrentValidLinksAndKeepsUnlinkedArchivedAndOrderingBoundaries() throws Exception {
        Fixture f = fixture();
        String memberPath = "/api/decks/" + f.memberDeck();
        UUID alpha = id(expect(f.member(), "POST", "/api/decks", deckBody("Alpha", "Krenko", List.of("R")), 201));
        UUID zulu = id(expect(f.member(), "POST", "/api/decks", deckBody("Zulu", "Krenko", List.of("R")), 201));
        UUID archived = id(expect(f.member(), "POST", "/api/decks", deckBody("Hidden", "Krenko", List.of("R")), 201));
        expect(f.member(), "PUT", memberPath, linkBody("Deck", LINK + "/"), 200);
        expect(f.member(), "PUT", "/api/decks/" + zulu, linkBody("Zulu", OTHER_LINK), 200);
        expect(f.member(), "PUT", "/api/decks/" + archived, linkBody("Hidden", LINK), 200);
        expect(f.member(), "POST", "/api/decks/" + archived + "/archive", "", 200);
        expect(f.owner(), "POST", f.path(), body(f), 201);

        int calls = provider.calls.get();
        provider.offline = true;
        JsonNode selected = expect(f.creator(), "GET", f.selection(f.member().id()), "", 200);
        assertThat(selected).hasSize(3);
        assertThat(List.of(id(selected.get(0)), id(selected.get(1)), id(selected.get(2))))
                .containsExactly(alpha, f.memberDeck(), zulu);
        assertThat(selected.get(0).has("manaBoxUrl")).isFalse();
        assertThat(selected.get(1).get("manaBoxUrl").asText()).isEqualTo(LINK);
        assertThat(selected.get(2).get("manaBoxUrl").asText()).isEqualTo(OTHER_LINK);
        assertThat(selected.get(1).get("commanders")).isEqualTo(ownedDeck(f.member(), f.memberDeck()).get("commanders"));
        assertThat(selected.get(1).get("colorIdentity")).isEqualTo(json.readTree("[\"R\"]"));
        assertThat(selected.toString()).doesNotContain(archived.toString(), "everUsed", "archived");
        assertThat(expect(f.member(), "GET", f.selection(f.member().id()), "", 200)).isEqualTo(selected);

        expect(f.member(), "PUT", memberPath, linkBody("Deck", OTHER_LINK), 200);
        assertThat(expect(f.creator(), "GET", f.selection(f.member().id()), "", 200).get(1).get("manaBoxUrl").asText())
                .isEqualTo(OTHER_LINK);
        expect(f.member(), "PUT", memberPath, linkBody("Deck", null), 200);
        assertThat(expect(f.creator(), "GET", f.selection(f.member().id()), "", 200).get(1).has("manaBoxUrl"))
                .isFalse();

        jdbc.update("UPDATE decks SET mana_box_url = ? WHERE id = ?", "https://manabox.app.evil.example/decks/a", zulu);
        assertThat(expect(f.creator(), "GET", f.selection(f.member().id()), "", 200).get(2).has("manaBoxUrl"))
                .isFalse();
        jdbc.update("UPDATE decks SET mana_box_url = ? WHERE id = ?", OTHER_LINK + "/", zulu);
        assertThat(expect(f.creator(), "GET", f.selection(f.member().id()), "", 200).get(2).has("manaBoxUrl"))
                .isFalse();
        assertThat(provider.calls.get()).isEqualTo(calls);
    }

    @Test
    void memberSelectionLinksRequireCurrentSameGroupMembershipIncludingQuickProfiles() throws Exception {
        Fixture f = fixture();
        expect(f.creator(), "PUT", "/api/decks/" + f.creatorDeck(), linkBody("Deck", LINK), 200);
        String profiles = "/api/groups/" + f.groupId() + "/quick-profiles";
        UUID profile = UUID.fromString(expect(f.member(), "POST", profiles, "", 201).get("userId").asText());
        String profileDecks = profiles + "/" + profile + "/decks";
        ObjectNode payload = (ObjectNode) json.readTree(deckBody("Quick deck", "Krenko", List.of("R")));
        payload.put("manaBoxUrl", OTHER_LINK + "/");
        UUID quickDeck = id(expect(f.member(), "POST", profileDecks, payload.toString(), 201));
        assertThat(expect(f.owner(), "GET", f.selection(profile), "", 200).get(0).get("manaBoxUrl").asText())
                .isEqualTo(OTHER_LINK);
        assertThat(id(expect(f.creator(), "GET", f.selection(profile), "", 200).get(0))).isEqualTo(quickDeck);
        assertThat(expect(f.creator(), "GET", f.selection(f.creator().id()), "", 200).get(0).get("manaBoxUrl").asText())
                .isEqualTo(LINK);
        expect(null, "GET", f.selection(profile), "", 401);
        assertThat(send(null, "GET", f.selection(profile), "").body()).doesNotContain(OTHER_LINK);
        assertThat(expect(f.outsider(), "GET", f.selection(profile), "", 403).toString()).doesNotContain(OTHER_LINK);
        UUID otherGroup = id(expect(f.outsider(), "POST", "/api/groups", "{\"name\":\"Other\"}", 201));
        assertThat(expect(f.outsider(), "GET", "/api/groups/" + otherGroup + "/members/" + profile + "/decks", "", 404)
                .toString()).doesNotContain(OTHER_LINK);
        expect(f.creator(), "DELETE", "/api/groups/" + f.groupId() + "/membership", "", 204);
        assertThat(expect(f.creator(), "GET", f.selection(profile), "", 403).toString()).doesNotContain(OTHER_LINK);
        assertThat(expect(f.owner(), "GET", f.selection(f.creator().id()), "", 404).toString()).doesNotContain(LINK);
        expect(f.owner(), "DELETE", profiles + "/" + profile, "", 204);
        assertThat(expect(f.member(), "GET", f.selection(profile), "", 404).toString()).doesNotContain(OTHER_LINK);
    }

    @Test
    void memberSelectionHoldsGroupLockUntilItsAuthorizedResponseIsCommitted() throws Exception {
        Fixture f = fixture();
        expect(f.creator(), "PUT", "/api/decks/" + f.creatorDeck(), linkBody("Deck", LINK), 200);
        CountDownLatch readComplete = new CountDownLatch(1);
        CountDownLatch releaseRead = new CountDownLatch(1);
        CountDownLatch leaveStarted = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<List<DeckSelectionSummary>> read =
                    executor.submit(() -> transactions.execute(status -> {
                        List<DeckSelectionSummary> result = gameService.eligibleDecks(f.owner().id(), f.groupId(),
                                f.creator().id());
                        readComplete.countDown();
                        try {
                            if (!releaseRead.await(10, TimeUnit.SECONDS)) {
                                throw new AssertionError("Timed out waiting to finish authorized read");
                            }
                        } catch (InterruptedException exception) {
                            Thread.currentThread().interrupt();
                            throw new AssertionError(exception);
                        }
                        return result;
                    }));
            assertThat(readComplete.await(10, TimeUnit.SECONDS)).isTrue();
            Future<?> leave = executor.submit(() -> {
                leaveStarted.countDown();
                groupService.leave(f.creator().id(), f.groupId());
            });
            assertThat(leaveStarted.await(10, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> leave.get(250, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            releaseRead.countDown();
            assertThat(read.get(10, TimeUnit.SECONDS).get(0).manaBoxUrl()).isEqualTo(LINK);
            leave.get(10, TimeUnit.SECONDS);
        } finally {
            releaseRead.countDown();
        }
        assertThat(expect(f.owner(), "GET", f.selection(f.creator().id()), "", 404).toString())
                .doesNotContain(LINK);
    }

    private String linkBody(String name, String link) {
        ObjectNode body = json.createObjectNode().put("name", name);
        if (link == null) {
            body.putNull("manaBoxUrl");
        } else {
            body.put("manaBoxUrl", link);
        }
        return body.toString();
    }

    private JsonNode ownedDeck(Actor owner, UUID deckId) throws Exception {
        for (JsonNode deck : expect(owner, "GET", "/api/decks", "", 200)) {
            if (id(deck).equals(deckId)) {
                return deck;
            }
        }
        throw new AssertionError("Owned deck missing");
    }

    private JsonNode participantDeck(JsonNode game, UUID userId) {
        for (JsonNode participant : game.get("participants")) {
            if (participant.get("userId").asText().equals(userId.toString())) {
                return participant.get("deck");
            }
        }
        throw new AssertionError("Participant missing");
    }

    private void assertDeckFactsUnchanged(JsonNode before, JsonNode after) {
        ObjectNode expected = (ObjectNode) before.deepCopy();
        ObjectNode actual = (ObjectNode) after.deepCopy();
        for (String field : List.of("name", "manaBoxUrl")) {
            expected.remove(field);
            actual.remove(field);
        }
        assertThat(actual).isEqualTo(expected);
    }
}
