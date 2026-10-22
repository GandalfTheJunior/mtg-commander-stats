package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import io.github.gandalfthejunior.mtgcommanderstats.MtgCommanderStatsApplicationTest.DatabaseConfiguration;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClient;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClientException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({DatabaseConfiguration.class, ScryfallApiTest.ProviderConfiguration.class})
class ScryfallApiTest {
    private static final UUID CARD_ID = UUID.fromString("10000000-0000-0000-0000-000000000001");
    private static final UUID UNKNOWN_ID = UUID.fromString("10000000-0000-0000-0000-000000000002");
    private static final UUID UNAVAILABLE_ID = UUID.fromString("10000000-0000-0000-0000-000000000003");
    private static final UUID MALFORMED_ID = UUID.fromString("10000000-0000-0000-0000-000000000004");
    private static final String ORACLE_ID = "20000000-0000-0000-0000-000000000001";
    private static final String PASSWORD = "correct horse battery";
    private final JsonMapper json = JsonMapper.builder().build();
    private final HttpClient http = HttpClient.newHttpClient();
    @Value("${local.server.port}")
    private int port;
    @Autowired
    private StubProvider provider;

    @BeforeEach
    void resetProvider() {
        provider.offline = false;
        provider.calls.set(0);
    }

    @Test
    void requiresAuthenticationBeforeAnyProviderRequest() throws Exception {
        for (String route : List.of("/api/scryfall/commanders?q=atraxa", "/api/scryfall/cards/" + CARD_ID,
                "/api/scryfall/cards/" + CARD_ID + "/artworks")) {
            assertThat(send("GET", route, "", "", null).statusCode()).isEqualTo(401);
        }
        assertThat(provider.calls).hasValue(0);
    }

    @Test
    void servesNormalizedContractsAndControlledErrorsWhileSavedDeckFlowsRemainOffline() throws Exception {
        Session session = login();
        HttpResponse<String> search = get(session, "/api/scryfall/commanders?q=atraxa");
        assertThat(search.statusCode()).isEqualTo(200);
        JsonNode choices = json.readTree(search.body());
        assertThat(choices.size()).isEqualTo(1);
        JsonNode choice = choices.get(0);
        assertThat(choice.get("selectionRef").get("scryfallCardId").asText()).isEqualTo(CARD_ID.toString());
        assertThat(choice.get("selectionRef").has("gameplayFaceIndex")).isFalse();
        assertThat(choice.get("colorIdentity")).isEqualTo(json.readTree("[\"W\",\"U\",\"B\",\"G\"]"));
        assertThat(choice.get("canBeSoleCommander").asBoolean()).isTrue();
        assertThat(choice.get("requiresChosenColor").asBoolean()).isFalse();
        assertThat(choice.get("thumbnailUrl").isNull()).isTrue();

        HttpResponse<String> details = get(session, "/api/scryfall/cards/" + CARD_ID);
        assertThat(details.statusCode()).isEqualTo(200);
        JsonNode card = json.readTree(details.body());
        assertThat(card.get("oracleId").asText()).isEqualTo(ORACLE_ID);
        assertThat(card.get("defaultArtwork").get("artCropUrl").isNull()).isTrue();
        assertThat(card.get("commanderSelections")).isEqualTo(choices);
        assertThat(details.body()).doesNotContain("legalities", "image_uris", "prints_search_uri");
        HttpResponse<String> artwork = get(session, "/api/scryfall/cards/" + CARD_ID + "/artworks");
        assertThat(artwork.statusCode()).isEqualTo(200);
        assertThat(json.readTree(artwork.body()).isEmpty()).isTrue();

        HttpResponse<String> empty = get(session, "/api/scryfall/commanders?q=empty");
        assertThat(empty.statusCode()).isEqualTo(200);
        assertThat(json.readTree(empty.body()).isEmpty()).isTrue();
        for (String route : List.of("/api/scryfall/commanders", "/api/scryfall/commanders?q=a",
                "/api/scryfall/commanders?q=%C2%A0%20", "/api/scryfall/cards/not-a-uuid",
                "/api/scryfall/cards/1-1-1-1-1", "/api/scryfall/cards/" + CARD_ID + "/artworks?gameplayFaceIndex=-1",
                "/api/scryfall/cards/" + CARD_ID + "/artworks?gameplayFaceIndex=1",
                "/api/scryfall/cards/" + CARD_ID + "/artworks?gameplayFaceIndex=front")) {
            assertProblem(get(session, route), 400, "INVALID_SCRYFALL_REQUEST");
        }
        assertProblem(get(session, "/api/scryfall/cards/" + UNKNOWN_ID), 404, "CARD_NOT_FOUND");
        assertProblem(get(session, "/api/scryfall/cards/" + MALFORMED_ID), 503, "SCRYFALL_UNAVAILABLE");
        assertProblem(get(session, "/api/scryfall/commanders?q=broken"), 503, "SCRYFALL_UNAVAILABLE");
        assertProblem(get(session, "/api/scryfall/cards/" + UNAVAILABLE_ID), 503, "SCRYFALL_UNAVAILABLE");

        String deckBody = json.writeValueAsString(Map.of("name", "Saved deck", "commanders", List.of(Map.of("selectionRef", Map.of("scryfallCardId", CARD_ID)))));
        HttpResponse<String> created = send("POST", "/api/decks", deckBody, session.cookie(), session.token());
        assertThat(created.statusCode()).isEqualTo(201);
        String deckId = json.readTree(created.body()).get("id").asText();
        provider.offline = true;
        int callsBeforeSavedReads = provider.calls.get();
        assertThat(get(session, "/api/decks").statusCode()).isEqualTo(200);
        String renamed = json.writeValueAsString(Map.of("name", "Renamed offline"));
        assertThat(send("PUT", "/api/decks/" + deckId, renamed, session.cookie(), session.token()).statusCode())
                .isEqualTo(200);
        assertThat(provider.calls).hasValue(callsBeforeSavedReads);
        assertProblem(get(session, "/api/scryfall/commanders?q=offline"), 503, "SCRYFALL_UNAVAILABLE");
    }

    private void assertProblem(HttpResponse<String> response, int status, String code) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(status);
        assertThat(response.headers().firstValue(HttpHeaders.CONTENT_TYPE).orElse(""))
                .startsWith(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        JsonNode problem = json.readTree(response.body());
        assertThat(problem.get("status").asInt()).isEqualTo(status);
        assertThat(problem.get("code").asText()).isEqualTo(code);
        assertThat(response.body()).doesNotContain("provider-secret", "ScryfallClient", "java.", "stackTrace");
        if (status == 503) {
            assertThat(problem.get("detail").asText()).isEqualTo(
                    "Scryfall is currently imprisoned in the moon… Please try again later.");
        }
    }

    private Session login() throws Exception {
        String email = UUID.randomUUID() + "@example.com";
        String registration = json.writeValueAsString(Map.of("email", email, "username", "Lookup Tester",
                "password", PASSWORD));
        assertThat(send("POST", "/api/users", registration, "", null).statusCode()).isEqualTo(201);
        HttpResponse<String> bootstrap = send("GET", "/api/csrf", "", "", null);
        String credentials = json.writeValueAsString(Map.of("email", email, "password", PASSWORD));
        HttpResponse<String> loggedIn = send("POST", "/api/session", credentials, cookie(bootstrap),
                json.readTree(bootstrap.body()).get("token").asText());
        assertThat(loggedIn.statusCode()).isEqualTo(200);
        String cookie = cookie(loggedIn);
        HttpResponse<String> fresh = send("GET", "/api/csrf", "", cookie, null);
        return new Session(cookie, json.readTree(fresh.body()).get("token").asText());
    }

    private String cookie(HttpResponse<String> response) {
        return response.headers().firstValue(HttpHeaders.SET_COOKIE).orElseThrow().split(";", 2)[0];
    }

    private HttpResponse<String> get(Session session, String path) throws Exception {
        return send("GET", path, "", session.cookie(), null);
    }

    private HttpResponse<String> send(String method, String path, String body, String cookie, String token)
            throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
        if (!cookie.isEmpty()) {
            request.header(HttpHeaders.COOKIE, cookie);
        }
        if (token != null) {
            request.header("X-CSRF-TOKEN", token);
        }
        return http.send(request.method(method, HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private record Session(String cookie, String token) {
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ProviderConfiguration {
        @Bean
        @Primary
        StubProvider provider() {
            return new StubProvider();
        }
    }

    static class StubProvider extends ScryfallClient {
        private final JsonMapper json = JsonMapper.builder().build();
        private final AtomicInteger calls = new AtomicInteger();
        private volatile boolean offline;

        @Override
        public JsonNode card(UUID id) {
            calls.incrementAndGet();
            if (offline || UNAVAILABLE_ID.equals(id)) {
                throw new ScryfallClientException(ScryfallClientException.Kind.UNAVAILABLE);
            }
            if (MALFORMED_ID.equals(id)) {
                return json.readTree("{\"provider-secret\":\"invalid data\"}");
            }
            if (!CARD_ID.equals(id)) {
                throw new ScryfallClientException(ScryfallClientException.Kind.NOT_FOUND);
            }
            return fixture();
        }

        @Override
        public JsonNode search(String query) {
            calls.incrementAndGet();
            if (offline) {
                throw new ScryfallClientException(ScryfallClientException.Kind.UNAVAILABLE);
            }
            if (query.contains("empty")) {
                throw new ScryfallClientException(ScryfallClientException.Kind.NOT_FOUND);
            }
            if (query.contains("broken")) {
                return json.readTree("{\"data\":{}}");
            }
            return page();
        }

        @Override
        public JsonNode printings(String query) {
            calls.incrementAndGet();
            if (offline) {
                throw new ScryfallClientException(ScryfallClientException.Kind.UNAVAILABLE);
            }
            return page();
        }

        private JsonNode page() {
            return json.valueToTree(Map.of("object", "list", "has_more", false, "data", List.of(fixture())));
        }

        private JsonNode fixture() {
            return json.readTree("""
                    {"object":"card", "id":"%s", "oracle_id":"%s", "name":"Atraxa, Praetors' Voice",
                     "lang":"en", "layout":"normal", "legalities":{"commander":"legal"},
                     "type_line":"Legendary Creature — Phyrexian Angel Horror", "keywords":["Flying"],
                     "oracle_text":"Flying, vigilance, deathtouch, lifelink", "color_identity":["G","B","U","W"]}
                    """.formatted(CARD_ID, ORACLE_ID));
        }
    }
}
