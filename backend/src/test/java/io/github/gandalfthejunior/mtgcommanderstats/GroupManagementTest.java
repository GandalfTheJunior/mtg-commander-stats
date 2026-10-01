package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import io.github.gandalfthejunior.mtgcommanderstats.MtgCommanderStatsApplicationTest.DatabaseConfiguration;
import io.github.gandalfthejunior.mtgcommanderstats.deck.persistence.DeckRepository;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.SecureJoinCodeGenerator;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupMembership;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupRole;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.GroupMembershipRepository;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.PlayGroupRepository;
import io.github.gandalfthejunior.mtgcommanderstats.user.persistence.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doReturn;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(DatabaseConfiguration.class)
class GroupManagementTest {
    private static final String PASSWORD = "correct horse battery";
    private static final String CSRF_HEADER = "X-CSRF-TOKEN";
    private static final String COLLIDING_CODE = "AAAAAAAAAAAAAAAAAAAAAA";
    private static final String RETRY_CODE = "BBBBBBBBBBBBBBBBBBBBBB";
    private static final String ROTATED_CODE = "CCCCCCCCCCCCCCCCCCCCCC";

    @Value("${local.server.port}")
    private int port;
    @Autowired
    private PlayGroupRepository groups;
    @Autowired
    private GroupMembershipRepository memberships;
    @Autowired
    private DeckRepository decks;
    @Autowired
    private UserRepository users;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private TransactionTemplate transactions;
    @MockitoSpyBean
    private SecureJoinCodeGenerator joinCodes;

    private final JsonMapper json = JsonMapper.builder().build();
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    @BeforeEach
    @AfterEach
    void clearData() {
        groups.deleteAll();
        memberships.deleteAll();
        decks.deleteAll();
        users.deleteAll();
    }

    @Test
    void createsListsAndSharesGroupDetailsWithFourActiveMembers() throws Exception {
        AuthenticatedClient alice = registerAndLogin("alice@example.com", "Alice");
        AuthenticatedClient bob = registerAndLogin("bob@example.com", "Same Name");
        AuthenticatedClient carol = registerAndLogin("carol@example.com", "Carol");
        AuthenticatedClient dave = registerAndLogin("dave@example.com", "Same Name");

        JsonNode created = createGroup(alice, "\u00a0 Friday  Commander \u202f");
        UUID groupId = UUID.fromString(created.get("id").asText());
        assertThat(created).isEqualTo(json.readTree("{\"id\":\"" + groupId
                + "\",\"name\":\"Friday  Commander\",\"role\":\"OWNER\"}"));
        assertThat(created.toString()).doesNotContain("code", "ownerId", "email", "password");

        String code = retrieveCode(alice, groupId);
        assertThat(code).matches("[A-Za-z0-9_-]{22}");
        for (AuthenticatedClient member : List.of(bob, carol, dave)) {
            JsonNode joined = join(member, " \u00a0" + code + "\u202f ");
            assertThat(joined.get("id").asText()).isEqualTo(groupId.toString());
            assertThat(joined.get("role").asText()).isEqualTo("MEMBER");
        }

        for (AuthenticatedClient member : List.of(alice, bob, carol, dave)) {
            HttpResponse<String> response = request(member, HttpMethod.GET, "/api/groups/" + groupId, "");
            assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
            JsonNode details = json.readTree(response.body());
            assertThat(details.get("members").size()).isEqualTo(4);
            assertThat(details.get("members").toString()).contains(alice.userId().toString(),
                    bob.userId().toString(), carol.userId().toString(), dave.userId().toString());
            assertThat(details.toString()).doesNotContain("email", "password", "code");
        }

        JsonNode bobSecondGroup = createGroup(bob, "Second group");
        assertThat(json.readTree(request(bob, HttpMethod.GET, "/api/groups", "").body()).size()).isEqualTo(2);
        assertThat(json.readTree(request(alice, HttpMethod.GET, "/api/groups", "").body()).size()).isEqualTo(1);
        assertThat(request(alice, HttpMethod.GET,
                "/api/groups/" + bobSecondGroup.get("id").asText(), "").statusCode())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @Test
    void leavePreservesMembershipAndRejoinReactivatesItWithoutDowngradingOwner() throws Exception {
        AuthenticatedClient owner = registerAndLogin("owner@example.com", "Owner");
        AuthenticatedClient member = registerAndLogin("member@example.com", "Member");
        UUID groupId = UUID.fromString(createGroup(owner, "Pod").get("id").asText());
        String code = retrieveCode(owner, groupId);
        join(member, code);
        UUID membershipId = memberships.findByGroupIdAndUserId(groupId, member.userId()).orElseThrow().getId();

        HttpResponse<String> leave = request(member, HttpMethod.DELETE,
                "/api/groups/" + groupId + "/membership", "");
        assertThat(leave.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        GroupMembership inactive = memberships.findById(membershipId).orElseThrow();
        assertThat(inactive.isActive()).isFalse();
        assertThat(request(member, HttpMethod.GET, "/api/groups/" + groupId, "").statusCode())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(json.readTree(request(owner, HttpMethod.GET, "/api/groups/" + groupId, "").body())
                .get("members").size()).isEqualTo(1);

        join(member, code);
        GroupMembership reactivated = memberships.findById(membershipId).orElseThrow();
        assertThat(reactivated.isActive()).isTrue();
        assertThat(reactivated.getRole()).isEqualTo(GroupRole.MEMBER);
        assertThat(memberships.findAllByGroupIdAndActiveTrue(groupId)).hasSize(2);

        assertThat(join(owner, code).get("role").asText()).isEqualTo("OWNER");
        assertThat(request(owner, HttpMethod.DELETE,
                "/api/groups/" + groupId + "/membership", "").statusCode())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
        GroupMembership ownerMembership = memberships.findByGroupIdAndUserId(groupId, owner.userId()).orElseThrow();
        assertThat(ownerMembership.isActive()).isTrue();
        assertThat(ownerMembership.getRole()).isEqualTo(GroupRole.OWNER);
    }

    @Test
    void ownerAloneControlsNonCacheableJoinCodeAndRegenerationInvalidatesOldCode() throws Exception {
        AuthenticatedClient owner = registerAndLogin("owner@example.com", "Owner");
        AuthenticatedClient member = registerAndLogin("member@example.com", "Member");
        AuthenticatedClient outsider = registerAndLogin("outsider@example.com", "Outsider");
        UUID groupId = UUID.fromString(createGroup(owner, "Pod").get("id").asText());
        String oldCode = retrieveCode(owner, groupId);
        join(member, oldCode);

        assertThat(request(member, HttpMethod.GET,
                "/api/groups/" + groupId + "/join-code", "").statusCode())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(request(member, HttpMethod.POST,
                "/api/groups/" + groupId + "/join-code", "").statusCode())
                .isEqualTo(HttpStatus.FORBIDDEN.value());

        HttpResponse<String> regenerate = request(owner, HttpMethod.POST,
                "/api/groups/" + groupId + "/join-code", "");
        assertThat(regenerate.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(regenerate.headers().firstValue(HttpHeaders.CACHE_CONTROL).orElseThrow()).contains("no-store");
        String newCode = json.readTree(regenerate.body()).get("code").asText();
        assertThat(newCode).isNotEqualTo(oldCode);
        assertThat(request(outsider, HttpMethod.POST, "/api/groups/join", codeBody(oldCode)).statusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(join(outsider, newCode).get("role").asText()).isEqualTo("MEMBER");
    }

    @Test
    void retriesJoinCodeCollisionsWithoutPartialGroupsOrMemberships() throws Exception {
        AuthenticatedClient firstOwner = registerAndLogin("first@example.com", "First");
        AuthenticatedClient secondOwner = registerAndLogin("second@example.com", "Second");
        doReturn(COLLIDING_CODE).when(joinCodes).generate();
        UUID firstGroup = UUID.fromString(createGroup(firstOwner, "First group").get("id").asText());
        assertThat(retrieveCode(firstOwner, firstGroup)).isEqualTo(COLLIDING_CODE);

        doReturn(COLLIDING_CODE, RETRY_CODE).when(joinCodes).generate();
        UUID secondGroup = UUID.fromString(createGroup(secondOwner, "Second group").get("id").asText());
        assertThat(retrieveCode(secondOwner, secondGroup)).isEqualTo(RETRY_CODE);
        assertThat(groups.count()).isEqualTo(2);
        assertThat(memberships.count()).isEqualTo(2);

        doReturn(RETRY_CODE, COLLIDING_CODE, ROTATED_CODE).when(joinCodes).generate();
        HttpResponse<String> rotation = request(secondOwner, HttpMethod.POST,
                "/api/groups/" + secondGroup + "/join-code", "");
        assertThat(rotation.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(json.readTree(rotation.body()).get("code").asText()).isEqualTo(ROTATED_CODE);
        assertThat(groups.count()).isEqualTo(2);
        assertThat(memberships.count()).isEqualTo(2);
    }

    @Test
    void concurrentDuplicateJoinsCreateOneMembership() throws Exception {
        AuthenticatedClient owner = registerAndLogin("owner@example.com", "Owner");
        AuthenticatedClient member = registerAndLogin("member@example.com", "Member");
        UUID groupId = UUID.fromString(createGroup(owner, "Pod").get("id").asText());
        String code = retrieveCode(owner, groupId);
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<HttpResponse<String>> first = executor.submit(() -> {
                start.await();
                return request(member, HttpMethod.POST, "/api/groups/join", codeBody(code));
            });
            Future<HttpResponse<String>> second = executor.submit(() -> {
                start.await();
                return request(member, HttpMethod.POST, "/api/groups/join", codeBody(code));
            });
            start.countDown();
            assertThat(first.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(HttpStatus.OK.value());
            assertThat(second.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(HttpStatus.OK.value());
        }
        assertThat(memberships.findAllByGroupIdAndActiveTrue(groupId)).hasSize(2);
        assertThat(memberships.findByGroupIdAndUserId(groupId, member.userId())).isPresent();
    }

    @Test
    void joinWaitingOnRegenerationCannotUseCodeAfterNewCodeCommits() throws Exception {
        AuthenticatedClient owner = registerAndLogin("owner@example.com", "Owner");
        AuthenticatedClient outsider = registerAndLogin("outsider@example.com", "Outsider");
        UUID groupId = UUID.fromString(createGroup(owner, "Pod").get("id").asText());
        String oldCode = retrieveCode(owner, groupId);
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch rotate = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<?> rotation = executor.submit(() -> transactions.executeWithoutResult(status -> {
                jdbc.queryForObject("SELECT id FROM play_groups WHERE id = ? FOR UPDATE", UUID.class, groupId);
                locked.countDown();
                await(rotate);
                jdbc.update("UPDATE play_groups SET join_code = ? WHERE id = ?", ROTATED_CODE, groupId);
            }));
            assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
            Future<HttpResponse<String>> join = executor.submit(() ->
                    request(outsider, HttpMethod.POST, "/api/groups/join", codeBody(oldCode)));
            Thread.sleep(150);
            assertThat(join.isDone()).isFalse();
            rotate.countDown();
            rotation.get(10, TimeUnit.SECONDS);
            assertThat(join.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        }
        assertThat(memberships.findByGroupIdAndUserId(groupId, outsider.userId())).isEmpty();
    }

    @Test
    void rejectsInvalidInputAndEnforcesAuthenticationCsrfAndDatabaseConstraints() throws Exception {
        AuthenticatedClient owner = registerAndLogin("owner@example.com", "Owner");
        AuthenticatedClient outsider = registerAndLogin("outsider@example.com", "Outsider");
        UUID groupId = UUID.fromString(createGroup(owner, "Pod").get("id").asText());
        long groupCount = groups.count();

        for (String body : List.of("{}", "{\"name\":null}", "{\"name\":\"\u00a0\u202f\"}")) {
            assertThat(request(owner, HttpMethod.POST, "/api/groups", body).statusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST.value());
        }
        for (String body : List.of("{}", "{\"code\":null}", "{\"code\":\" \"}",
                "{\"code\":\"unknown_______________\"}")) {
            assertThat(request(outsider, HttpMethod.POST, "/api/groups/join", body).statusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST.value());
        }
        assertThat(request(owner, HttpMethod.GET, "/api/groups/not-a-uuid", "").statusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(request(owner, HttpMethod.GET, "/api/groups/" + UUID.randomUUID(), "").statusCode())
                .isEqualTo(HttpStatus.NOT_FOUND.value());
        assertThat(groups.count()).isEqualTo(groupCount);
        assertThat(memberships.count()).isEqualTo(1);

        assertThat(send(HttpMethod.GET, "/api/groups", "", "", null).statusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(send(HttpMethod.POST, "/api/groups", "{\"name\":\"X\"}",
                owner.cookie(), null).statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(send(HttpMethod.DELETE, "/api/groups/" + groupId + "/membership", "",
                outsider.cookie(), null).statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());

        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO play_groups (id, name, join_code, owner_id) VALUES (?, ?, ?, ?)",
                UUID.randomUUID(), " ", RETRY_CODE, owner.userId()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO play_groups (id, name, join_code, owner_id) VALUES (?, ?, ?, ?)",
                UUID.randomUUID(), "Ownerless", RETRY_CODE, owner.userId()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO group_memberships (id, group_id, user_id, role, active) VALUES (?, ?, ?, ?, ?)",
                UUID.randomUUID(), groupId, owner.userId(), "MEMBER", true))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO group_memberships (id, group_id, user_id, role, active) VALUES (?, ?, ?, ?, ?)",
                UUID.randomUUID(), groupId, outsider.userId(), "OWNER", true))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private JsonNode createGroup(AuthenticatedClient actor, String name) throws Exception {
        HttpResponse<String> response = request(actor, HttpMethod.POST, "/api/groups",
                json.writeValueAsString(Map.of("name", name, "ownerId", UUID.randomUUID(), "role", "MEMBER")));
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        return json.readTree(response.body());
    }

    private JsonNode join(AuthenticatedClient actor, String code) throws Exception {
        HttpResponse<String> response = request(actor, HttpMethod.POST, "/api/groups/join",
                json.writeValueAsString(Map.of("code", code, "actorId", UUID.randomUUID(), "role", "OWNER")));
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        return json.readTree(response.body());
    }

    private String retrieveCode(AuthenticatedClient owner, UUID groupId) throws Exception {
        HttpResponse<String> response = request(owner, HttpMethod.GET,
                "/api/groups/" + groupId + "/join-code", "");
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(response.headers().firstValue(HttpHeaders.CACHE_CONTROL).orElseThrow()).contains("no-store");
        return json.readTree(response.body()).get("code").asText();
    }

    private String codeBody(String code) {
        return json.writeValueAsString(Map.of("code", code));
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

    private void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting for test coordination.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }

    private record AuthenticatedClient(String cookie, String token, UUID userId) {
    }
}
