package io.github.gandalfthejunior.mtgcommanderstats;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import io.github.gandalfthejunior.mtgcommanderstats.deck.application.CommanderInput;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClient;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClientException;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Pinned offline provider data; production resolution/normalization still runs on every write. */
class CommanderTestProvider extends ScryfallClient {
    private static final Map<UUID, JsonNode> CARDS = new ConcurrentHashMap<>();
    private static final JsonMapper JSON = JsonMapper.builder().build();
    final AtomicInteger calls = new AtomicInteger();
    volatile boolean offline;

    CommanderTestProvider() {
        super();
    }

    static List<CommanderInput> inputs(String name, List<String> colors) {
        UUID print = UUID.nameUUIDFromBytes((name + colors).getBytes(StandardCharsets.UTF_8));
        UUID oracle = UUID.nameUUIDFromBytes(name.getBytes(StandardCharsets.UTF_8));
        CARDS.put(print, JSON.valueToTree(Map.of("object", "card", "id", print, "oracle_id", oracle,
                "name", name, "layout", "normal", "lang", "en", "type_line", "Legendary Creature — Test",
                "color_identity", colors, "legalities", Map.of("commander", "legal"))));
        return List.of(new CommanderInput(new CommanderSelectionRef(print, null), null));
    }

    static void put(UUID id, String raw) {
        CARDS.put(id, JSON.readTree(raw));
    }

    @Override
    public JsonNode card(UUID id) {
        calls.incrementAndGet();
        if (offline) {
            throw new ScryfallClientException(ScryfallClientException.Kind.UNAVAILABLE);
        }
        JsonNode raw = CARDS.get(id);
        if (raw == null) {
            throw new ScryfallClientException(ScryfallClientException.Kind.NOT_FOUND);
        }
        return raw;
    }

    @Override
    public JsonNode search(String query) {
        if (offline) {
            throw new ScryfallClientException(ScryfallClientException.Kind.UNAVAILABLE);
        }
        return JSON.valueToTree(Map.of("object", "list", "has_more", false, "data", CARDS.values().stream()
                .filter(card -> !"reversible_card".equals(card.path("layout").asText())).toList()));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Configuration {
        @Bean
        @Primary
        CommanderTestProvider commanderTestProvider() {
            return new CommanderTestProvider();
        }
    }
}
