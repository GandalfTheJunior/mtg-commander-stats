package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameResult;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.GroupAccessDeniedException;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupRole;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.dao.DataIntegrityViolationException;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

class GroupAdministrationTest extends GameTestSupport {
    private String memberPath(Fixture f, Actor target) {
        return "/api/groups/" + f.groupId() + "/members/" + target.id();
    }

    private JsonNode role(Fixture f, Actor actor, Actor target, String role, int status) throws Exception {
        return expect(actor, "PATCH", memberPath(f, target) + "/role", "{\"role\":\"" + role + "\"}", status);
    }

    @Test
    void ownerManagesRolesAndResponsesReflectCurrentRoleAndAllActiveRolesCanIssueInvitations() throws Exception {
        Fixture f = fixture();
        UUID membership = membershipId(f, f.creator());
        JsonNode promoted = role(f, f.owner(), f.creator(), "ADMIN", 200);
        assertThat(promoted).isEqualTo(json.valueToTree(Map.of("userId", f.creator().id(),
                "username", "Sam", "role", "ADMIN")));
        assertThat(role(f, f.owner(), f.creator(), "ADMIN", 200)).isEqualTo(promoted);
        assertThat(expect(f.creator(), "GET", "/api/groups", "", 200).get(0).get("role").asText()).isEqualTo("ADMIN");
        JsonNode details = expect(f.creator(), "GET", "/api/groups/" + f.groupId(), "", 200);
        assertThat(details.get("role").asText()).isEqualTo("ADMIN");
        assertThat(details.get("members").get(0).get("role").asText()).isEqualTo("OWNER");
        assertThat(details.get("members").get(1).get("role").asText()).isEqualTo("ADMIN");
        assertThat(details.get("members").get(2).get("role").asText()).isEqualTo("MEMBER");
        expect(f.creator(), "POST", "/api/groups/" + f.groupId() + "/invitations", "{}", 201);
        String code = groupService.createInvitation(f.owner().id(), f.groupId()).code();
        expect(f.creator(), "POST", "/api/groups/join", json.writeValueAsString(Map.of("code", code)), 409);
        assertThat(groupService.details(f.creator().id(), f.groupId()).role()).isEqualTo(GroupRole.ADMIN);
        role(f, f.owner(), f.creator(), "MEMBER", 200);
        role(f, f.owner(), f.creator(), "MEMBER", 200);
        assertThat(membershipId(f, f.creator())).isEqualTo(membership);
        expect(f.owner(), "DELETE", memberPath(f, f.creator()), "", 204);
        expect(f.owner(), "DELETE", memberPath(f, f.creator()), "", 404);
    }

    @Test
    void rejectsUnauthorizedActorsAndForbiddenTargetsBeforeProtectedTargetLookup() throws Exception {
        Fixture f = fixture();
        role(f, f.owner(), f.creator(), "ADMIN", 200);
        UUID other = groupService.create(f.outsider().id(), "Other").id();
        groupService.join(f.member().id(), groupService.createInvitation(f.outsider().id(), other).code());
        groupService.changeRole(f.outsider().id(), other, f.member().id(), GroupRole.ADMIN);
        List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM group_memberships ORDER BY id");
        for (Actor actor : List.of(f.creator(), f.member(), f.outsider())) {
            for (Actor target : List.of(f.owner(), f.creator(), f.member(), f.outsider())) {
                role(f, actor, target, "ADMIN", 403);
            }
        }
        role(f, f.owner(), f.owner(), "MEMBER", 403);
        for (Actor target : List.of(f.owner(), f.creator())) {
            for (Actor actor : List.of(f.owner(), f.creator())) {
                expect(actor, "DELETE", memberPath(f, target), "", 403);
            }
        }
        for (Actor target : List.of(f.member(), f.outsider())) {
            expect(f.member(), "DELETE", memberPath(f, target), "", 403);
            expect(f.outsider(), "DELETE", memberPath(f, target), "", 403);
        }
        role(f, f.owner(), f.outsider(), "ADMIN", 404);
        expect(f.owner(), "DELETE", memberPath(f, f.outsider()), "", 404);
        assertThat(jdbc.queryForList("SELECT * FROM group_memberships ORDER BY id")).isEqualTo(before);
    }

    @Test
    void strictBodiesAuthenticationCsrfAndMissingResourcesAreControlled() throws Exception {
        Fixture f = fixture();
        String path = memberPath(f, f.member());
        List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM group_memberships ORDER BY id");
        for (String body : List.of("{}", "null", "{\"role\":null}", "{\"role\":\"OWNER\"}",
                "{\"role\":\"admin\"}", "{\"role\":1}", "{\"role\":\"UNKNOWN\"}",
                "{\"role\":\"ADMIN\",\"actorId\":null}", "{\"role\":\"ADMIN\",\"userId\":null}")) {
            expect(f.owner(), "PATCH", path + "/role", body, 400);
        }
        expect(f.owner(), "DELETE", path, "{\"role\":\"MEMBER\"}", 400);
        for (String method : List.of("PATCH", "DELETE")) {
            String endpoint = path + (method.equals("PATCH") ? "/role" : "");
            String body = method.equals("PATCH") ? "{\"role\":\"ADMIN\"}" : "{}";
            for (String token : List.of("", "invalid-token")) {
                Actor noCsrf = new Actor(f.owner().cookie(), token.isEmpty() ? null : token, f.owner().id());
                expect(noCsrf, method, endpoint, body, 403);
            }
            // Reuse the anonymous bootstrap session and its token to isolate authentication from CSRF.
            HttpResponse<String> bootstrap = send(null, "GET", "/api/csrf", "");
            Actor anonymous = new Actor(bootstrap.headers().firstValue("Set-Cookie").orElseThrow().split(";", 2)[0],
                    json.readTree(bootstrap.body()).get("token").asText(), null);
            expect(anonymous, method, endpoint, body, 401);
            expect(f.owner(), method, endpoint.replace(f.groupId().toString(), UUID.randomUUID().toString()), body, 404);
            expect(f.owner(), method, endpoint.replace(f.member().id().toString(), "invalid"), body, 400);
        }
        assertThat(jdbc.queryForList("SELECT * FROM group_memberships ORDER BY id")).isEqualTo(before);
    }

    @Test
    void removalRevokesAccessRetainsHistoryAndRejoinUsesStableOrdinaryMembership() throws Exception {
        Fixture f = fixture();
        UUID game = id(expect(f.creator(), "POST", f.path(), body(f), 201));
        UUID membership = membershipId(f, f.creator());
        role(f, f.owner(), f.creator(), "ADMIN", 200);
        role(f, f.owner(), f.creator(), "MEMBER", 200);
        role(f, f.owner(), f.member(), "ADMIN", 200);
        expect(f.member(), "DELETE", memberPath(f, f.creator()), "{}", 204);
        expect(f.owner(), "DELETE", memberPath(f, f.creator()), "", 404);
        role(f, f.owner(), f.creator(), "ADMIN", 404);
        role(f, f.creator(), f.member(), "MEMBER", 403);
        expect(f.creator(), "DELETE", memberPath(f, f.outsider()), "", 403);
        assertThat(expect(f.creator(), "GET", "/api/groups", "", 200).size()).isZero();
        for (String path : List.of("/api/groups/" + f.groupId(), f.path(), f.path() + "/" + game,
                f.selection(f.member().id()), "/api/groups/" + f.groupId() + "/statistics")) {
            expect(f.creator(), "GET", path, "", 403);
        }
        expect(f.creator(), "POST", f.path(), body(f), 403);
        expect(f.creator(), "PUT", f.path() + "/" + game, body(f), 403);
        expect(f.creator(), "DELETE", f.path() + "/" + game, "", 403);
        assertThat(expect(f.owner(), "GET", f.path(), "", 200).size()).isEqualTo(1);
        JsonNode statistics = expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", 200);
        assertThat(statistics.toString()).contains(f.creator().id().toString());
        assertThat(decks.findById(f.creatorDeck()).orElseThrow().isEverUsed()).isTrue();
        assertThat(groupService.join(f.creator().id(), groupService.createInvitation(f.owner().id(), f.groupId()).code()).role())
                .isEqualTo(GroupRole.MEMBER);
        assertThat(membershipId(f, f.creator())).isEqualTo(membership);
        role(f, f.owner(), f.creator(), "ADMIN", 200);
        expect(f.creator(), "DELETE", "/api/groups/" + f.groupId() + "/membership", "", 204);
        assertThat(groupService.join(f.creator().id(), groupService.createInvitation(f.owner().id(), f.groupId()).code()).role())
                .isEqualTo(GroupRole.MEMBER);
    }

    @Test
    void adminAndOwnerCanModifyOthersGamesWhileMembersOnlyModifyTheirOwn() throws Exception {
        Fixture f = fixture();
        UUID game = id(expect(f.owner(), "POST", f.path(), body(f), 201));
        String path = f.path() + "/" + game;
        expect(f.creator(), "PUT", path, body(f), 403);
        expect(f.creator(), "DELETE", path, "", 403);
        role(f, f.owner(), f.creator(), "ADMIN", 200);
        JsonNode updated = expect(f.creator(), "PUT", path, body(f), 200);
        assertThat(updated.get("creatorId").asText()).isEqualTo(f.owner().id().toString());
        expect(f.creator(), "DELETE", path, "", 204);
        game = id(expect(f.creator(), "POST", f.path(), body(f), 201));
        role(f, f.owner(), f.creator(), "MEMBER", 200);
        expect(f.creator(), "PUT", f.path() + "/" + game, body(f), 200);
        expect(f.owner(), "PUT", f.path() + "/" + game, body(f), 200);
        expect(f.owner(), "DELETE", f.path() + "/" + game, "", 204);
    }

    @Test
    void migrationAcceptsAdminButPreservesRoleAndOwnerConstraints() throws Exception {
        Fixture f = fixture();
        jdbc.update("UPDATE group_memberships SET role = 'ADMIN' WHERE group_id = ? AND user_id = ?",
                f.groupId(), f.creator().id());
        assertThatThrownBy(() -> jdbc.update("UPDATE group_memberships SET role = 'INVALID' WHERE user_id = ?",
                f.creator().id())).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE group_memberships SET role = 'OWNER' WHERE user_id = ?",
                f.creator().id())).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> transactions.executeWithoutResult(status ->
                jdbc.update("UPDATE group_memberships SET role = 'ADMIN' WHERE user_id = ?", f.owner().id())))
                .isInstanceOf(RuntimeException.class);
        assertThat(jdbc.queryForObject("SELECT role FROM group_memberships WHERE user_id = ?",
                String.class, f.owner().id())).isEqualTo("OWNER");
    }

    @ParameterizedTest
    @CsvSource({"false,edit", "false,delete", "false,remove", "false,role",
            "true,edit", "true,delete", "true,remove", "true,role"})
    void waitingRequestsRecheckCommittedDemotionOrRemoval(boolean remove, String operation) throws Exception {
        Fixture f = fixture();
        role(f, f.owner(), f.creator(), "ADMIN", 200);
        UUID game = createGame(f.owner().id(), f.groupId(), assignments(f), GameResult.WIN, f.member().id()).id();
        try (ExecutorService executor = Executors.newSingleThreadExecutor()) {
            Future<?>[] pending = new Future<?>[1];
            transactions.executeWithoutResult(status -> {
                groups.findByIdForUpdate(f.groupId()).orElseThrow();
                int blocker = jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class);
                groupService.changeRole(f.owner().id(), f.groupId(), f.creator().id(), GroupRole.MEMBER);
                if (remove) { groupService.removeMember(f.owner().id(), f.groupId(), f.creator().id()); }
                pending[0] = executor.submit(() -> {
                    assertThatThrownBy(() -> {
                        switch (operation) {
                            case "edit" -> replaceGame(f.creator().id(), f.groupId(), game,
                                    assignments(f), GameResult.WIN, f.creator().id());
                            case "delete" -> gameService.delete(f.creator().id(), f.groupId(), game);
                            case "remove" -> groupService.removeMember(f.creator().id(), f.groupId(), f.member().id());
                            case "role" -> groupService.changeRole(f.creator().id(), f.groupId(),
                                    f.member().id(), GroupRole.ADMIN);
                            default -> throw new IllegalArgumentException(operation);
                        }
                    }).isInstanceOf(GroupAccessDeniedException.class);
                });
                await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                        assertThat(jdbc.queryForObject("""
                                SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'
                                AND query LIKE '%play_groups%' AND ? = ANY(pg_blocking_pids(pid))
                                """, Integer.class, blocker)).isEqualTo(1));
            });
            pending[0].get(10, TimeUnit.SECONDS);
        }
        assertThat(games.findById(game)).isPresent();
        assertThat(jdbc.queryForObject("SELECT role FROM group_memberships WHERE group_id = ? AND user_id = ?",
                String.class, f.groupId(), f.member().id())).isEqualTo("MEMBER");
    }

    @Test
    void removalWaitsForAnAlreadyAuthorizedGameEditToCommit() throws Exception {
        Fixture f = fixture();
        role(f, f.owner(), f.creator(), "ADMIN", 200);
        UUID game = createGame(f.owner().id(), f.groupId(), assignments(f), GameResult.WIN, f.member().id()).id();
        try (ExecutorService executor = Executors.newSingleThreadExecutor()) {
            Future<?>[] pending = new Future<?>[1];
            transactions.executeWithoutResult(status -> {
                replaceGame(f.creator().id(), f.groupId(), game, assignments(f), GameResult.WIN, f.creator().id());
                int blocker = jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class);
                pending[0] = executor.submit(() -> transactions.executeWithoutResult(other -> {
                    groupService.changeRole(f.owner().id(), f.groupId(), f.creator().id(), GroupRole.MEMBER);
                    groupService.removeMember(f.owner().id(), f.groupId(), f.creator().id());
                }));
                await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                        assertThat(jdbc.queryForObject("""
                                SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'
                                AND query LIKE '%play_groups%' AND ? = ANY(pg_blocking_pids(pid))
                                """, Integer.class, blocker)).isEqualTo(1));
            });
            pending[0].get(10, TimeUnit.SECONDS);
        }
        JsonNode saved = expect(f.owner(), "GET", f.path() + "/" + game, "", 200);
        assertThat(saved.get("winnerUserId").asText()).isEqualTo(f.creator().id().toString());
        expect(f.creator(), "DELETE", f.path() + "/" + game, "", 403);
    }

    private UUID membershipId(Fixture f, Actor actor) {
        return jdbc.queryForObject("SELECT id FROM group_memberships WHERE group_id = ? AND user_id = ?",
                UUID.class, f.groupId(), actor.id());
    }
}
