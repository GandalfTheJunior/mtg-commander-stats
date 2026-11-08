package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import java.util.UUID;
import java.util.List;
import java.util.Map;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.MalformedScryfallResponseException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClient;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClientException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;

class RelatedTokenLookupTest {
    private final JsonMapper json = JsonMapper.builder().build();
    private final ScryfallClient client = mock(ScryfallClient.class);
    private final RelatedTokenLookup lookup = new RelatedTokenLookup(client);

    @Test
    void resolvesAllDistinctLinkedTypesWithoutASearchResultCapOrFollowingUntrustedUris() {
        ObjectNode commander = json.createObjectNode();
        for (int index = 0; index < 45; index++) {
            UUID id = UUID.randomUUID();
            ObjectNode token = json.valueToTree(Map.of("id", id, "object", "card", "name", "Token " + index,
                    "layout", "token", "type_line", "Token Creature", "image_uris", Map.of("normal", "http://evil.test/image")));
            when(client.card(id)).thenReturn(token);
            ObjectNode part = commander.withArray("all_parts").addObject().put("component", "token")
                    .put("id", id.toString()).put("uri", "https://evil.test/card");
            commander.withArray("all_parts").add(part.deepCopy());
        }
        assertThat(lookup.resolve(commander)).hasSize(45).allSatisfy(token -> assertThat(token.imageUrl()).isNull());
        UUID first = UUID.fromString(commander.path("all_parts").get(0).path("id").asText());
        verify(client, times(1)).card(first);
    }

    @Test
    void aggregatePayloadGuardKeepsExceptionalListsIncompleteInsteadOfPublishingATruncatedSubset() {
        ObjectNode commander = json.createObjectNode();
        for (int index = 0; index < 3; index++) {
            UUID id = UUID.randomUUID();
            when(client.card(id)).thenReturn(json.valueToTree(Map.of("id", id, "object", "card", "layout", "token",
                    "name", "x".repeat(600000))));
            commander.withArray("all_parts").addObject().put("component", "token").put("id", id.toString());
        }
        assertThatThrownBy(() -> lookup.resolve(commander)).isInstanceOf(MalformedScryfallResponseException.class);
    }

    @Test
    void noRelationsAreEmptyButMalformedOrUnavailableDetailsNeverPublishPartialSuccess() {
        assertThat(lookup.resolve(json.createObjectNode())).isEmpty();
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        ObjectNode commander = json.createObjectNode();
        commander.set("all_parts", json.valueToTree(List.of(Map.of("component", "token", "id", first),
                Map.of("component", "token", "id", second))));
        when(client.card(first)).thenReturn(json.valueToTree(Map.of("id", first, "object", "card", "layout", "token", "name", "Soldier")));
        when(client.card(second)).thenThrow(new ScryfallClientException(ScryfallClientException.Kind.UNAVAILABLE));
        assertThatThrownBy(() -> lookup.resolve(commander)).isInstanceOf(ScryfallClientException.class);
        org.mockito.Mockito.doReturn(json.valueToTree(Map.of("id", UUID.randomUUID(), "object", "card", "layout", "token", "name", "Wrong printing"))).when(client).card(second);
        assertThatThrownBy(() -> lookup.resolve(commander)).isInstanceOf(MalformedScryfallResponseException.class);
        commander.put("all_parts", "malformed");
        assertThatThrownBy(() -> lookup.resolve(commander)).isInstanceOf(MalformedScryfallResponseException.class);
    }
}
