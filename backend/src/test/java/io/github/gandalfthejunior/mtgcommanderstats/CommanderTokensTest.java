package io.github.gandalfthejunior.mtgcommanderstats;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import io.github.gandalfthejunior.mtgcommanderstats.deck.application.CommanderTokenRetries.Job;
import io.github.gandalfthejunior.mtgcommanderstats.deck.application.CommanderTokenRetries;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.Deck;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckCommander;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.application.RelatedTokenLookup;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.application.ResolvedCommander;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.application.ScryfallLookup;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.ScryfallNormalizer;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClient;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClientException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@org.springframework.test.context.TestPropertySource(properties = "app.tokens.scheduling.enabled=false")
class CommanderTokensTest extends GameTestSupport {
    @Autowired
    private CommanderTokenRetries retries;
    @Autowired
    private RelatedTokenLookup tokens;

    @Test
    void exactOrderedDeduplicatedPrintingsAndPhysicalFacesReachAuthorizedOfflineReads() throws Exception {
        Fixture f = fixture();
        ObjectNode first = card("Soldier");
        first.put("layout", "double_faced_token");
        first.set("card_faces", json.valueToTree(List.of(card("Soldier front"), card("Unrelated physical back"))));
        first.remove("image_uris");
        ObjectNode second = card("Spirit");
        second.remove("image_uris");
        ObjectNode commander = linked(first, second);
        commander.withArray("all_parts").addObject().put("component", "meld_result").put("id", UUID.randomUUID().toString());
        commander.withArray("all_parts").add(commander.path("all_parts").get(0).deepCopy());
        store(commander);
        JsonNode saved = expect(f.creator(), "PUT", "/api/decks/" + f.creatorDeck(), configuration(commander), 200);
        JsonNode snapshot = saved.path("commanders").get(0).path("relatedTokens");
        assertThat(snapshot.size()).isEqualTo(2);
        assertThat(snapshot.get(0).path("scryfallCardId")).isEqualTo(first.path("id"));
        assertThat(snapshot.get(0).path("cardFaces").get(1).path("name").asText()).isEqualTo("Unrelated physical back");
        assertThat(snapshot.get(1).path("imageUrl").isNull()).isTrue();
        JsonNode game = expect(f.owner(), "POST", f.path(), body(f), 201);
        provider.offline = true;
        int calls = provider.calls.get();
        JsonNode own = expect(f.creator(), "GET", "/api/decks", "", 200).valueStream()
                .filter(deck -> id(deck).equals(f.creatorDeck())).findFirst().orElseThrow();
        assertThat(own.path("commanders").get(0).path("relatedTokens")).isEqualTo(snapshot);
        JsonNode member = expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/members/" + f.creator().id() + "/decks", "", 200)
                .valueStream().filter(deck -> id(deck).equals(f.creatorDeck())).findFirst().orElseThrow();
        assertThat(member.path("commanders").get(0).path("relatedTokens")).isEqualTo(snapshot);
        JsonNode details = expect(f.owner(), "GET", f.path() + "/" + id(game), "", 200);
        JsonNode participant = details.path("participants").valueStream()
                .filter(person -> person.path("deckId").asText().equals(f.creatorDeck().toString())).findFirst().orElseThrow();
        assertThat(participant.path("deck").path("commanders").get(0).path("relatedTokens")).isEqualTo(snapshot);
        expect(f.outsider(), "GET", f.path() + "/" + id(game), "", 403);
        assertThat(provider.calls.get()).isEqualTo(calls);
    }

    @Test
    void optionalFailureSavesPendingAndRecoversFromDurableStateWithoutResaving() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode token = card("Spirit");
        ObjectNode commander = linked(token);
        CommanderTestProvider.put(UUID.fromString(token.path("id").asText()), "{}");
        JsonNode saved = expect(owner, "POST", "/api/decks", configuration(commander), 201);
        UUID deck = id(saved);
        assertThat(saved.path("commanders").get(0).path("relatedTokens").isNull()).isTrue();
        due(deck);
        retries.retryDue();
        assertThat(jdbc.queryForObject("select token_attempts from deck_commanders where deck_id = ?", Integer.class, deck)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select token_due_at from deck_commanders where deck_id = ?", Timestamp.class, deck).toInstant())
                .isAfter(Instant.now());
        store(token);
        due(deck);
        // A fresh worker instance has no in-memory queue to restore.
        CommanderTokenRetries restarted = new CommanderTokenRetries(jdbc, transactions, tokens, provider);
        restarted.retryDue();
        provider.offline = true;
        int calls = provider.calls.get();
        JsonNode read = expect(owner, "GET", "/api/decks", "", 200).get(0);
        assertThat(read.path("commanders").get(0).path("relatedTokens").size()).isEqualTo(1);
        expect(owner, "PUT", "/api/decks/" + deck, "{\"name\":\"Offline rename\"}", 200);
        assertThat(provider.calls.get()).isEqualTo(calls);
        expect(owner, "POST", "/api/decks", configuration(commander), 503);
    }

    @Test
    void leasesExcludeDuplicateClaimsAndStaleResultsCannotOverwriteNewPrintingOrCompleteSnapshots() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode token = card("Spirit");
        ObjectNode commander = linked(token);
        CommanderTestProvider.put(UUID.fromString(token.path("id").asText()), "{}");
        UUID deck = id(expect(owner, "POST", "/api/decks", configuration(commander), 201));
        due(deck);
        CompletableFuture<Job> a = CompletableFuture.supplyAsync(retries::claim);
        CompletableFuture<Job> b = CompletableFuture.supplyAsync(retries::claim);
        List<Job> claimed = java.util.stream.Stream.of(a.join(), b.join()).filter(java.util.Objects::nonNull).toList();
        assertThat(claimed).hasSize(1);
        Job obsolete = claimed.getFirst();
        due(deck); // Expired lease after a simulated crash.
        Job replacementClaim = retries.claim();
        store(token);
        retries.complete(replacementClaim, tokens.resolve(UUID.fromString(commander.path("id").asText())));
        retries.complete(obsolete, List.of());
        retries.fail(obsolete);
        assertThat(jdbc.queryForObject("select related_tokens from deck_commanders where deck_id = ?", String.class, deck)).contains("Spirit");
        ObjectNode alternate = commander.deepCopy().put("id", UUID.randomUUID().toString());
        alternate.remove("all_parts");
        store(alternate);
        JsonNode artwork = expect(owner, "PUT", "/api/decks/" + deck + "/commanders/1/artwork",
                json.writeValueAsString(Map.of("scryfallCardId", alternate.path("id").asText())), 200);
        assertThat(artwork.path("commanders").get(0).path("relatedTokens").isEmpty()).isTrue();
        retries.complete(replacementClaim, tokens.resolve(UUID.fromString(commander.path("id").asText())));
        assertThat(jdbc.queryForObject("select related_tokens from deck_commanders where deck_id = ?", String.class, deck)).isEqualTo("[]");
        assertThat(retries.claim()).isNull();
    }

    @Test
    void legacyUnknownIsNotQueuedAndUnrelatedOfflineEditsPreserveIt() throws Exception {
        Actor owner = register("owner", "Owner");
        UUID deck = id(expect(owner, "POST", "/api/decks", configuration(card("Commander")), 201));
        jdbc.update("update deck_commanders set related_tokens = null, token_generation = null, token_due_at = null where deck_id = ?", deck);
        provider.offline = true;
        JsonNode saved = expect(owner, "PUT", "/api/decks/" + deck, "{\"name\":\"Legacy\"}", 200);
        assertThat(saved.path("commanders").get(0).path("relatedTokens").isNull()).isTrue();
        assertThat(retries.claim()).isNull();
    }

    @Test
    void providerCooldownIsPersistedAndRepeatedFailuresRemainEligible() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode token = card("Spirit");
        ObjectNode commander = linked(token);
        CommanderTestProvider.put(UUID.fromString(token.path("id").asText()), "{}");
        UUID deck = id(expect(owner, "POST", "/api/decks", configuration(commander), 201));
        due(deck);
        Job job = retries.claim();
        ScryfallClient throttled =
                mock(ScryfallClient.class);
        Instant cooldown = Instant.now().plusSeconds(7200);
        when(throttled.cooldownUntil()).thenReturn(cooldown);
        CommanderTokenRetries worker = new CommanderTokenRetries(jdbc, transactions, tokens, throttled);
        worker.fail(job);
        assertThat(jdbc.queryForObject("select token_due_at from deck_commanders where deck_id = ?", Timestamp.class, deck).toInstant())
                .isAfterOrEqualTo(cooldown.minusMillis(1));
        assertThat(retries.claim()).isNull();
        due(deck);
        jdbc.update("update deck_commanders set token_attempts = 100 where deck_id = ?", deck);
        worker.fail(retries.claim());
        Timestamp due = jdbc.queryForObject("select token_due_at from deck_commanders where deck_id = ?", Timestamp.class, deck);
        assertThat(due.toInstant()).isBetween(Instant.now().plusSeconds(86000), Instant.now().plusSeconds(108001));
        assertThat(jdbc.queryForObject("select token_last_failure from deck_commanders where deck_id = ?", String.class, deck))
                .isEqualTo("TOKEN_METADATA_UNAVAILABLE");
    }

    @Test
    void initialOptionalFailurePersistsProviderCooldownAcrossWorkerRestart() throws Exception {
        Actor owner = register("owner", "Owner");
        ObjectNode token = card("Spirit");
        ObjectNode commander = linked(token);
        UUID printing = UUID.fromString(commander.path("id").asText());
        ScryfallClient client =
                mock(ScryfallClient.class);
        when(client.card(printing)).thenReturn(commander);
        when(client.card(UUID.fromString(token.path("id").asText())))
                .thenThrow(new ScryfallClientException(
                        ScryfallClientException.Kind.UNAVAILABLE));
        Instant cooldown = Instant.now().plusSeconds(7200);
        when(client.cooldownUntil()).thenReturn(cooldown);
        ResolvedCommander resolved =
                new ScryfallLookup(client,
                        new ScryfallNormalizer())
                        .resolveCommanderOnline(new CommanderSelectionRef(printing, null));
        Deck saved = decks.saveAndFlush(
                new Deck(owner.id(), "Cooldown",
                        List.of(new DeckCommander(1, resolved, null))));
        assertThat(jdbc.queryForObject("select token_due_at from deck_commanders where deck_id = ?", Timestamp.class, saved.getId()).toInstant())
                .isAfterOrEqualTo(cooldown.minusMillis(1));
        assertThat(new CommanderTokenRetries(jdbc, transactions, tokens, provider).claim()).isNull();
    }

    private void due(UUID deck) {
        jdbc.update("update deck_commanders set token_due_at = CURRENT_TIMESTAMP - INTERVAL '1 minute' where deck_id = ?", deck);
    }

    private ObjectNode linked(ObjectNode... related) {
        ObjectNode commander = card("Commander");
        for (ObjectNode token : related) {
            store(token);
            commander.withArray("all_parts").addObject().put("component", "token").put("id", token.path("id").asText());
        }
        return commander;
    }

    private ObjectNode card(String name) {
        ObjectNode card = json.createObjectNode().put("object", "card").put("id", UUID.randomUUID().toString())
                .put("oracle_id", UUID.randomUUID().toString()).put("name", name).put("layout", "normal")
                .put("type_line", "Legendary Creature — Test").put("oracle_text", "Vigilance");
        card.putArray("color_identity");
        card.putArray("keywords");
        card.putObject("legalities").put("commander", "legal");
        card.putObject("image_uris").put("normal", "https://cards.scryfall.io/normal/test.jpg")
                .put("art_crop", "https://cards.scryfall.io/art_crop/test.jpg");
        return card;
    }

    private void store(ObjectNode card) {
        CommanderTestProvider.put(UUID.fromString(card.path("id").asText()), card.toString());
    }

    private String configuration(ObjectNode commander) {
        store(commander);
        return json.writeValueAsString(Map.of("name", "Tokens", "commanders", List.of(
                Map.of("selectionRef", Map.of("scryfallCardId", commander.path("id").asText())))));
    }
}
