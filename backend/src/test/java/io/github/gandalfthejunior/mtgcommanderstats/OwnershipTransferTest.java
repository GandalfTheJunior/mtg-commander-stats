package io.github.gandalfthejunior.mtgcommanderstats;

import java.time.Duration;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameResult;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.ManageOwnershipTransfers;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.OwnershipTransferConflictException;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupRole;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

class OwnershipTransferTest extends GameTestSupport {
    @Autowired
    private ManageOwnershipTransfers transfers;

    private String path(Fixture f) { return "/api/groups/" + f.groupId() + "/ownership-transfer"; }
    private String request(UUID id) { return "{\"requestId\":\"" + id + "\"}"; }
    private String target(Actor actor) { return "{\"targetUserId\":\"" + actor.id() + "\"}"; }

    private UUID propose(Fixture f) throws Exception {
        groupService.changeRole(f.owner().id(), f.groupId(), f.creator().id(), GroupRole.ADMIN);
        return id(expect(f.owner(), "POST", path(f), target(f.creator()), 201));
    }

    @Test
    void acceptancePreservesHistoryAndMembershipsAndImmediatelySwitchesPermissions() throws Exception {
        Fixture f = fixture();
        createGame(f.creator().id(), f.groupId(), assignments(f), GameResult.WIN, f.creator().id());
        List<Map<String, Object>> history = jdbc.queryForList("SELECT * FROM games");
        List<Map<String, Object>> participants = jdbc.queryForList("SELECT * FROM game_participants ORDER BY user_id");
        List<Map<String, Object>> decksBefore = jdbc.queryForList("SELECT * FROM decks ORDER BY id");
        List<UUID> memberIds = jdbc.queryForList("SELECT id FROM group_memberships ORDER BY id", UUID.class);
        UUID id = propose(f);
        JsonNode pending = expect(f.creator(), "GET", path(f), "", 200);
        assertThat(pending.get("requesterUsername").asText()).isEqualTo("Owner");
        assertThat(pending.toString()).doesNotContain("email", "code", "password");
        assertThat(expect(f.owner(), "GET", path(f), "", 200)).isEqualTo(pending);
        assertOwner(f, f.owner());
        assertThat(expect(f.creator(), "POST", path(f) + "/accept", request(id), 200).get("state").asText())
                .isEqualTo("ACCEPTED");
        assertOwner(f, f.creator());
        assertThat(groupService.details(f.owner().id(), f.groupId()).role()).isEqualTo(GroupRole.MEMBER);
        expect(f.owner(), "POST", "/api/groups/" + f.groupId() + "/invitations", "", 201);
        expect(f.creator(), "POST", "/api/groups/" + f.groupId() + "/invitations", "", 201);
        expect(f.owner(), "PATCH", "/api/groups/" + f.groupId() + "/members/" + f.member().id() + "/role",
                "{\"role\":\"ADMIN\"}", 403);
        groupService.changeRole(f.creator().id(), f.groupId(), f.member().id(), GroupRole.ADMIN);
        assertThat(jdbc.queryForList("SELECT * FROM games")).isEqualTo(history);
        assertThat(jdbc.queryForList("SELECT * FROM game_participants ORDER BY user_id")).isEqualTo(participants);
        assertThat(jdbc.queryForList("SELECT * FROM decks ORDER BY id")).isEqualTo(decksBefore);
        assertThat(jdbc.queryForList("SELECT id FROM group_memberships ORDER BY id", UUID.class)).isEqualTo(memberIds);
        expect(f.creator(), "POST", path(f) + "/accept", request(id), 409);
        expect(f.creator(), "POST", path(f) + "/decline", request(id), 409);
        expect(f.owner(), "DELETE", path(f), request(id), 409);
        expect(f.creator(), "POST", path(f), target(f.member()), 201);
        groupService.leave(f.owner().id(), f.groupId());
        assertOwner(f, f.creator());
    }

    @ParameterizedTest
    @ValueSource(strings = {"accept", "decline"})
    void noticesAreRecipientOnlyAndGetDoesNotConsumeThem(String action) throws Exception {
        Fixture f = fixture();
        UUID id = propose(f);
        expect(f.creator(), "POST", path(f) + "/" + action, request(id), 200);
        expect(f.owner(), "DELETE", "/api/session", "", 204);
        Actor owner = loginAgain();
        JsonNode notices = expect(owner, "GET", path(f) + "/notices", "", 200);
        assertThat(notices.size()).isEqualTo(1);
        assertThat(id(notices.get(0))).isEqualTo(id);
        assertThat(expect(owner, "GET", path(f) + "/notices", "", 200)).isEqualTo(notices);
        for (Actor other : List.of(f.creator(), f.member())) {
            assertThat(expect(other, "GET", path(f) + "/notices", "", 200).isEmpty()).isTrue();
            expect(other, "POST", path(f) + "/notices/" + id + "/acknowledge", "{}", 404);
        }
        expect(owner, "POST", path(f) + "/notices/" + id + "/acknowledge", "{}", 204);
        assertThat(expect(owner, "GET", path(f) + "/notices", "", 200).isEmpty()).isTrue();
        expect(owner, "POST", path(f) + "/notices/" + id + "/acknowledge", "{}", 409);
    }

    @Test
    void authorizesActorsTargetsReadsAndCrossGroupIdentity() throws Exception {
        Fixture f = fixture();
        for (Actor actor : List.of(f.creator(), f.member(), f.outsider())) {
            expect(actor, "POST", path(f), target(f.creator()), 403);
        }
        expect(f.owner(), "POST", path(f), target(f.member()), 403);
        expect(f.owner(), "POST", path(f), target(f.outsider()), 404);
        UUID id = propose(f);
        expect(f.owner(), "POST", path(f), target(f.creator()), 409);
        groupService.changeRole(f.owner().id(), f.groupId(), f.member().id(), GroupRole.ADMIN);
        expect(f.creator(), "POST", path(f), target(f.member()), 403);
        for (Actor actor : List.of(f.member(), f.outsider())) {
            expect(actor, "GET", path(f), "", actor == f.member() ? 404 : 403);
            expect(actor, "POST", path(f) + "/accept", request(id), 404);
            expect(actor, "POST", path(f) + "/decline", request(id), 404);
            expect(actor, "DELETE", path(f), request(id), 404);
        }
        UUID other = groupService.create(f.outsider().id(), "Other").id();
        String otherPath = "/api/groups/" + other + "/ownership-transfer";
        expect(f.outsider(), "POST", otherPath + "/accept", request(id), 404);
        expect(f.outsider(), "DELETE", otherPath, request(id), 404);
        expect(f.outsider(), "POST", otherPath + "/notices/" + id + "/acknowledge", "{}", 404);
        assertOwner(f, f.owner());
    }

    @Test
    void withdrawalAndDeclinePreserveRolesAndStaleIdsCannotAffectNewRequests() throws Exception {
        Fixture f = fixture();
        UUID first = propose(f);
        List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM group_memberships ORDER BY id");
        expect(f.owner(), "DELETE", path(f), request(first), 204);
        assertThat(expect(f.owner(), "GET", path(f) + "/notices", "", 200).isEmpty()).isTrue();
        UUID second = id(expect(f.owner(), "POST", path(f), target(f.creator()), 201));
        expect(f.creator(), "POST", path(f) + "/accept", request(first), 409);
        expect(f.creator(), "POST", path(f) + "/decline", request(first), 409);
        expect(f.owner(), "DELETE", path(f), request(first), 409);
        assertThat(id(expect(f.owner(), "GET", path(f), "", 200))).isEqualTo(second);
        expect(f.creator(), "POST", path(f) + "/decline", request(second), 200);
        assertThat(jdbc.queryForList("SELECT * FROM group_memberships ORDER BY id")).isEqualTo(before);
        expect(f.owner(), "POST", path(f), target(f.creator()), 201);
    }

    @Test
    void validatesStrictPayloadsCsrfAuthenticationAndMissingResources() throws Exception {
        Fixture f = fixture();
        UUID id = propose(f);
        for (String body : List.of("{}", "null", "{\"targetUserId\":null}", "{\"targetUserId\":1}",
                "{\"targetUserId\":\"bad\"}", "{\"targetUserId\":\"1-1-1-1-1\"}",
                target(f.creator()).replace("}", ",\"actorId\":null}"))) {
            expect(f.owner(), "POST", path(f), body, 400);
        }
        for (String endpoint : List.of("/accept", "/decline", "")) {
            String method = endpoint.isEmpty() ? "DELETE" : "POST";
            for (String body : List.of("{}", "null", "{\"requestId\":null}", "{\"requestId\":true}",
                    request(id).replace("}", ",\"role\":\"OWNER\"}"))) {
                expect(f.creator(), method, path(f) + endpoint, body, 400);
            }
            expect(new Actor(f.creator().cookie(), null, f.creator().id()), method,
                    path(f) + endpoint, request(id), 403);
        }
        expect(f.owner(), "POST", path(f) + "/notices/" + id + "/acknowledge", "{\"recipientId\":null}", 400);
        expect(null, "GET", path(f), "", 401);
        expect(null, "GET", path(f) + "/notices", "", 401);
        expect(f.owner(), "GET", "/api/groups/" + UUID.randomUUID() + "/ownership-transfer", "", 404);
        expect(f.owner(), "GET", "/api/groups/not-a-uuid/ownership-transfer", "", 400);
        expect(f.creator(), "POST", path(f) + "/accept", request(UUID.randomUUID()), 404);
    }

    @Test
    void unsafeRoutesRequireAuthenticationAndCsrfAndInactiveActorsCannotInitiate() throws Exception {
        Fixture f = fixture();
        UUID id = propose(f);
        HttpResponse<String> bootstrap = send(null, "GET", "/api/csrf", "");
        Actor anonymous = new Actor(bootstrap.headers().firstValue("Set-Cookie").orElseThrow().split(";", 2)[0],
                json.readTree(bootstrap.body()).get("token").asText(), null);
        for (String endpoint : List.of("", "/accept", "/decline", "/notices/" + id + "/acknowledge")) {
            String body = endpoint.isEmpty() ? target(f.creator())
                    : endpoint.endsWith("acknowledge") ? "{}" : request(id);
            expect(anonymous, "POST", path(f) + endpoint, body, 401);
            expect(new Actor(f.owner().cookie(), "invalid-token", f.owner().id()), "POST",
                    path(f) + endpoint, body, 403);
        }
        expect(anonymous, "DELETE", path(f), request(id), 401);
        groupService.leave(f.member().id(), f.groupId());
        expect(f.member(), "POST", path(f), target(f.creator()), 403);
        expect(f.member(), "GET", path(f), "", 403);
        expect(f.member(), "GET", path(f) + "/notices", "", 403);
    }

    @Test
    void databaseRejectsDuplicatePendingRequestsAndInterruptedAcceptanceRollsBack() throws Exception {
        Fixture f = fixture();
        UUID id = propose(f);
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO ownership_transfers(id, group_id, requester_id, target_id, state, created_at)
                VALUES (?, ?, ?, ?, 'PENDING', now())
                """, UUID.randomUUID(), f.groupId(), f.owner().id(), f.creator().id()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> transactions.executeWithoutResult(tx -> {
            transfers.respond(f.creator().id(), f.groupId(), id, true);
            throw new IllegalStateException("Simulated interrupted transaction");
        })).isInstanceOf(IllegalStateException.class);
        assertOwner(f, f.owner());
        assertThat(transfers.pending(f.owner().id(), f.groupId()).state().name()).isEqualTo("PENDING");
        assertThat(transfers.notices(f.owner().id(), f.groupId())).isEmpty();
        expect(f.creator(), "POST", path(f) + "/accept", request(id), 200);
    }

    @ParameterizedTest
    @ValueSource(strings = {"accept", "withdraw", "decline", "demote", "remove", "leave"})
    void concurrentTransitionsSerializeOnGroupAndPreserveOwnerInvariant(String competing) throws Exception {
        Fixture f = fixture();
        UUID id = propose(f);
        try (ExecutorService executor = Executors.newSingleThreadExecutor()) {
            Future<?>[] pending = new Future<?>[1];
            transactions.executeWithoutResult(tx -> {
                jdbc.queryForObject("SELECT id FROM play_groups WHERE id = ? FOR UPDATE", UUID.class, f.groupId());
                int blocker = jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class);
                pending[0] = executor.submit(() -> {
                    try {
                        transfers.respond(f.creator().id(), f.groupId(), id, true);
                        return "accepted";
                    } catch (OwnershipTransferConflictException exception) {
                        return "conflict";
                    }
                });
                await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> assertThat(jdbc.queryForObject("""
                        SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'
                        AND query LIKE '%play_groups%' AND ? = ANY(pg_blocking_pids(pid))
                        """, Integer.class, blocker)).isEqualTo(1));
                switch (competing) {
                    case "accept" -> transfers.respond(f.creator().id(), f.groupId(), id, true);
                    case "withdraw" -> transfers.withdraw(f.owner().id(), f.groupId(), id);
                    case "decline" -> transfers.respond(f.creator().id(), f.groupId(), id, false);
                    case "demote", "remove" -> {
                        groupService.changeRole(f.owner().id(), f.groupId(), f.creator().id(), GroupRole.MEMBER);
                        if (competing.equals("remove")) {
                            groupService.removeMember(f.owner().id(), f.groupId(), f.creator().id());
                        }
                    }
                    case "leave" -> groupService.leave(f.creator().id(), f.groupId());
                    default -> throw new AssertionError(competing);
                }
            });
            assertThat(pending[0].get(15, TimeUnit.SECONDS)).isEqualTo("conflict");
        }
        assertOwner(f, competing.equals("accept") ? f.creator() : f.owner());
        if (List.of("demote", "remove", "leave").contains(competing)) {
            expect(f.owner(), "DELETE", path(f), request(id), 204);
        }
    }

    @Test
    void concurrentInitiationCreatesExactlyOnePendingRequest() throws Exception {
        Fixture f = fixture();
        groupService.changeRole(f.owner().id(), f.groupId(), f.creator().id(), GroupRole.ADMIN);
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            List<Future<String>> results = java.util.stream.IntStream.range(0, 2).mapToObj(i -> executor.submit(() -> {
                start.await();
                try {
                    transfers.create(f.owner().id(), f.groupId(), f.creator().id());
                    return "created";
                } catch (OwnershipTransferConflictException exception) {
                    return "conflict";
                }
            })).toList();
            start.countDown();
            assertThat(List.of(results.get(0).get(15, TimeUnit.SECONDS), results.get(1).get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("created", "conflict");
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ownership_transfers WHERE state = 'PENDING'", Integer.class))
                .isEqualTo(1);
        assertOwner(f, f.owner());
    }

    private Actor loginAgain() throws Exception {
        HttpResponse<String> bootstrap = send(null, "GET", "/api/csrf", "");
        Actor anonymous = new Actor(bootstrap.headers().firstValue("Set-Cookie").orElseThrow().split(";", 2)[0],
                json.readTree(bootstrap.body()).get("token").asText(), null);
        HttpResponse<String> login = send(anonymous, "POST", "/api/session",
                "{\"email\":\"owner@example.com\",\"password\":\"correct horse battery\"}");
        assertThat(login.statusCode()).isEqualTo(200);
        Actor session = new Actor(login.headers().firstValue("Set-Cookie").orElseThrow().split(";", 2)[0], null, null);
        return new Actor(session.cookie(), expect(session, "GET", "/api/csrf", "", 200).get("token").asText(), null);
    }

    private void assertOwner(Fixture f, Actor owner) {
        assertThat(jdbc.queryForObject("SELECT owner_id FROM play_groups WHERE id = ?", UUID.class, f.groupId()))
                .isEqualTo(owner.id());
        assertThat(jdbc.queryForList("SELECT user_id FROM group_memberships WHERE group_id = ? AND active AND role = 'OWNER'",
                UUID.class, f.groupId())).containsExactly(owner.id());
    }
}
