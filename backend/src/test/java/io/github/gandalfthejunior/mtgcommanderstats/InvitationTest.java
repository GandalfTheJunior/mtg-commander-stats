package io.github.gandalfthejunior.mtgcommanderstats;

import java.time.Instant;
import java.net.http.HttpResponse;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.ManageGroups.Invitation;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class InvitationTest extends GameTestSupport {
    @Test
    void publicPreviewRevealsOnlyNameAndNeitherPreviewNorAuthenticationConsumesInvitation() throws Exception {
        Fixture f = fixture();
        Invitation invitation = groupService.createInvitation(f.member().id(), f.groupId());
        String path = "/api/invitations/" + invitation.code();
        assertThat(jdbc.queryForList("SELECT token_hash FROM group_invitations").toString())
                .doesNotContain(invitation.code());
        for (Actor actor : java.util.Arrays.asList(null, f.outsider(), f.owner())) {
            HttpResponse<String> response = send(actor, "GET", path, "");
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(json.readTree(response.body())).isEqualTo(json.valueToTree(Map.of("groupName", "Pod")));
            assertThat(response.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store");
            assertThat(response.headers().firstValue("Referrer-Policy").orElseThrow()).isEqualTo("no-referrer");
        }
        expect(f.outsider(), "GET", "/api/groups/" + f.groupId(), "", 403);
        expect(f.outsider(), "POST", "/api/groups/join", codeBody(invitation.code()), 200);
        HttpResponse<String> consumed = send(null, "GET", path, "");
        HttpResponse<String> unknown = send(null, "GET", "/api/invitations/AAAAAAAAAAAAAAAAAAAAAA", "");
        HttpResponse<String> malformed = send(null, "GET", "/api/invitations/bad", "");
        assertThat(consumed.statusCode()).isEqualTo(400);
        assertThat(consumed.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store");
        assertThat(consumed.body()).isEqualTo(unknown.body()).isEqualTo(malformed.body());
        assertThat(consumed.body()).doesNotContain(invitation.code(), "Pod", f.groupId().toString());
    }

    @Test
    void lifetimeIsExactly24HoursAndExpiredInvitationsCannotAdmitMembers() throws Exception {
        Fixture f = fixture();
        Invitation invitation = groupService.createInvitation(f.owner().id(), f.groupId());
        assertThat(jdbc.queryForObject("SELECT bool_and(expires_at = created_at + interval '24 hours') FROM group_invitations",
                Boolean.class)).isTrue();
        Instant created = jdbc.queryForObject("SELECT max(created_at) FROM group_invitations",
                (row, index) -> row.getTimestamp(1).toInstant());
        assertThat(invitation.expiresAt()).isEqualTo(created.plusSeconds(86400));
        jdbc.update("UPDATE group_invitations SET created_at = statement_timestamp() - interval '24 hours', expires_at = statement_timestamp() WHERE consumed_at IS NULL");
        expect(null, "GET", "/api/invitations/" + invitation.code(), "", 400);
        expect(f.outsider(), "POST", "/api/groups/join", codeBody(invitation.code()), 400);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM group_invitations WHERE consumer_id = ?",
                Integer.class, f.outsider().id())).isZero();
        String fresh = groupService.createInvitation(f.member().id(), f.groupId()).code();
        expect(f.outsider(), "POST", "/api/groups/join", codeBody(fresh), 200);
    }

    @Test
    void activeMembersCannotBurnTokensAndRemovedIssuerDoesNotRevokeOutstandingTokens() throws Exception {
        Fixture f = fixture();
        String code = groupService.createInvitation(f.creator().id(), f.groupId()).code();
        for (Actor active : List.of(f.owner(), f.creator(), f.member())) {
            expect(active, "POST", "/api/groups/join", codeBody(code), 409);
        }
        groupService.removeMember(f.owner().id(), f.groupId(), f.creator().id());
        expect(f.creator(), "POST", "/api/groups/" + f.groupId() + "/invitations", "", 403);
        expect(f.outsider(), "POST", "/api/groups/" + f.groupId() + "/invitations", "", 403);
        expect(f.outsider(), "POST", "/api/groups/join", codeBody(code), 200);
        expect(f.creator(), "POST", "/api/groups/join", codeBody(code), 400);
    }

    @Test
    void twoDifferentUsersRacingForOneInvitationAdmitExactlyOne() throws Exception {
        Fixture f = fixture();
        Actor extra = register("extra", "Extra");
        String code = groupService.createInvitation(f.owner().id(), f.groupId()).code();
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<Integer> first = executor.submit(() -> { start.await(); return send(extra, "POST", "/api/groups/join", codeBody(code)).statusCode(); });
            Future<Integer> second = executor.submit(() -> { start.await(); return send(f.outsider(), "POST", "/api/groups/join", codeBody(code)).statusCode(); });
            start.countDown();
            assertThat(List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 400);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM group_memberships WHERE group_id = ? AND active",
                Integer.class, f.groupId())).isEqualTo(4);
    }

    @Test
    void rollbackDoesNotConsumeInvitationOrLeaveMembershipAndLegacyRoutesAreGone() throws Exception {
        Fixture f = fixture();
        String code = groupService.createInvitation(f.owner().id(), f.groupId()).code();
        assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
            groupService.join(f.outsider().id(), code);
            throw new IllegalStateException("Rollback probe");
        })).isInstanceOf(IllegalStateException.class);
        expect(null, "GET", "/api/invitations/" + code, "", 200);
        expect(f.outsider(), "POST", "/api/groups/join", codeBody(code), 200);
        for (String method : List.of("GET", "POST")) {
            assertThat(send(f.owner(), method, "/api/groups/" + f.groupId() + "/join-code", "").statusCode()).isEqualTo(404);
        }
        expect(f.owner(), "POST", "/api/groups/" + f.groupId() + "/invitations", "{\"role\":\"OWNER\"}", 400);
        expect(f.owner(), "POST", "/api/groups/join", "{\"code\":\"" + code + "\",\"groupId\":\"" + UUID.randomUUID() + "\"}", 400);
    }

    private String codeBody(String code) {
        return json.writeValueAsString(Map.of("code", code));
    }
}
