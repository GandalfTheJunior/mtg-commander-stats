package io.github.gandalfthejunior.mtgcommanderstats.demo;

import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Exact offline metadata replay. No method can fall back to HTTP. */
public final class PinnedScryfallClient extends ScryfallClient {
    private final JsonMapper json = JsonMapper.builder().build();
    private final Map<UUID, JsonNode> cards = new LinkedHashMap<>();
    private final AtomicInteger unexpectedRequests = new AtomicInteger();
    private final AtomicInteger requests = new AtomicInteger();

    public PinnedScryfallClient() {
        try (InputStream input = getClass().getResourceAsStream("/scryfall/demo-cards.json")) {
            if (input == null) {
                throw new IllegalStateException("Missing pinned demo metadata.");
            }
            for (JsonNode card : json.readTree(input).path("cards")) {
                UUID id = UUID.fromString(card.path("id").asText());
                if (cards.put(id, card) != null) {
                    throw new IllegalStateException("Duplicate pinned printing.");
                }
            }
        } catch (IOException exception) {
            throw new IllegalStateException("Cannot load pinned demo metadata.", exception);
        }
    }

    @Override
    public JsonNode card(UUID cardId) {
        requests.incrementAndGet();
        JsonNode card = cards.get(cardId);
        if (card == null) {
            throw unexpected();
        }
        return card.deepCopy();
    }

    @Override
    public JsonNode search(String query) {
        requests.incrementAndGet();
        // The selected reversible printing requires authoritative ordinary Oracle
        // metadata. Match the complete query; never approximate Scryfall search.
        String oracle = "502849a6-8e65-40f3-b348-a41c4f939768";
        if (!("(oracleid:" + oracle + ") -layout:reversible_card lang:en").equals(query)) {
            throw unexpected();
        }
        JsonNode metadata = cards.values().stream()
                .filter(card -> oracle.equals(card.path("oracle_id").asText()))
                .findFirst().orElseThrow(this::unexpected);
        ObjectNode page = json.createObjectNode().put("object", "list").put("has_more", false);
        page.putArray("data").add(metadata.deepCopy());
        return page;
    }

    @Override
    public JsonNode printings(String query) {
        requests.incrementAndGet();
        throw unexpected();
    }

    @Override
    public JsonNode nextPage(String url) {
        requests.incrementAndGet();
        throw unexpected();
    }

    private IllegalStateException unexpected() {
        unexpectedRequests.incrementAndGet();
        return new IllegalStateException("Unpinned Scryfall request during offline demo seed.");
    }

    public int requests() {
        return requests.get();
    }

    public void requireNoUnexpectedRequests() {
        // Even a request translated to an HTTP error by MVC poisons the whole run.
        if (unexpectedRequests.get() != 0) {
            throw new IllegalStateException("Unexpected Scryfall requests during offline seed.");
        }
    }
}
