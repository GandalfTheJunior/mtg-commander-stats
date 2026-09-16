package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.MtgCommanderStatsApplicationTest.DatabaseConfiguration;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.Deck;
import io.github.gandalfthejunior.mtgcommanderstats.deck.persistence.DeckRepository;
import io.github.gandalfthejunior.mtgcommanderstats.user.persistence.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(DatabaseConfiguration.class)
class DeckManagementTest {
    private static final String PASSWORD = "correct horse battery";
    private static final String CSRF_HEADER = "X-CSRF-TOKEN";

    @Value("${local.server.port}")
    private int port;
    @Autowired
    private DeckRepository decks;
    @Autowired
    private UserRepository users;
    @Autowired
    private JdbcTemplate jdbc;

    private final JsonMapper json = JsonMapper.builder().build();
    private final HttpClient client = HttpClient.newHttpClient();

    @BeforeEach
    @AfterEach
    void clearData() {
        decks.deleteAll();
        users.deleteAll();
    }

    @Test
    void createsCanonicalDecksForAuthenticatedOwnerAndListsOnlyTheirDecks() throws Exception {
        AuthenticatedClient alice = registerAndLogin("alice@example.com", "Alice");
        AuthenticatedClient bob = registerAndLogin("bob@example.com", "Bob");

        String firstBody = json.writeValueAsString(Map.of(
                "name", "\u00a0 Atraxa  SUPERFRIENDS \u202f",
                "commander", "\u0085Atraxa, Praetors' Voice\u2007",
                "colorIdentity", List.of("G", "U", "W", "B"),
                "ownerId", bob.userId()));
        HttpResponse<String> firstResponse = request(alice, HttpMethod.POST, "/api/decks", firstBody);
        assertThat(firstResponse.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        JsonNode first = json.readTree(firstResponse.body());
        assertThat(first.size()).isEqualTo(4);
        assertThat(first.get("name").asText()).isEqualTo("Atraxa  SUPERFRIENDS");
        assertThat(first.get("commander").asText()).isEqualTo("Atraxa, Praetors' Voice");
        assertThat(first.get("colorIdentity")).isEqualTo(json.readTree("[\"W\",\"U\",\"B\",\"G\"]"));
        assertThat(firstResponse.body()).doesNotContain("owner", "userId", "email", "password", "encoded");

        HttpResponse<String> duplicateNames = request(alice, HttpMethod.POST, "/api/decks",
                deckBody("Atraxa  SUPERFRIENDS", "Atraxa, Praetors' Voice", List.of()));
        assertThat(duplicateNames.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        HttpResponse<String> bobDeck = request(bob, HttpMethod.POST, "/api/decks",
                deckBody("Bob's deck", "Krenko", List.of("R")));
        assertThat(bobDeck.statusCode()).isEqualTo(HttpStatus.CREATED.value());

        Deck stored = decks.findById(UUID.fromString(first.get("id").asText())).orElseThrow();
        assertThat(stored.getOwnerId()).isEqualTo(alice.userId());
        JsonNode aliceList = json.readTree(request(alice, HttpMethod.GET, "/api/decks", "").body());
        assertThat(aliceList.size()).isEqualTo(2);
        assertThat(aliceList.toString()).doesNotContain("Bob's deck", bob.userId().toString());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"commander\":\"Atraxa\",\"colorIdentity\":[]}",
            "{\"name\":null,\"commander\":\"Atraxa\",\"colorIdentity\":[]}",
            "{\"name\":\"\u00a0\u2007\u202f\u0085\",\"commander\":\"Atraxa\",\"colorIdentity\":[]}",
            "{\"name\":\"Deck\",\"colorIdentity\":[]}",
            "{\"name\":\"Deck\",\"commander\":null,\"colorIdentity\":[]}",
            "{\"name\":\"Deck\",\"commander\":\"\u00a0\u2007\u202f\u0085\",\"colorIdentity\":[]}"
    })
    void rejectsMissingNullOrDisplayTextBlankFields(String body) throws Exception {
        AuthenticatedClient alice = registerAndLogin("alice@example.com", "Alice");
        assertThat(request(alice, HttpMethod.POST, "/api/decks", body).statusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(decks.count()).isZero();
    }

    @Test
    void acceptsColorlessOneColorAndMulticolorDecksInCanonicalOrder() throws Exception {
        AuthenticatedClient alice = registerAndLogin("alice@example.com", "Alice");
        JsonNode colorless = json.readTree(request(alice, HttpMethod.POST, "/api/decks",
                deckBody("Colorless", "Karn", List.of())).body());
        JsonNode single = json.readTree(request(alice, HttpMethod.POST, "/api/decks",
                deckBody("Red", "Krenko", List.of("R"))).body());
        JsonNode multiple = json.readTree(request(alice, HttpMethod.POST, "/api/decks",
                deckBody("Five", "Kenrith", List.of("G", "R", "B", "U", "W"))).body());
        assertThat(colorless.get("colorIdentity")).isEqualTo(json.readTree("[]"));
        assertThat(single.get("colorIdentity")).isEqualTo(json.readTree("[\"R\"]"));
        assertThat(multiple.get("colorIdentity"))
                .isEqualTo(json.readTree("[\"W\",\"U\",\"B\",\"R\",\"G\"]"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"name\":\"Deck\",\"commander\":\"Atraxa\"}",
            "{\"name\":\"Deck\",\"commander\":\"Atraxa\",\"colorIdentity\":null}",
            "{\"name\":\"Deck\",\"commander\":\"Atraxa\",\"colorIdentity\":[\"X\"]}",
            "{\"name\":\"Deck\",\"commander\":\"Atraxa\",\"colorIdentity\":[\"W\",\"W\"]}"
    })
    void rejectsMissingNullUnknownOrDuplicateColors(String body) throws Exception {
        AuthenticatedClient alice = registerAndLogin("alice@example.com", "Alice");
        assertThat(request(alice, HttpMethod.POST, "/api/decks", body).statusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(decks.count()).isZero();
    }

    @Test
    void enforcesAuthenticationAndCsrfForEveryDeckOperation() throws Exception {
        HttpResponse<String> anonymousCsrf = bootstrap("");
        AuthenticatedClient anonymous = new AuthenticatedClient(cookie(anonymousCsrf), token(anonymousCsrf), null);
        UUID missing = UUID.randomUUID();
        assertThat(send(HttpMethod.GET, "/api/decks", "", "", null).statusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(request(anonymous, HttpMethod.POST, "/api/decks",
                deckBody("Deck", "Atraxa", List.of())).statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(request(anonymous, HttpMethod.PUT, "/api/decks/" + missing,
                deckBody("Deck", "Atraxa", List.of())).statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(request(anonymous, HttpMethod.DELETE, "/api/decks/" + missing, "").statusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED.value());

        AuthenticatedClient alice = registerAndLogin("alice@example.com", "Alice");
        assertThat(send(HttpMethod.POST, "/api/decks", deckBody("Deck", "Atraxa", List.of()),
                alice.cookie(), null).statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(send(HttpMethod.PUT, "/api/decks/" + missing, deckBody("Deck", "Atraxa", List.of()),
                alice.cookie(), "invalid").statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(send(HttpMethod.DELETE, "/api/decks/" + missing, "", alice.cookie(), null).statusCode())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @Test
    void updatesAndDeletesOnlyOwnedDecksAndDistinguishesMissingDecks() throws Exception {
        AuthenticatedClient alice = registerAndLogin("alice@example.com", "Alice");
        AuthenticatedClient bob = registerAndLogin("bob@example.com", "Bob");
        UUID aliceDeck = createdId(request(alice, HttpMethod.POST, "/api/decks",
                deckBody("Old name", "Old commander", List.of("U"))));
        UUID bobDeck = createdId(request(bob, HttpMethod.POST, "/api/decks",
                deckBody("Bob's deck", "Krenko", List.of("R"))));

        HttpResponse<String> update = request(alice, HttpMethod.PUT, "/api/decks/" + aliceDeck,
                deckBody("New name", "New  Commander", List.of("G", "W")));
        assertThat(update.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(json.readTree(update.body()).get("colorIdentity"))
                .isEqualTo(json.readTree("[\"W\",\"G\"]"));
        assertThat(decks.findById(aliceDeck).orElseThrow().getCommander()).isEqualTo("New  Commander");

        HttpResponse<String> forbiddenUpdate = request(alice, HttpMethod.PUT, "/api/decks/" + bobDeck,
                deckBody("Stolen", "Atraxa", List.of()));
        assertThat(forbiddenUpdate.statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(decks.findById(bobDeck).orElseThrow().getName()).isEqualTo("Bob's deck");
        assertThat(request(alice, HttpMethod.PUT, "/api/decks/" + UUID.randomUUID(),
                deckBody("Missing", "Atraxa", List.of())).statusCode()).isEqualTo(HttpStatus.NOT_FOUND.value());

        assertThat(request(alice, HttpMethod.DELETE, "/api/decks/" + bobDeck, "").statusCode())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(decks.findById(bobDeck)).isPresent();
        assertThat(request(alice, HttpMethod.DELETE, "/api/decks/" + UUID.randomUUID(), "").statusCode())
                .isEqualTo(HttpStatus.NOT_FOUND.value());
        assertThat(request(alice, HttpMethod.DELETE, "/api/decks/" + aliceDeck, "").statusCode())
                .isEqualTo(HttpStatus.NO_CONTENT.value());
        assertThat(decks.findById(aliceDeck)).isEmpty();
    }

    @Test
    void databaseConstraintsProtectOwnerTextAndColorIdentity() throws Exception {
        AuthenticatedClient alice = registerAndLogin("alice@example.com", "Alice");
        assertThatThrownBy(() -> insertDeck(UUID.randomUUID(), "Deck", "Atraxa", "W"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertDeck(alice.userId(), "\u00a0\u2007", "Atraxa", "W"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertDeck(alice.userId(), "Deck", "\u202f\u0085", "W"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertDeck(alice.userId(), "Deck", "Atraxa", "UW"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertDeck(alice.userId(), "Deck", "Atraxa", "WW"))
                .isInstanceOf(DataIntegrityViolationException.class);
        insertDeck(alice.userId(), " Same name ", "Same commander", "");
        insertDeck(alice.userId(), " Same name ", "Same commander", "WUBRG");
        assertThat(decks.count()).isEqualTo(2);
    }

    private void insertDeck(UUID ownerId, String name, String commander, String colors) {
        jdbc.update("INSERT INTO decks (id, owner_id, name, commander, color_identity) VALUES (?, ?, ?, ?, ?)",
                UUID.randomUUID(), ownerId, name, commander, colors);
    }

    private UUID createdId(HttpResponse<String> response) {
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        return UUID.fromString(json.readTree(response.body()).get("id").asText());
    }

    private AuthenticatedClient registerAndLogin(String email, String username) throws Exception {
        HttpResponse<String> registration = send(HttpMethod.POST, "/api/users",
                json.writeValueAsString(Map.of("email", email, "username", username, "password", PASSWORD)),
                "", null);
        assertThat(registration.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        UUID userId = UUID.fromString(json.readTree(registration.body()).get("id").asText());
        HttpResponse<String> beforeLogin = bootstrap("");
        HttpResponse<String> login = send(HttpMethod.POST, "/api/session",
                json.writeValueAsString(Map.of("email", email, "password", PASSWORD)),
                cookie(beforeLogin), token(beforeLogin));
        assertThat(login.statusCode()).isEqualTo(HttpStatus.OK.value());
        String sessionCookie = cookie(login);
        HttpResponse<String> afterLogin = bootstrap(sessionCookie);
        return new AuthenticatedClient(sessionCookie, token(afterLogin), userId);
    }

    private HttpResponse<String> bootstrap(String cookie) throws Exception {
        HttpResponse<String> response = send(HttpMethod.GET, "/api/csrf", "", cookie, null);
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        return response;
    }

    private String token(HttpResponse<String> response) {
        return json.readTree(response.body()).get("token").asText();
    }

    private String cookie(HttpResponse<String> response) {
        return response.headers().firstValue(HttpHeaders.SET_COOKIE).orElseThrow().split(";", 2)[0];
    }

    private String deckBody(String name, String commander, List<String> colors) {
        return json.writeValueAsString(Map.of("name", name, "commander", commander, "colorIdentity", colors));
    }

    private HttpResponse<String> request(AuthenticatedClient actor, HttpMethod method, String path, String body)
            throws Exception {
        return send(method, path, body, actor.cookie(), actor.token());
    }

    private HttpResponse<String> send(HttpMethod method, String path, String body, String cookie, String token)
            throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
        if (!cookie.isEmpty()) {
            request.header(HttpHeaders.COOKIE, cookie);
        }
        if (token != null) {
            request.header(CSRF_HEADER, token);
        }
        return client.send(request.method(method.name(), HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private record AuthenticatedClient(String cookie, String token, UUID userId) {
    }
}
