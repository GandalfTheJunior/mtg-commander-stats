package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.MtgCommanderStatsApplicationTest.DatabaseConfiguration;
import io.github.gandalfthejunior.mtgcommanderstats.deck.application.ManageDecks;
import io.github.gandalfthejunior.mtgcommanderstats.deck.persistence.DeckRepository;
import io.github.gandalfthejunior.mtgcommanderstats.game.application.ManageGames;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameParticipant;
import io.github.gandalfthejunior.mtgcommanderstats.game.persistence.GameRepository;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.ManageGroups;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.PlayGroupRepository;
import io.github.gandalfthejunior.mtgcommanderstats.user.persistence.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CREATED;
import static org.springframework.http.HttpStatus.FORBIDDEN;
import static org.springframework.http.HttpStatus.OK;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(DatabaseConfiguration.class)
abstract class GameTestSupport {
    private static final String PASSWORD = "correct horse battery";

    @Value("${local.server.port}")
    private int port;
    @Autowired
    protected GameRepository games;
    @Autowired
    protected DeckRepository decks;
    @Autowired
    protected PlayGroupRepository groups;
    @Autowired
    protected UserRepository users;
    @Autowired
    protected JdbcTemplate jdbc;
    @Autowired
    protected TransactionTemplate transactions;
    @Autowired
    protected ManageGames gameService;
    @Autowired
    protected ManageDecks deckService;
    @Autowired
    protected ManageGroups groupService;

    protected final JsonMapper json = JsonMapper.builder().build();
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    @BeforeEach
    @AfterEach
    void clearData() {
        games.deleteAll();
        groups.deleteAll();
        decks.deleteAll();
        users.deleteAll();
    }

    protected Fixture fixture() throws Exception {
        Actor owner = register("owner", "Owner");
        Actor creator = register("creator", "Same Name");
        Actor member = register("member", "Same Name");
        Actor outsider = register("outsider", "Outsider");
        UUID groupId = id(expect(owner, "POST", "/api/groups", "{\"name\":\"Pod\"}", CREATED.value()));
        String code = expect(owner, "GET", "/api/groups/" + groupId + "/join-code", "", OK.value()).get("code").asText();
        for (Actor actor : List.of(creator, member)) {
            expect(actor, "POST", "/api/groups/join", json.writeValueAsString(Map.of("code", code)), OK.value());
        }
        return new Fixture(groupId, owner, creator, member, outsider, deck(owner), deck(creator), deck(member),
                deck(outsider));
    }

    protected Actor register(String key, String username) throws Exception {
        String email = key + "@example.com";
        JsonNode registered = expect(null, "POST", "/api/users",
                json.writeValueAsString(Map.of("email", email, "username", username, "password", PASSWORD)), CREATED.value());
        HttpResponse<String> csrf = send(null, "GET", "/api/csrf", "");
        Actor anonymous = new Actor(cookie(csrf), json.readTree(csrf.body()).get("token").asText(), null);
        HttpResponse<String> login = send(anonymous, "POST", "/api/session",
                json.writeValueAsString(Map.of("email", email, "password", PASSWORD)));
        assertThat(login.statusCode()).isEqualTo(OK.value());
        Actor authenticated = new Actor(cookie(login), null, id(registered));
        JsonNode token = expect(authenticated, "GET", "/api/csrf", "", OK.value());
        return new Actor(authenticated.cookie(), token.get("token").asText(), authenticated.id());
    }

    protected UUID deck(Actor owner) throws Exception {
        return id(expect(owner, "POST", "/api/decks", deckBody("Deck", "Krenko", List.of("R")), CREATED.value()));
    }

    protected String deckBody(String name, String commander, List<String> colors) {
        return json.writeValueAsString(Map.of("name", name, "commander", commander, "colorIdentity", colors));
    }

    protected String body(Fixture fixture) {
        return body(assignments(fixture), "WIN", fixture.creator().id());
    }

    protected List<GameParticipant> assignments(Fixture fixture) {
        return List.of(new GameParticipant(fixture.creator().id(), fixture.creatorDeck()),
                new GameParticipant(fixture.member().id(), fixture.memberDeck()));
    }

    protected String body(List<GameParticipant> participants, String result, UUID winner) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("participants", participants.stream()
                .map(p -> Map.of("userId", p.getUserId(), "deckId", p.getDeckId())).toList());
        payload.put("result", result);
        payload.put("winnerUserId", winner);
        return json.writeValueAsString(payload);
    }

    protected JsonNode expect(Actor actor, String method, String path, String body, int status) throws Exception {
        HttpResponse<String> response = send(actor, method, path, body);
        assertThat(response.statusCode()).as("%s %s: %s", method, path, response.body()).isEqualTo(status);
        if (status >= BAD_REQUEST.value() && response.body().isEmpty()) {
            // Existing Spring Security filters return status-only authentication/CSRF failures.
            assertThat(status).isIn(UNAUTHORIZED.value(), FORBIDDEN.value());
        } else if (status >= BAD_REQUEST.value()) {
            assertThat(response.headers().firstValue(HttpHeaders.CONTENT_TYPE).orElseThrow())
                    .startsWith("application/problem+json");
            JsonNode problem = json.readTree(response.body());
            assertThat(problem.get("status").asInt()).isEqualTo(status);
            assertThat(response.body()).doesNotContain("@example.com", "encodedPassword", "joinCode");
        }
        return response.body().isEmpty() ? null : json.readTree(response.body());
    }

    protected HttpResponse<String> send(Actor actor, String method, String path, String body) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .timeout(Duration.ofSeconds(30)).header(HttpHeaders.CONTENT_TYPE, "application/json");
        if (actor != null) {
            request.header(HttpHeaders.COOKIE, actor.cookie());
            if (actor.token() != null) {
                request.header("X-CSRF-TOKEN", actor.token());
            }
        }
        return client.send(request.method(method, HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
    }

    protected UUID id(JsonNode value) {
        return UUID.fromString(value.get("id").asText());
    }

    private String cookie(HttpResponse<String> response) {
        return response.headers().firstValue(HttpHeaders.SET_COOKIE).orElseThrow().split(";", 2)[0];
    }

    protected record Actor(String cookie, String token, UUID id) {
    }

    protected record Fixture(UUID groupId, Actor owner, Actor creator, Actor member, Actor outsider,
            UUID ownerDeck, UUID creatorDeck, UUID memberDeck, UUID outsiderDeck) {
        String path() {
            return "/api/groups/" + groupId + "/games";
        }

        String selection(UUID userId) {
            return "/api/groups/" + groupId + "/members/" + userId + "/decks";
        }
    }
}
