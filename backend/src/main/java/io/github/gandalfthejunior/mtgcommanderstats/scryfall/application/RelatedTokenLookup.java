package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CardFace;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.RelatedToken;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.ScryfallNormalizer;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.MalformedScryfallResponseException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClient;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
public class RelatedTokenLookup {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final int MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
    private final ScryfallClient client;

    public RelatedTokenLookup(ScryfallClient client) {
        this.client = client;
    }

    public List<RelatedToken> resolve(UUID printing) {
        JsonNode raw = client.card(printing);
        if (!printing.equals(id(raw)) || !"card".equals(raw.path("object").asText())) {
            throw new MalformedScryfallResponseException();
        }
        return resolve(raw);
    }

    /** Sequential requests share the provider gate; excessive work remains pending, never truncated. */
    public List<RelatedToken> resolve(JsonNode commander) {
        return resolve(commander, System.nanoTime() + Duration.ofSeconds(30).toNanos(), false);
    }

    public List<RelatedToken> resolveInline(JsonNode commander, long deadlineNanos) {
        return resolve(commander, deadlineNanos, true);
    }

    private List<RelatedToken> resolve(JsonNode commander, long deadline, boolean inline) {
        JsonNode parts = commander.path("all_parts");
        if (parts.isMissingNode() || parts.isNull()) {
            return List.of();
        }
        if (!parts.isArray()) {
            throw new MalformedScryfallResponseException();
        }
        Set<UUID> ids = new LinkedHashSet<>();
        for (JsonNode part : parts) {
            if ("token".equals(part.path("component").asText())) {
                ids.add(id(part));
            }
        }
        List<RelatedToken> result = new ArrayList<>();
        long snapshotBytes = 2;
        for (UUID id : ids) {
            if (System.nanoTime() > deadline) {
                throw new MalformedScryfallResponseException();
            }
            // Construct the fixed API URL from the canonical linked ID; never follow provider URIs.
            JsonNode raw = inline ? client.cardBefore(id, deadline) : client.card(id);
            if (!id.equals(id(raw)) || !"card".equals(raw.path("object").asText())
                    || !raw.path("name").isTextual() || raw.path("name").asText().isBlank()
                    || !raw.path("layout").isTextual()) {
                throw new MalformedScryfallResponseException();
            }
            List<CardFace> faces = ScryfallNormalizer.cardFaces(raw);
            RelatedToken token = new RelatedToken(id, raw.path("name").asText(), raw.path("type_line").asText(null),
                    faces.getFirst().imageUrl(), raw.path("layout").asText(), faces);
            snapshotBytes += JSON.writeValueAsBytes(token).length + 1;
            if (snapshotBytes > MAX_SNAPSHOT_BYTES) {
                throw new MalformedScryfallResponseException();
            }
            result.add(token);
        }
        if (inline && !ids.isEmpty() && System.nanoTime() >= deadline) {
            throw new MalformedScryfallResponseException();
        }
        return List.copyOf(result);
    }

    private static UUID id(JsonNode raw) {
        try {
            String value = raw.path("id").asText();
            UUID id = UUID.fromString(value);
            if (!id.toString().equalsIgnoreCase(value)) {
                throw new IllegalArgumentException();
            }
            return id;
        } catch (IllegalArgumentException exception) {
            throw new MalformedScryfallResponseException();
        }
    }
}
