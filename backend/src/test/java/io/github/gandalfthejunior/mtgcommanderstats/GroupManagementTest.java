package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.URI;
import java.sql.SQLException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.stubbing.Answer;
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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mockingDetails;
import static org.awaitility.Awaitility.await;

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
    @MockitoSpyBean
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

        List<JsonNode> expectedMembers = List.of(
                memberJson(alice, "Alice", "OWNER"), memberJson(bob, "Same Name", "MEMBER"),
                memberJson(carol, "Carol", "MEMBER"), memberJson(dave, "Same Name", "MEMBER"));
        for (AuthenticatedClient member : List.of(alice, bob, carol, dave)) {
            HttpResponse<String> response = request(member, HttpMethod.GET, "/api/groups/" + groupId, "");
            assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
            JsonNode details = json.readTree(response.body());
            assertThat(memberList(details)).containsExactlyInAnyOrderElementsOf(expectedMembers);
            assertThat(details.get("id").asText()).isEqualTo(groupId.toString());
            assertThat(details.get("name").asText()).isEqualTo("Friday  Commander");
            assertThat(details.get("role").asText()).isEqualTo(member == alice ? "OWNER" : "MEMBER");
            assertThat(details.toString()).doesNotContain("email", "password", "code");
        }

        // Restore identity in a separate HTTP request using only the persisted session cookie.
        HttpResponse<String> restored = send(HttpMethod.GET, "/api/me", "", alice.cookie(), null);
        assertThat(restored.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(json.readTree(restored.body()).get("id").asText()).isEqualTo(alice.userId().toString());
        assertThat(json.readTree(send(HttpMethod.GET, "/api/groups", "", alice.cookie(), null).body()))
                .isEqualTo(json.valueToTree(List.of(created)));

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
        assertThat(inactive.getId()).isEqualTo(membershipId);
        assertThat(json.readTree(request(member, HttpMethod.GET, "/api/groups", "").body()).size()).isZero();
        assertThat(request(member, HttpMethod.GET, "/api/groups/" + groupId, "").statusCode())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(memberList(json.readTree(request(owner, HttpMethod.GET, "/api/groups/" + groupId, "").body())))
                .containsExactly(memberJson(owner, "Owner", "OWNER"));

        join(member, code);
        GroupMembership reactivated = memberships.findById(membershipId).orElseThrow();
        assertThat(reactivated.isActive()).isTrue();
        assertThat(memberships.findByGroupIdAndUserId(groupId, member.userId()).orElseThrow().getId())
                .isEqualTo(membershipId);
        assertThat(json.readTree(request(member, HttpMethod.GET, "/api/groups", "").body()).size()).isEqualTo(1);
        assertThat(reactivated.getRole()).isEqualTo(GroupRole.MEMBER);
        assertThat(memberships.findAllByGroupIdAndActiveTrue(groupId)).hasSize(2);

        assertThat(join(owner, code).get("role").asText()).isEqualTo("OWNER");
        assertRejectedWithoutWrites(owner, HttpMethod.DELETE,
                "/api/groups/" + groupId + "/membership", "", HttpStatus.FORBIDDEN);
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
        assertRejectedWithoutWrites(member, HttpMethod.POST,
                "/api/groups/" + groupId + "/join-code", "", HttpStatus.FORBIDDEN);

        HttpResponse<String> regenerate = request(owner, HttpMethod.POST,
                "/api/groups/" + groupId + "/join-code", "");
        assertThat(regenerate.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(regenerate.headers().firstValue(HttpHeaders.CACHE_CONTROL).orElseThrow()).contains("no-store");
        String newCode = json.readTree(regenerate.body()).get("code").asText();
        assertThat(newCode).isNotEqualTo(oldCode);
        assertRejectedWithoutWrites(outsider, HttpMethod.POST,
                "/api/groups/join", codeBody(oldCode), HttpStatus.BAD_REQUEST);
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
        try (ExecutorService executor = Executors.newFixedThreadPool(2);
                MembershipReadGate gate = pauseMembershipRead(groupId, member.userId())) {
            Future<HttpResponse<String>> first = executor.submit(() ->
                    request(member, HttpMethod.POST, "/api/groups/join", codeBody(code)));
            gate.awaitHoldingLock();
            Future<HttpResponse<String>> second = executor.submit(() ->
                    request(member, HttpMethod.POST, "/api/groups/join", codeBody(code)));
            assertWaitingForGroupLock(gate);
            gate.close();
            assertThat(first.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(HttpStatus.OK.value());
            assertThat(second.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(HttpStatus.OK.value());
        }
        assertThat(memberships.findAllByGroupIdAndActiveTrue(groupId)).hasSize(2);
        assertThat(memberships.count()).isEqualTo(2);
        UUID membershipId = memberships.findByGroupIdAndUserId(groupId, member.userId()).orElseThrow().getId();
        join(member, code);
        assertThat(memberships.findByGroupIdAndUserId(groupId, member.userId()).orElseThrow().getId())
                .isEqualTo(membershipId);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void joinWaitingOnRegenerationCannotUseCodeAfterNewCodeCommits(boolean formerMember) throws Exception {
        AuthenticatedClient owner = registerAndLogin("owner@example.com", "Owner");
        AuthenticatedClient joiner = registerAndLogin("joiner@example.com", "Joiner");
        UUID groupId = UUID.fromString(createGroup(owner, "Pod").get("id").asText());
        String oldCode = retrieveCode(owner, groupId);
        if (formerMember) {
            join(joiner, oldCode);
            assertThat(request(joiner, HttpMethod.DELETE, "/api/groups/" + groupId + "/membership", "")
                    .statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        }
        List<Map<String, Object>> beforeMemberships = membershipRows();
        try (ExecutorService executor = Executors.newFixedThreadPool(2);
                MembershipReadGate gate = pauseMembershipRead(groupId, owner.userId())) {
            // Pause the real rotation transaction after its group lock, before it changes the code.
            Future<HttpResponse<String>> rotation = executor.submit(() -> request(owner, HttpMethod.POST,
                    "/api/groups/" + groupId + "/join-code", ""));
            gate.awaitHoldingLock();
            Future<HttpResponse<String>> join = executor.submit(() ->
                    request(joiner, HttpMethod.POST, "/api/groups/join", codeBody(oldCode)));
            assertWaitingForGroupLock(gate);
            gate.close();
            HttpResponse<String> rotated = rotation.get(10, TimeUnit.SECONDS);
            assertThat(rotated.statusCode()).isEqualTo(HttpStatus.OK.value());
            assertThat(json.readTree(rotated.body()).get("code").asText()).isNotEqualTo(oldCode);
            assertProblem(join.get(10, TimeUnit.SECONDS), HttpStatus.BAD_REQUEST);
        }
        assertThat(membershipRows()).isEqualTo(beforeMemberships);
    }

    @Test
    void joinHoldingLockCompletesBeforeWaitingRegenerationAndKeepsItsMembership() throws Exception {
        AuthenticatedClient owner = registerAndLogin("owner@example.com", "Owner");
        AuthenticatedClient member = registerAndLogin("member@example.com", "Member");
        AuthenticatedClient outsider = registerAndLogin("outsider@example.com", "Outsider");
        UUID groupId = UUID.fromString(createGroup(owner, "Pod").get("id").asText());
        String oldCode = retrieveCode(owner, groupId);
        try (ExecutorService executor = Executors.newFixedThreadPool(2);
                MembershipReadGate gate = pauseMembershipRead(groupId, member.userId())) {
            Future<HttpResponse<String>> join = executor.submit(() ->
                    request(member, HttpMethod.POST, "/api/groups/join", codeBody(oldCode)));
            gate.awaitHoldingLock();
            Future<HttpResponse<String>> rotation = executor.submit(() -> request(owner, HttpMethod.POST,
                    "/api/groups/" + groupId + "/join-code", ""));
            assertWaitingForGroupLock(gate);
            gate.close();
            assertThat(join.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(HttpStatus.OK.value());
            assertThat(rotation.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(HttpStatus.OK.value());
        }
        assertThat(retrieveCode(owner, groupId)).isNotEqualTo(oldCode);
        GroupMembership joined = memberships.findByGroupIdAndUserId(groupId, member.userId()).orElseThrow();
        assertThat(joined.isActive()).isTrue();
        assertThat(joined.getRole()).isEqualTo(GroupRole.MEMBER);
        assertRejectedWithoutWrites(outsider, HttpMethod.POST,
                "/api/groups/join", codeBody(oldCode), HttpStatus.BAD_REQUEST);
        assertThat(request(member, HttpMethod.GET, "/api/groups/" + groupId, "").statusCode())
                .isEqualTo(HttpStatus.OK.value());
    }

    @Test
    void rejectsInvalidInputAndEnforcesDatabaseConstraints() throws Exception {
        AuthenticatedClient owner = registerAndLogin("owner@example.com", "Owner");
        AuthenticatedClient outsider = registerAndLogin("outsider@example.com", "Outsider");
        UUID groupId = UUID.fromString(createGroup(owner, "Pod").get("id").asText());
        long groupCount = groups.count();

        for (String body : List.of("{}", "{\"name\":null}", "{\"name\":\"\u00a0\u202f\"}")) {
            assertRejectedWithoutWrites(owner, HttpMethod.POST, "/api/groups", body, HttpStatus.BAD_REQUEST);
        }
        for (String body : List.of("{}", "{\"code\":null}", "{\"code\":\" \"}",
                "{\"code\":\"unknown_______________\"}")) {
            assertRejectedWithoutWrites(outsider, HttpMethod.POST, "/api/groups/join", body, HttpStatus.BAD_REQUEST);
        }
        assertThat(request(owner, HttpMethod.GET, "/api/groups/not-a-uuid", "").statusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(request(owner, HttpMethod.GET, "/api/groups/" + UUID.randomUUID(), "").statusCode())
                .isEqualTo(HttpStatus.NOT_FOUND.value());
        assertThat(groups.count()).isEqualTo(groupCount);
        assertThat(memberships.count()).isEqualTo(1);

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

    @Test
    void rejectsMembershipMoveThatWouldLeavePreviousGroupWithoutOwnerAndRollsBack() throws Exception {
        AuthenticatedClient owner = registerAndLogin("owner@example.com", "Owner");
        UUID first = UUID.fromString(createGroup(owner, "A").get("id").asText());
        UUID second = UUID.fromString(createGroup(owner, "B").get("id").asText());
        DatabaseState before = databaseState();
        RuntimeException failure = assertThrows(RuntimeException.class, () ->
                transactions.executeWithoutResult(status -> {
                    jdbc.update("DELETE FROM group_memberships WHERE group_id = ?", second);
                    jdbc.update("UPDATE group_memberships SET group_id = ? WHERE group_id = ?", second, first);
                    // Both statements succeeded; the deferred invariant must reject the commit.
                    assertThat(jdbc.queryForObject("SELECT count(*) FROM group_memberships WHERE group_id = ?",
                            Integer.class, first)).isZero();
                }));
        assertOwnerConstraintViolation(failure);
        assertThat(databaseState()).isEqualTo(before);
    }

    @ParameterizedTest
    @ValueSource(strings = {"delete", "deactivate", "demote"})
    void rejectsRemovingLastActiveOwnerAndRollsBackEntireTransaction(String operation) throws Exception {
        AuthenticatedClient owner = registerAndLogin("owner@example.com", "Owner");
        UUID groupId = UUID.fromString(createGroup(owner, "Pod").get("id").asText());
        DatabaseState before = databaseState();
        String sql = switch (operation) {
            case "delete" -> "DELETE FROM group_memberships WHERE group_id = ?";
            case "deactivate" -> "UPDATE group_memberships SET active = false WHERE group_id = ?";
            case "demote" -> "UPDATE group_memberships SET role = 'MEMBER' WHERE group_id = ?";
            default -> throw new IllegalArgumentException(operation);
        };
        RuntimeException failure = assertThrows(RuntimeException.class, () ->
                transactions.executeWithoutResult(status -> {
                    jdbc.update("UPDATE play_groups SET name = 'Must roll back' WHERE id = ?", groupId);
                    jdbc.update(sql, groupId);
                }));
        assertOwnerConstraintViolation(failure);
        assertThat(databaseState()).isEqualTo(before);
    }

    @Test
    void rejectsActorOwnerAndRolePayloadTamperingWithoutAnyWrites() throws Exception {
        AuthenticatedClient owner = registerAndLogin("owner@example.com", "Owner");
        AuthenticatedClient member = registerAndLogin("member@example.com", "Member");
        AuthenticatedClient otherMember = registerAndLogin("other@example.com", "Other");
        AuthenticatedClient outsider = registerAndLogin("outsider@example.com", "Outsider");
        AuthenticatedClient former = registerAndLogin("former@example.com", "Former");
        UUID groupId = UUID.fromString(createGroup(owner, "Pod").get("id").asText());
        String code = retrieveCode(owner, groupId);
        join(member, code);
        join(otherMember, code);
        join(former, code);
        assertThat(request(former, HttpMethod.DELETE, "/api/groups/" + groupId + "/membership", "")
                .statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        UUID otherMembership = memberships.findByGroupIdAndUserId(groupId, otherMember.userId()).orElseThrow().getId();
        Map<String, String> tampering = Map.of("ownerId", otherMember.userId().toString(),
                "actorId", otherMember.userId().toString(), "userId", otherMember.userId().toString(),
                "membershipId", otherMembership.toString(), "role", "OWNER");
        for (Map.Entry<String, String> field : tampering.entrySet()) {
            assertRejectedWithoutWrites(member, HttpMethod.POST, "/api/groups",
                    json.writeValueAsString(Map.of("name", "Tampered", field.getKey(), field.getValue())),
                    HttpStatus.BAD_REQUEST);
            for (AuthenticatedClient joiner : List.of(outsider, former, member, owner)) {
                assertRejectedWithoutWrites(joiner, HttpMethod.POST, "/api/groups/join",
                        json.writeValueAsString(Map.of("code", code, field.getKey(), field.getValue())),
                        HttpStatus.BAD_REQUEST);
            }
            String body = json.writeValueAsString(Map.of(field.getKey(), field.getValue()));
            assertRejectedWithoutWrites(owner, HttpMethod.POST,
                    "/api/groups/" + groupId + "/join-code", body, HttpStatus.BAD_REQUEST);
            // The authenticated member and the named other member must both remain active and unchanged.
            assertRejectedWithoutWrites(member, HttpMethod.DELETE,
                    "/api/groups/" + groupId + "/membership", body, HttpStatus.BAD_REQUEST);
        }
        assertRejectedWithoutWrites(owner, HttpMethod.POST, "/api/groups",
                "{\"name\":\"Tampered\",\"role\":\"MEMBER\"}", HttpStatus.BAD_REQUEST);
        assertRejectedWithoutWrites(member, HttpMethod.POST, "/api/groups",
                "{\"name\":\"Tampered\",\"ownerId\":null}", HttpStatus.BAD_REQUEST);
    }

    @Test
    void allSevenOperationsRequireAuthenticationIndependentlyOfCsrf() throws Exception {
        AuthenticatedClient owner = registerAndLogin("owner@example.com", "Owner");
        AuthenticatedClient member = registerAndLogin("member@example.com", "Member");
        UUID groupId = UUID.fromString(createGroup(owner, "Pod").get("id").asText());
        String code = retrieveCode(owner, groupId);
        join(member, code);
        HttpResponse<String> anonymous = bootstrap("");
        List<GroupOperation> operations = new ArrayList<>(unsafeOperations(owner, member, groupId, code));
        operations.add(new GroupOperation(owner, HttpMethod.GET, "/api/groups", ""));
        operations.add(new GroupOperation(owner, HttpMethod.GET, "/api/groups/" + groupId, ""));
        operations.add(new GroupOperation(owner, HttpMethod.GET, "/api/groups/" + groupId + "/join-code", ""));
        assertThat(operations).hasSize(7);
        for (GroupOperation operation : operations) {
            assertRejectedWithSession(cookie(anonymous), token(anonymous), operation, HttpStatus.UNAUTHORIZED);
        }
    }

    @Test
    void allUnsafeOperationsRejectMissingAndInvalidCsrfForAuthenticatedAndAnonymousSessions() throws Exception {
        AuthenticatedClient owner = registerAndLogin("owner@example.com", "Owner");
        AuthenticatedClient member = registerAndLogin("member@example.com", "Member");
        UUID groupId = UUID.fromString(createGroup(owner, "Pod").get("id").asText());
        String code = retrieveCode(owner, groupId);
        join(member, code);
        HttpResponse<String> anonymous = bootstrap("");
        for (GroupOperation operation : unsafeOperations(owner, member, groupId, code)) {
            for (String session : List.of(operation.actor().cookie(), cookie(anonymous))) {
                assertRejectedWithSession(session, null, operation, HttpStatus.FORBIDDEN);
                assertRejectedWithSession(session, "invalid-csrf-token", operation, HttpStatus.FORBIDDEN);
            }
        }
    }

    @Test
    void outsidersFormerMembersAndRolesInOtherGroupsHaveNoAccess() throws Exception {
        AuthenticatedClient owner = registerAndLogin("owner@example.com", "Owner");
        AuthenticatedClient outsider = registerAndLogin("outsider@example.com", "Outsider");
        AuthenticatedClient former = registerAndLogin("former@example.com", "Former");
        AuthenticatedClient otherOwner = registerAndLogin("other-owner@example.com", "Other owner");
        AuthenticatedClient otherMember = registerAndLogin("other-member@example.com", "Other member");
        UUID target = UUID.fromString(createGroup(owner, "Target").get("id").asText());
        String code = retrieveCode(owner, target);
        join(former, code);
        assertThat(request(former, HttpMethod.DELETE, "/api/groups/" + target + "/membership", "")
                .statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        UUID other = UUID.fromString(createGroup(otherOwner, "Other").get("id").asText());
        join(otherMember, retrieveCode(otherOwner, other));
        for (AuthenticatedClient denied : List.of(outsider, former, otherOwner, otherMember)) {
            assertRejectedWithoutWrites(denied, HttpMethod.GET, "/api/groups/" + target, "", HttpStatus.FORBIDDEN);
            assertRejectedWithoutWrites(denied, HttpMethod.GET,
                    "/api/groups/" + target + "/join-code", "", HttpStatus.FORBIDDEN);
            assertRejectedWithoutWrites(denied, HttpMethod.POST,
                    "/api/groups/" + target + "/join-code", "", HttpStatus.FORBIDDEN);
            assertRejectedWithoutWrites(denied, HttpMethod.DELETE,
                    "/api/groups/" + target + "/membership", "", HttpStatus.FORBIDDEN);
        }
    }

    private List<GroupOperation> unsafeOperations(AuthenticatedClient owner, AuthenticatedClient member,
            UUID groupId, String code) {
        return List.of(new GroupOperation(owner, HttpMethod.POST, "/api/groups", "{\"name\":\"New group\"}"),
                new GroupOperation(member, HttpMethod.POST, "/api/groups/join", codeBody(code)),
                new GroupOperation(owner, HttpMethod.POST, "/api/groups/" + groupId + "/join-code", ""),
                new GroupOperation(member, HttpMethod.DELETE, "/api/groups/" + groupId + "/membership", ""));
    }

    private void assertOwnerConstraintViolation(RuntimeException failure) {
        Throwable cause = failure;
        while (cause != null && !(cause instanceof SQLException)) {
            cause = cause.getCause();
        }
        assertThat(cause).isInstanceOf(SQLException.class);
        assertThat(((SQLException) cause).getSQLState()).isEqualTo("23514");
        assertThat(cause.getMessage()).contains("must have its designated active owner membership");
    }

    private void assertRejectedWithoutWrites(AuthenticatedClient actor, HttpMethod method, String path,
            String body, HttpStatus status) throws Exception {
        assertProblem(assertRejectedWithSession(actor.cookie(), actor.token(),
                new GroupOperation(actor, method, path, body), status), status);
    }

    private HttpResponse<String> assertRejectedWithSession(String cookie, String csrf,
            GroupOperation operation, HttpStatus status)
            throws Exception {
        DatabaseState before = databaseState();
        HttpResponse<String> response = send(operation.method(), operation.path(), operation.body(), cookie, csrf);
        // Authentication/CSRF filters use the existing empty status responses, before controller advice.
        assertThat(response.statusCode()).as(response.body()).isEqualTo(status.value());
        assertThat(databaseState()).as("No writes from %s %s", operation.method(), operation.path()).isEqualTo(before);
        return response;
    }

    private void assertProblem(HttpResponse<String> response, HttpStatus status) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(status.value());
        assertThat(response.headers().firstValue(HttpHeaders.CONTENT_TYPE).orElseThrow())
                .startsWith(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        assertThat(json.readTree(response.body()).get("status").asInt()).isEqualTo(status.value());
    }

    private DatabaseState databaseState() {
        return new DatabaseState(jdbc.queryForList("SELECT * FROM play_groups ORDER BY id"), membershipRows());
    }

    private List<Map<String, Object>> membershipRows() {
        return jdbc.queryForList("SELECT * FROM group_memberships ORDER BY id");
    }

    private JsonNode memberJson(AuthenticatedClient actor, String username, String role) {
        return json.valueToTree(Map.of("userId", actor.userId().toString(), "username", username, "role", role));
    }

    private List<JsonNode> memberList(JsonNode details) {
        List<JsonNode> result = new ArrayList<>();
        details.get("members").forEach(result::add);
        return result;
    }

    private MembershipReadGate pauseMembershipRead(UUID groupId, UUID actorId) {
        MembershipReadGate gate = new MembershipReadGate();
        // Spring Data spies delegate to the repository proxy; its interface has no real method body.
        Answer<?> repository = mockingDetails(memberships).getMockCreationSettings().getDefaultAnswer();
        doAnswer(invocation -> {
            Object result = repository.answer(invocation);
            if (gate.first.compareAndSet(true, false)) {
                gate.backendPid.set(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
                gate.holdingLock.countDown();
                awaitLatch(gate.release);
            }
            return result;
        }).when(memberships).findByGroupIdAndUserId(groupId, actorId);
        return gate;
    }

    private void assertWaitingForGroupLock(MembershipReadGate gate) {
        // Observe the competing application's actual PostgreSQL wait, not merely a scheduled Future.
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                assertThat(jdbc.queryForObject("""
                        SELECT count(*) FROM pg_stat_activity
                        WHERE datname = current_database() AND wait_event_type = 'Lock'
                          AND query LIKE '%play_groups%'
                          AND ? = ANY(pg_blocking_pids(pid))
                        """, Integer.class, gate.backendPid.get())).isEqualTo(1));
    }

    private class MembershipReadGate implements AutoCloseable {
        private final AtomicBoolean first = new AtomicBoolean(true);
        private final AtomicInteger backendPid = new AtomicInteger();
        private final CountDownLatch holdingLock = new CountDownLatch(1);
        private final CountDownLatch release = new CountDownLatch(1);

        void awaitHoldingLock() {
            awaitLatch(holdingLock);
        }

        @Override
        public void close() {
            release.countDown();
        }
    }

    private record DatabaseState(List<Map<String, Object>> groups, List<Map<String, Object>> memberships) {
    }

    private record GroupOperation(AuthenticatedClient actor, HttpMethod method, String path, String body) {
    }

    private JsonNode createGroup(AuthenticatedClient actor, String name) throws Exception {
        HttpResponse<String> response = request(actor, HttpMethod.POST, "/api/groups",
                json.writeValueAsString(Map.of("name", name)));
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        return json.readTree(response.body());
    }

    private JsonNode join(AuthenticatedClient actor, String code) throws Exception {
        HttpResponse<String> response = request(actor, HttpMethod.POST, "/api/groups/join",
                codeBody(code));
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
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .timeout(Duration.ofSeconds(30));
        if (!cookie.isEmpty()) {
            request.header(HttpHeaders.COOKIE, cookie);
        }
        if (token != null) {
            request.header(CSRF_HEADER, token);
        }
        return client.send(request.method(method.name(), HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private void awaitLatch(CountDownLatch latch) {
        try {
            if (!latch.await(20, TimeUnit.SECONDS)) {
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
