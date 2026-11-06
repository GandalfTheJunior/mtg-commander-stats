package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupRole;
import io.github.gandalfthejunior.mtgcommanderstats.quickprofile.application.ManageQuickProfiles;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;

class ProfileInvitationsTest extends GameTestSupport {
    @Value("${local.server.port}")
    private int port;

    @Autowired
    private ManageQuickProfiles quickProfiles;

    @Test
    void claimMovesDecksGamesMembershipAndStatisticsAndRetainsAudit() throws Exception {
        Fixture f = fixture();
        assertThat(jdbc.queryForMap("SELECT condeferrable, condeferred FROM pg_constraint"
                + " WHERE conname = 'game_participants_deck_owner_fk'"))
                .containsEntry("condeferrable", true).containsEntry("condeferred", false);
        UUID profile = profile(f);
        UUID usedDeck = profileDeck(f, profile, "Used");
        UUID spareDeck = profileDeck(f, profile, "Spare");
        UUID game = id(expect(f.owner(), "POST", f.path(),
                body(List.of(assignment(profile, usedDeck), assignment(f.creator().id(), f.creatorDeck())),
                        "WIN", profile), 201));
        UUID accountGame = id(expect(f.owner(), "POST", f.path(),
                body(List.of(assignment(f.member().id(), f.memberDeck()),
                        assignment(f.creator().id(), f.creatorDeck())), "WIN", f.member().id()), 201));
        JsonNode before = expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", 200);
        long profileGames = row(before.get("players"), "userId", profile.toString()).get("games").asLong();
        long accountGames = row(before.get("players"), "userId", f.member().id().toString()).get("games").asLong();

        String code = invite(f, profile);
        JsonNode preview = expect(null, "GET", preview(code), "", 200);
        assertThat(preview.toString()).contains("Pod", "Lena").doesNotContain(code, profile.toString());
        expect(f.member(), "POST", accept(code), "", 204);

        assertThat(users.findById(profile)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM group_memberships WHERE user_id = ?", Integer.class,
                profile)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM decks WHERE owner_id = ?", Integer.class,
                f.member().id())).isEqualTo(3);
        assertThat(decks.findById(usedDeck).orElseThrow().isEverUsed()).isTrue();
        assertThat(decks.findById(spareDeck).orElseThrow().isEverUsed()).isFalse();
        assertThat(jdbc.queryForObject("SELECT user_id FROM game_participants WHERE game_id = ? AND deck_id = ?",
                UUID.class, game, usedDeck)).isEqualTo(f.member().id());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM game_participants WHERE game_id = ? AND user_id = ?",
                Integer.class, accountGame, f.member().id())).isEqualTo(1);
        JsonNode after = expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", 200);
        assertThat(row(after.get("players"), "userId", f.member().id().toString()).get("games").asLong())
                .isEqualTo(profileGames + accountGames);
        assertThat(after.get("players").toString()).doesNotContain(profile.toString());
        assertThat(jdbc.queryForObject("SELECT consumer_id FROM profile_invitations WHERE consumed_at IS NOT NULL",
                UUID.class)).isEqualTo(f.member().id());
        assertThat(jdbc.queryForObject("SELECT profile_id FROM profile_invitations WHERE consumed_at IS NOT NULL",
                UUID.class)).isNull();
        expect(null, "GET", preview(code), "", 400);
        expect(f.outsider(), "POST", accept(code), "", 400);
    }

    @Test
    void ownerAndAdminCanManageButMemberCannotAndReplacementRevokesPrevious() throws Exception {
        Fixture f = fixture();
        UUID profile = profile(f);
        String path = management(f, profile);
        expect(f.member(), "POST", path, "", 403);
        expect(f.outsider(), "GET", path, "", 403);
        assertThat(expect(f.owner(), "GET", path, "", 200).get("active").asBoolean()).isFalse();
        String first = invite(f, profile);
        JsonNode status = expect(f.owner(), "GET", path, "", 200);
        assertThat(status.get("active").asBoolean()).isTrue();
        assertThat(status.toString()).doesNotContain(first);
        groupService.changeRole(f.owner().id(), f.groupId(), f.creator().id(), GroupRole.ADMIN);
        String second = expect(f.creator(), "POST", path, "", 201).get("code").asText();
        expect(null, "GET", preview(first), "", 400);
        expect(f.member(), "POST", accept(first), "", 400);
        expect(null, "GET", preview(second), "", 200);
        expect(f.creator(), "DELETE", path, "", 204);
        expect(null, "GET", preview(second), "", 400);
        assertThat(expect(f.owner(), "GET", path, "", 200).get("active").asBoolean()).isFalse();
    }

    @Test
    void sameGameConflictPreservesRowsAndTokenForRetry() throws Exception {
        Fixture f = fixture();
        UUID profile = profile(f);
        UUID deck = profileDeck(f, profile, "Profile");
        UUID game = id(expect(f.owner(), "POST", f.path(), body(List.of(
                assignment(profile, deck), assignment(f.member().id(), f.memberDeck())), "WIN", profile), 201));
        String code = invite(f, profile);
        JsonNode conflict = expect(f.member(), "POST", accept(code), "", 409);
        assertThat(conflict.get("code").asText()).isEqualTo("PROFILE_CLAIM_SAME_GAME");
        assertThat(decks.findById(deck).orElseThrow().getOwnerId()).isEqualTo(profile);
        assertThat(users.findById(profile)).isPresent();
        expect(null, "GET", preview(code), "", 200);
        expect(f.owner(), "PUT", f.path() + "/" + game, body(List.of(
                assignment(profile, deck), assignment(f.creator().id(), f.creatorDeck())), "WIN", profile), 200);
        expect(f.member(), "POST", accept(code), "", 204);
    }

    @Test
    void inactiveMembershipReactivatesAndAdminKeepsRole() throws Exception {
        Fixture f = fixture();
        UUID first = profile(f);
        expect(f.member(), "DELETE", "/api/groups/" + f.groupId() + "/membership", "", 204);
        expect(f.member(), "POST", accept(invite(f, first)), "", 204);
        assertThat(jdbc.queryForObject("SELECT role FROM group_memberships WHERE group_id = ? AND user_id = ?",
                String.class, f.groupId(), f.member().id())).isEqualTo("MEMBER");
        assertThat(jdbc.queryForObject("SELECT active FROM group_memberships WHERE group_id = ? AND user_id = ?",
                Boolean.class, f.groupId(), f.member().id())).isTrue();
        groupService.changeRole(f.owner().id(), f.groupId(), f.creator().id(), GroupRole.ADMIN);
        UUID second = profile(f);
        expect(f.creator(), "POST", accept(invite(f, second)), "", 204);
        assertThat(jdbc.queryForObject("SELECT role FROM group_memberships WHERE group_id = ? AND user_id = ?",
                String.class, f.groupId(), f.creator().id())).isEqualTo("ADMIN");
    }

    @Test
    void newlyRegisteredAccountClaimsWithoutChangingItsIdentity() throws Exception {
        Fixture f = fixture();
        UUID profile = profile(f);
        UUID deck = profileDeck(f, profile, "Inherited");
        String code = invite(f, profile);
        Actor newcomer = register("lena-new", "LenaM");
        expect(newcomer, "POST", accept(code), "", 204);
        assertThat(decks.findById(deck).orElseThrow().getOwnerId()).isEqualTo(newcomer.id());
        assertThat(jdbc.queryForObject("SELECT username FROM users WHERE id = ?", String.class, newcomer.id()))
                .isEqualTo("LenaM");
        assertThat(jdbc.queryForObject("SELECT role FROM group_memberships WHERE group_id = ? AND user_id = ?",
                String.class, f.groupId(), newcomer.id())).isEqualTo("MEMBER");
    }

    @Test
    void expiryAndConcurrentAcceptanceUseOneHourSingleUseRule() throws Exception {
        Fixture f = fixture();
        UUID profile = profile(f);
        String expired = invite(f, profile);
        assertThat(jdbc.queryForObject("SELECT bool_and(expires_at = created_at + interval '1 hour')"
                + " FROM profile_invitations", Boolean.class)).isTrue();
        jdbc.update("WITH expired AS MATERIALIZED (SELECT clock_timestamp() - interval '1 minute' AS at)"
                + " UPDATE profile_invitations SET created_at = expired.at - interval '1 hour',"
                + " expires_at = expired.at FROM expired");
        expect(null, "GET", preview(expired), "", 400);
        expect(f.member(), "POST", accept(expired), "", 400);
        String code = invite(f, profile);
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<Integer> first = executor.submit(() -> { start.await(); return send(f.member(), "POST", accept(code), "").statusCode(); });
            Future<Integer> second = executor.submit(() -> { start.await(); return send(f.outsider(), "POST", accept(code), "").statusCode(); });
            start.countDown();
            assertThat(List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(204, 400);
        }
    }

    @Test
    void previewStatesAreIndistinguishableAndAcceptanceRequiresCsrf() throws Exception {
        Fixture f = fixture();
        UUID profile = profile(f);
        String code = invite(f, profile);
        String unknown = "AAAAAAAAAAAAAAAAAAAAAA";
        String bad = send(null, "GET", preview(unknown), "").body();
        assertThat(send(null, "GET", preview("bad"), "").body()).isEqualTo(bad);
        expect(new Actor(f.member().cookie(), null, f.member().id()), "POST", accept(code), "", 403);
        expect(anonymous(), "POST", accept(code), "", 401);
        expect(f.owner(), "DELETE", management(f, profile), "", 204);
        assertThat(send(null, "GET", preview(code), "").body()).isEqualTo(bad);
        assertThat(send(f.member(), "POST", accept(code), "").body()).isEqualTo(bad);
    }

    @Test
    void expiryIsRecheckedAfterWaitingForGroupLock() throws Exception {
        Fixture f = fixture();
        UUID profile = profile(f);
        String code = invite(f, profile);
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<?> holder = executor.submit(() -> transactions.executeWithoutResult(status -> {
                jdbc.queryForObject("SELECT id FROM play_groups WHERE id = ? FOR UPDATE", UUID.class, f.groupId());
                locked.countDown();
                try {
                    release.await(10, TimeUnit.SECONDS);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(exception);
                }
            }));
            assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
            Future<Integer> claimant = executor.submit(() -> send(f.member(), "POST", accept(code), "").statusCode());
            try {
                org.assertj.core.api.Assertions.assertThatThrownBy(() -> claimant.get(300, TimeUnit.MILLISECONDS))
                        .isInstanceOf(TimeoutException.class);
                jdbc.update("WITH expired AS MATERIALIZED (SELECT clock_timestamp() - interval '1 minute' AS at)"
                        + " UPDATE profile_invitations SET created_at = expired.at - interval '1 hour',"
                        + " expires_at = expired.at FROM expired WHERE profile_id = ?", profile);
            } finally {
                release.countDown();
            }
            holder.get(10, TimeUnit.SECONDS);
            assertThat(claimant.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        }
        assertThat(users.findById(profile)).isPresent();
    }

    @Test
    void claimWaitingForProfileDeletionCannotPartiallyMerge() throws Exception {
        Fixture f = fixture();
        UUID profile = profile(f);
        String code = invite(f, profile);
        CountDownLatch deleted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<?> deletion = executor.submit(() -> transactions.executeWithoutResult(status -> {
                quickProfiles.delete(f.owner().id(), f.groupId(), profile);
                deleted.countDown();
                try {
                    release.await(10, TimeUnit.SECONDS);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(exception);
                }
            }));
            assertThat(deleted.await(5, TimeUnit.SECONDS)).isTrue();
            Future<Integer> claim = executor.submit(() -> send(f.member(), "POST", accept(code), "").statusCode());
            try {
                org.assertj.core.api.Assertions.assertThatThrownBy(() -> claim.get(300, TimeUnit.MILLISECONDS))
                        .isInstanceOf(TimeoutException.class);
            } finally {
                release.countDown();
            }
            deletion.get(10, TimeUnit.SECONDS);
            assertThat(claim.get(10, TimeUnit.SECONDS)).isEqualTo(400);
        }
        assertThat(users.findById(profile)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM profile_invitations WHERE consumer_id IS NOT NULL",
                Integer.class)).isZero();
    }

    @Test
    void publicPreviewIsLimitedTo120RequestsPerPeer() throws Exception {
        Actor owner = register("limit-owner", "Limit Owner");
        UUID group = id(expect(owner, "POST", "/api/groups", "{\"name\":\"Limited\"}", 201));
        UUID profile = UUID.fromString(expect(owner, "POST", "/api/groups/" + group + "/quick-profiles",
                "", 201).get("userId").asText());
        String code = expect(owner, "POST", "/api/groups/" + group + "/quick-profiles/" + profile
                + "/invitation", "", 201).get("code").asText();
        for (int i = 0; i < 120; i++) {
            expect(null, "GET", preview(code), "", 200);
        }
        assertThat(send(null, "GET", preview(code), "").statusCode()).isEqualTo(429);
    }

    @Test
    void percentEncodedPreviewPathUsesTheSamePeerQuota() throws Exception {
        Actor owner = register("encoded-preview", "Preview Owner");
        UUID group = id(expect(owner, "POST", "/api/groups", "{\"name\":\"Limited\"}", 201));
        UUID profile = UUID.fromString(expect(owner, "POST", "/api/groups/" + group + "/quick-profiles",
                "", 201).get("userId").asText());
        String code = expect(owner, "POST", "/api/groups/" + group + "/quick-profiles/" + profile
                + "/invitation", "", 201).get("code").asText();
        String encodedPath = "/api/profile-invitation%73/" + code;
        for (int i = 0; i < 120; i++) {
            expect(null, "GET", encodedPath, "", 200);
        }
        assertThat(send(null, "GET", encodedPath, "").statusCode()).isEqualTo(429);
    }

    @Test
    void acceptAndPercentEncodedAcceptPathsUseThePeerQuota() throws Exception {
        Actor actor = register("accept-limit", "Accept Owner");
        String unknown = "/api/profile-invitations/AAAAAAAAAAAAAAAAAAAAAA/accept";
        for (int i = 0; i < 120; i++) {
            expect(actor, "POST", unknown, "", 400);
        }
        assertThat(send(actor, "POST", unknown, "").statusCode()).isEqualTo(429);
    }

    @Test
    void percentEncodedAcceptPathUsesTheSamePeerQuota() throws Exception {
        Actor actor = register("encoded-accept", "Accept Owner");
        String encodedPath = "/api/profile-invitations/AAAAAAAAAAAAAAAAAAAAAA/accep%74";
        for (int i = 0; i < 120; i++) {
            expect(actor, "POST", encodedPath, "", 400);
        }
        assertThat(send(actor, "POST", encodedPath, "").statusCode()).isEqualTo(429);
    }

    @Test
    void deletingOrAnonymizingAProfileRevokesItsInvitation() throws Exception {
        Fixture f = fixture();
        UUID unused = profile(f);
        String unusedCode = invite(f, unused);
        expect(f.owner(), "DELETE", "/api/groups/" + f.groupId() + "/quick-profiles/" + unused, "", 204);
        assertThat(jdbc.queryForObject("SELECT revoked_at IS NOT NULL FROM profile_invitations"
                + " WHERE profile_id IS NULL", Boolean.class)).isTrue();
        String unavailable = send(null, "GET", preview("AAAAAAAAAAAAAAAAAAAAAA"), "").body();
        assertThat(send(null, "GET", preview(unusedCode), "").body()).isEqualTo(unavailable);
        assertThat(send(f.member(), "POST", accept(unusedCode), "").body()).isEqualTo(unavailable);

        UUID played = profile(f);
        UUID deck = profileDeck(f, played, "Played");
        expect(f.owner(), "POST", f.path(), body(List.of(assignment(played, deck),
                assignment(f.creator().id(), f.creatorDeck())), "WIN", played), 201);
        String playedCode = invite(f, played);
        expect(f.owner(), "DELETE", "/api/groups/" + f.groupId() + "/quick-profiles/" + played, "", 204);
        assertThat(jdbc.queryForObject("SELECT revoked_at IS NOT NULL FROM profile_invitations"
                + " WHERE profile_id = ?", Boolean.class, played)).isTrue();
        assertThat(send(null, "GET", preview(playedCode), "").body()).isEqualTo(unavailable);
        assertThat(send(f.member(), "POST", accept(playedCode), "").body()).isEqualTo(unavailable);
    }

    @Test
    void unsupportedAcceptBodyGets415WithoutConsumingTheInvitation() throws Exception {
        Fixture f = fixture();
        String code = invite(f, profile(f));
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + accept(code)))
                .header("Content-Type", "text/plain")
                .header("Cookie", f.member().cookie())
                .header("X-CSRF-TOKEN", f.member().token())
                .POST(HttpRequest.BodyPublishers.ofString("confirm"))
                .build();
        HttpResponse<String> response = HttpClient.newHttpClient().send(request,
                HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(415);
        assertThat(response.body()).doesNotContain(code);
        expect(null, "GET", preview(code), "", 200);
    }

    private UUID profile(Fixture f) throws Exception {
        UUID profile = UUID.fromString(expect(f.member(), "POST", "/api/groups/" + f.groupId()
                + "/quick-profiles", "", 201).get("userId").asText());
        expect(f.member(), "PATCH", "/api/groups/" + f.groupId() + "/quick-profiles/" + profile,
                "{\"name\":\"Lena\"}", 200);
        return profile;
    }

    private UUID profileDeck(Fixture f, UUID profile, String name) throws Exception {
        return id(expect(f.member(), "POST", "/api/groups/" + f.groupId() + "/quick-profiles/" + profile
                + "/decks", deckBody(name, "Krenko", List.of("R")), 201));
    }

    private String invite(Fixture f, UUID profile) throws Exception {
        return expect(f.owner(), "POST", management(f, profile), "", 201).get("code").asText();
    }

    private String management(Fixture f, UUID profile) {
        return "/api/groups/" + f.groupId() + "/quick-profiles/" + profile + "/invitation";
    }

    private String preview(String code) {
        return "/api/profile-invitations/" + code;
    }

    private String accept(String code) {
        return preview(code) + "/accept";
    }

    private JsonNode row(JsonNode rows, String field, String value) {
        for (JsonNode row : rows) {
            if (value.equals(row.get(field).asText())) {
                return row;
            }
        }
        throw new AssertionError("Missing row " + value);
    }
}
