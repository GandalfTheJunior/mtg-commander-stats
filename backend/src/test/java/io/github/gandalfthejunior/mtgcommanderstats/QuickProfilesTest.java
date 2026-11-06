package io.github.gandalfthejunior.mtgcommanderstats;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.StreamSupport;

import io.github.gandalfthejunior.mtgcommanderstats.deck.application.InvalidDeckAssignmentException;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameParticipant;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameResult;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.InvalidGameException;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupRole;
import io.github.gandalfthejunior.mtgcommanderstats.quickprofile.application.ManageQuickProfiles;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.CREATED;
import static org.springframework.http.HttpStatus.FORBIDDEN;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.NO_CONTENT;
import static org.springframework.http.HttpStatus.OK;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

class QuickProfilesTest extends GameTestSupport {
    private static final String GENERATED_NAME = "\\p{Lu}\\p{Ll}+ \\p{Lu}\\p{Ll}+";

    @Autowired
    private ManageQuickProfiles quickProfiles;

    @Test
    void memberCreatesProfileThatOwnsDecksPlaysWinsAndAppearsInStatistics() throws Exception {
        Fixture f = fixture();
        JsonNode created = expect(f.member(), "POST", profiles(f), "", CREATED.value());
        UUID profile = UUID.fromString(created.get("userId").asText());
        assertThat(created.get("username").asText()).matches(GENERATED_NAME);
        assertThat(created.get("username").asText().codePointCount(0, created.get("username").asText().length()))
                .isLessThanOrEqualTo(17);
        assertThat(created.get("quickProfile").asBoolean()).isTrue();
        assertThat(created.get("role").asText()).isEqualTo("MEMBER");
        assertThat(created.toString()).doesNotContain("email", "password", "Password");

        JsonNode details = expect(f.owner(), "GET", "/api/groups/" + f.groupId(), "", OK.value());
        JsonNode member = row(details.get("members"), "userId", profile.toString());
        assertThat(member.get("quickProfile").asBoolean()).isTrue();
        assertThat(member.get("role").asText()).isEqualTo("MEMBER");
        assertThat(row(details.get("members"), "userId", f.owner().id().toString()).get("quickProfile").asBoolean())
                .isFalse();
        assertThat(details.toString()).doesNotContain("email", "password");

        UUID profileDeck = id(expect(f.member(), "POST", decks(f, profile),
                deckBody("Goblins", "Krenko", List.of("R")), CREATED.value()));
        assertThat(expect(f.creator(), "GET", f.selection(profile), "", OK.value()).get(0).get("id").asText())
                .isEqualTo(profileDeck.toString());

        List<GameParticipant> four = List.of(assignment(f.owner().id(), f.ownerDeck()),
                assignment(f.creator().id(), f.creatorDeck()), assignment(f.member().id(), f.memberDeck()),
                assignment(profile, profileDeck));
        JsonNode game = expect(f.member(), "POST", f.path(), body(four, "WIN", profile), CREATED.value());
        JsonNode participant = row(game.get("participants"), "userId", profile.toString());
        assertThat(participant.get("quickProfile").asBoolean()).isTrue();
        assertThat(participant.get("deleted").asBoolean()).isFalse();
        assertThat(participant.get("deletedNumber").isNull()).isTrue();
        assertThat(game.toString()).doesNotContain("email", "password");

        JsonNode statistics = expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", OK.value());
        JsonNode player = row(statistics.get("players"), "userId", profile.toString());
        assertThat(player.get("games").asLong()).isEqualTo(1);
        assertThat(player.get("wins").asLong()).isEqualTo(1);
        assertThat(player.get("quickProfile").asBoolean()).isTrue();
        assertThat(row(statistics.get("players"), "userId", f.owner().id().toString()).get("quickProfile").asBoolean())
                .isFalse();
        JsonNode deck = row(statistics.get("decks"), "deckId", profileDeck.toString());
        assertThat(deck.get("ownerQuickProfile").asBoolean()).isTrue();
        assertThat(deck.get("ownerDeleted").asBoolean()).isFalse();
    }

    @Test
    void outsidersAndFormerMembersCannotCreateOrManageProfiles() throws Exception {
        Fixture f = fixture();
        UUID profile = create(f.member(), f);
        expect(f.outsider(), "POST", profiles(f), "", FORBIDDEN.value());
        expect(f.outsider(), "PATCH", profile(f, profile), "{\"name\":\"Mine\"}", FORBIDDEN.value());
        expect(f.outsider(), "POST", decks(f, profile), deckBody("Deck", "Krenko", List.of("R")), FORBIDDEN.value());
        expect(f.creator(), "DELETE", "/api/groups/" + f.groupId() + "/membership", "", NO_CONTENT.value());
        expect(f.creator(), "POST", profiles(f), "", FORBIDDEN.value());
        expect(f.creator(), "GET", decks(f, profile), "", FORBIDDEN.value());
        expect(f.member(), "POST", profiles(f), "{\"name\":\"Chosen\"}", BAD_REQUEST.value());
        expect(f.member(), "PATCH", profile(f, profile), "{\"name\":\"Lena\",\"extra\":1}", BAD_REQUEST.value());
        expect(f.member(), "PATCH", profile(f, f.owner().id()), "{\"name\":\"Lena\"}", NOT_FOUND.value());
        expect(f.member(), "POST", decks(f, f.owner().id()), deckBody("Deck", "Krenko", List.of("R")),
                NOT_FOUND.value());
        // CSRF protection applies like every other state-changing endpoint.
        expect(new Actor(f.member().cookie(), null, f.member().id()), "POST", profiles(f), "", FORBIDDEN.value());
    }

    @Test
    void renamesUnderNameRulesWithGroupScopedCaseInsensitiveUniqueness() throws Exception {
        Fixture f = fixture();
        UUID first = create(f.member(), f);
        UUID second = create(f.member(), f);
        JsonNode renamed = expect(f.member(), "PATCH", profile(f, first), "{\"name\":\"  Lena \"}", OK.value());
        assertThat(renamed.get("username").asText()).isEqualTo("Lena");
        JsonNode duplicate = expect(f.member(), "PATCH", profile(f, second), "{\"name\":\"lena\"}", CONFLICT.value());
        assertThat(duplicate.get("code").asText()).isEqualTo("QUICK_PROFILE_NAME_TAKEN");
        JsonNode invalid = expect(f.member(), "PATCH", profile(f, second), "{\"name\":\"" + "x".repeat(21) + "\"}",
                BAD_REQUEST.value());
        assertThat(invalid.get("errors").get(0).get("code").asText()).isEqualTo("NAME_TOO_LONG");
        assertThat(invalid.get("errors").get(0).get("field").asText()).isEqualTo("name");
        assertThat(expect(f.member(), "PATCH", profile(f, second), "{\"name\":\"\"}", BAD_REQUEST.value())
                .get("errors").get(0).get("code").asText()).isEqualTo("NAME_BLANK");

        UUID otherGroup = id(expect(f.outsider(), "POST", "/api/groups", "{\"name\":\"Other\"}", CREATED.value()));
        UUID elsewhere = UUID.fromString(expect(f.outsider(), "POST", "/api/groups/" + otherGroup + "/quick-profiles",
                "", CREATED.value()).get("userId").asText());
        expect(f.outsider(), "PATCH", "/api/groups/" + otherGroup + "/quick-profiles/" + elsewhere,
                "{\"name\":\"LENA\"}", OK.value());

        // Accounts and quick profiles are excluded from each other's uniqueness in both directions.
        expect(f.member(), "PATCH", profile(f, second), "{\"name\":\"morgan\"}", OK.value());
        register("lena", "Lena");
    }

    @Test
    void onlyOwnersAndAdminsDeleteAndProfilesWithoutGamesDisappearWithTheirDecks() throws Exception {
        Fixture f = fixture();
        UUID profile = create(f.member(), f);
        UUID deck = id(expect(f.member(), "POST", decks(f, profile), deckBody("Deck", "Krenko", List.of("R")),
                CREATED.value()));
        // A profile deck can carry the permanent usage lock without a current game.
        transactions.executeWithoutResult(status -> decks.findById(deck).orElseThrow().markUsed());
        expect(f.member(), "DELETE", profile(f, profile), "", FORBIDDEN.value());
        groupService.changeRole(f.owner().id(), f.groupId(), f.creator().id(), GroupRole.ADMIN);
        expect(f.creator(), "DELETE", profile(f, profile), "", NO_CONTENT.value());
        assertThat(users.findById(profile)).isEmpty();
        assertThat(decks.findById(deck)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM group_memberships WHERE user_id = ?", Integer.class,
                profile)).isZero();
        expect(f.owner(), "DELETE", profile(f, profile), "", NOT_FOUND.value());
    }

    @Test
    void deletingProfilesWithGamesAnonymizesThemAndKeepsHistoryAndOtherStatistics() throws Exception {
        Fixture f = fixture();
        UUID profile = create(f.member(), f);
        expect(f.member(), "PATCH", profile(f, profile), "{\"name\":\"Lena\"}", OK.value());
        UUID profileDeck = id(expect(f.member(), "POST", decks(f, profile), deckBody("Deck", "Krenko", List.of("R")),
                CREATED.value()));
        UUID unusedDeck = id(expect(f.member(), "POST", decks(f, profile), deckBody("Spare", "Krenko", List.of("R")),
                CREATED.value()));
        List<GameParticipant> players = List.of(assignment(f.creator().id(), f.creatorDeck()),
                assignment(profile, profileDeck));
        UUID game = id(expect(f.creator(), "POST", f.path(), body(players, "WIN", profile), CREATED.value()));
        JsonNode before = expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", OK.value());

        expect(f.owner(), "DELETE", profile(f, profile), "", NO_CONTENT.value());

        assertThat(jdbc.queryForObject("SELECT username FROM users WHERE id = ?", String.class, profile))
                .isEqualTo("Deleted profile");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE username = 'Lena'", Integer.class)).isZero();
        assertThat(decks.findById(profileDeck).orElseThrow().isArchived()).isTrue();
        assertThat(decks.findById(unusedDeck).orElseThrow().isArchived()).isTrue();
        JsonNode details = expect(f.owner(), "GET", "/api/groups/" + f.groupId(), "", OK.value());
        assertThat(details.get("members").toString()).doesNotContain(profile.toString());
        expect(f.member(), "GET", f.selection(profile), "", NOT_FOUND.value());
        expect(f.member(), "PATCH", profile(f, profile), "{\"name\":\"Back\"}", NOT_FOUND.value());
        expect(f.member(), "POST", decks(f, profile), deckBody("New", "Krenko", List.of("R")), NOT_FOUND.value());
        expect(f.owner(), "DELETE", profile(f, profile), "", NOT_FOUND.value());
        expect(f.creator(), "POST", f.path(), body(players, "WIN", f.creator().id()), BAD_REQUEST.value());

        JsonNode history = expect(f.member(), "GET", f.path() + "/" + game, "", OK.value());
        JsonNode participant = row(history.get("participants"), "userId", profile.toString());
        assertThat(participant.get("username").asText()).isEqualTo("Deleted profile");
        assertThat(participant.get("deleted").asBoolean()).isTrue();
        assertThat(participant.get("deletedNumber").asInt()).isEqualTo(1);
        assertThat(participant.get("deck").get("archived").asBoolean()).isTrue();

        JsonNode after = expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", OK.value());
        assertThat(row(after.get("players"), "userId", f.creator().id().toString()))
                .isEqualTo(row(before.get("players"), "userId", f.creator().id().toString()));
        JsonNode anonymized = row(after.get("players"), "userId", profile.toString());
        assertThat(anonymized.get("games").asLong()).isEqualTo(1);
        assertThat(anonymized.get("wins").asLong()).isEqualTo(1);
        assertThat(anonymized.get("deleted").asBoolean()).isTrue();
        assertThat(anonymized.get("deletedNumber").asInt()).isEqualTo(1);
        assertThat(row(after.get("decks"), "deckId", profileDeck.toString()).get("ownerDeleted").asBoolean()).isTrue();

        // A retained assignment of an anonymized profile survives replacement by an authorized member.
        expect(f.creator(), "PUT", f.path() + "/" + game, body(players, "WIN", f.creator().id()), OK.value());

        // Several anonymized profiles stay distinguishable by a stable per-group number; the
        // generated name of a replacement profile may reuse the freed name space.
        UUID second = create(f.member(), f);
        UUID secondDeck = id(expect(f.member(), "POST", decks(f, second), deckBody("Deck", "Krenko", List.of("R")),
                CREATED.value()));
        expect(f.creator(), "POST", f.path(), body(List.of(assignment(f.creator().id(), f.creatorDeck()),
                assignment(second, secondDeck)), "WIN", second), CREATED.value());
        expect(f.owner(), "DELETE", profile(f, second), "", NO_CONTENT.value());
        assertThat(jdbc.queryForList("SELECT deleted_number FROM users WHERE deleted ORDER BY deleted_number",
                Integer.class)).containsExactly(1, 2);
    }

    @Test
    void profileDecksFollowTheUnchangedDeckLifecycle() throws Exception {
        Fixture f = fixture();
        UUID profile = create(f.member(), f);
        JsonNode created = expect(f.creator(), "POST", decks(f, profile),
                deckBody("Goblins", "Krenko", List.of("R")), CREATED.value());
        UUID deck = id(created);
        assertThat(created.get("everUsed").asBoolean()).isFalse();
        expect(f.creator(), "POST", decks(f, profile), deckBody(" ", "Krenko", List.of("R")), BAD_REQUEST.value());
        expect(f.creator(), "POST", decks(f, profile),
                "{\"name\":\"Deck\",\"commanders\":[],\"format\":\"COMMANDER\"}", BAD_REQUEST.value());
        // Another member's deck is not reachable through the profile route.
        expect(f.creator(), "PUT", decks(f, profile) + "/" + f.memberDeck(),
                deckBody("Mine", "Krenko", List.of("R")), FORBIDDEN.value());
        expect(f.creator(), "DELETE", decks(f, profile) + "/" + UUID.randomUUID(), "", NOT_FOUND.value());

        expect(f.creator(), "POST", f.path(), body(List.of(assignment(f.creator().id(), f.creatorDeck()),
                assignment(profile, deck)), "WIN", f.creator().id()), CREATED.value());

        expect(f.member(), "PUT", decks(f, profile) + "/" + deck, deckBody("Goblins", "Ghave", List.of("W", "B", "G")),
                CONFLICT.value());
        JsonNode renamed = expect(f.member(), "PUT", decks(f, profile) + "/" + deck,
                deckBody("Renamed", "Krenko", List.of("R")), OK.value());
        assertThat(renamed.get("name").asText()).isEqualTo("Renamed");
        assertThat(renamed.get("everUsed").asBoolean()).isTrue();

        UUID original = CommanderTestProvider.inputs("Krenko", List.of("R")).getFirst().selectionRef().scryfallCardId();
        UUID alternative = UUID.randomUUID();
        ObjectNode printing = (ObjectNode) provider.card(original).deepCopy();
        printing.put("id", alternative.toString());
        printing.putObject("image_uris").put("art_crop", "https://cards.scryfall.io/art_crop/profile.jpg");
        CommanderTestProvider.put(alternative, printing.toString());
        JsonNode artwork = expect(f.member(), "PUT", decks(f, profile) + "/" + deck + "/commanders/1/artwork",
                json.writeValueAsString(Map.of("scryfallCardId", alternative)), OK.value());
        assertThat(artwork.get("commanders").get(0).get("scryfallCardId").asText()).isEqualTo(alternative.toString());
        expect(f.member(), "PUT", decks(f, profile) + "/" + deck + "/commanders/3/artwork",
                json.writeValueAsString(Map.of("scryfallCardId", alternative)), BAD_REQUEST.value());
        expect(f.member(), "PUT", decks(f, profile) + "/" + deck + "/companion/artwork",
                json.writeValueAsString(Map.of("scryfallCardId", alternative)), NOT_FOUND.value());

        expect(f.member(), "DELETE", decks(f, profile) + "/" + deck, "", CONFLICT.value());
        expect(f.member(), "POST", decks(f, profile) + "/" + deck + "/archive", "{\"x\":1}", BAD_REQUEST.value());
        assertThat(expect(f.member(), "POST", decks(f, profile) + "/" + deck + "/archive", "", OK.value())
                .get("archived").asBoolean()).isTrue();
        expect(f.member(), "GET", f.selection(profile), "", OK.value());
        assertThat(expect(f.member(), "GET", f.selection(profile), "", OK.value())).isEmpty();
        assertThat(expect(f.member(), "GET", decks(f, profile), "", OK.value())).hasSize(1);

        UUID unused = id(expect(f.member(), "POST", decks(f, profile), deckBody("Unused", "Krenko", List.of("R")),
                CREATED.value()));
        expect(f.member(), "DELETE", decks(f, profile) + "/" + unused, "", NO_CONTENT.value());
        assertThat(decks.findById(unused)).isEmpty();
    }

    @Test
    void profilesCannotHoldRolesTransferOwnershipOrBeRemovedAndNeverAuthenticate() throws Exception {
        Fixture f = fixture();
        UUID profile = create(f.member(), f);
        String group = "/api/groups/" + f.groupId();
        expect(f.owner(), "PATCH", group + "/members/" + profile + "/role", "{\"role\":\"ADMIN\"}", FORBIDDEN.value());
        expect(f.owner(), "DELETE", group + "/members/" + profile, "", FORBIDDEN.value());
        expect(f.owner(), "POST", group + "/ownership-transfer",
                json.writeValueAsString(Map.of("targetUserId", profile)), FORBIDDEN.value());
        assertThat(jdbc.queryForObject("SELECT role FROM group_memberships WHERE user_id = ?", String.class, profile))
                .isEqualTo("MEMBER");

        String username = users.findById(profile).orElseThrow().getUsername();
        Actor anonymous = anonymous();
        for (String email : List.of(username, "", profile.toString())) {
            for (String password : List.of("", "correct horse battery")) {
                expect(anonymous, "POST", "/api/session",
                        json.writeValueAsString(Map.of("email", email, "password", password)), UNAUTHORIZED.value());
            }
        }
    }

    @Test
    void databaseRejectsCredentialedOrMultiGroupProfilesAndProfilesActingAsAccounts() throws Exception {
        Fixture f = fixture();
        UUID profile = create(f.member(), f);
        UUID otherGroup = id(expect(f.outsider(), "POST", "/api/groups", "{\"name\":\"Other\"}", CREATED.value()));

        assertThatThrownBy(() -> jdbc.update("INSERT INTO users (id, kind, home_group_id, username, email) "
                + "VALUES (?, 'QUICK_PROFILE', ?, 'Mail', 'mail@example.com')", UUID.randomUUID(), f.groupId()))
                .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("users_kind_credentials");
        assertThatThrownBy(() -> jdbc.update("INSERT INTO users (id, kind, username) VALUES (?, 'QUICK_PROFILE', 'Homeless')",
                UUID.randomUUID())).isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("users_kind_home_group");
        assertThatThrownBy(() -> jdbc.update("INSERT INTO users (id, kind, home_group_id, username) "
                + "VALUES (?, 'QUICK_PROFILE', ?, 'Lonely')", UUID.randomUUID(), f.groupId()))
                .hasMessageContaining("must have exactly one MEMBER membership");
        assertThatThrownBy(() -> jdbc.update("INSERT INTO group_memberships (id, group_id, user_id, role, active) "
                + "VALUES (?, ?, ?, 'MEMBER', true)", UUID.randomUUID(), otherGroup, profile))
                .hasMessageContaining("must have exactly one MEMBER membership");
        assertThatThrownBy(() -> jdbc.update("UPDATE group_memberships SET role = 'ADMIN' WHERE user_id = ?", profile))
                .hasMessageContaining("must have exactly one MEMBER membership");
        assertThatThrownBy(() -> jdbc.update("UPDATE group_memberships SET active = false WHERE user_id = ?", profile))
                .hasMessageContaining("must have exactly one MEMBER membership");
        assertThatThrownBy(() -> jdbc.update("UPDATE users SET home_group_id = ? WHERE id = ?", otherGroup, profile))
                .hasMessageContaining("kind and home group cannot change");
        assertThatThrownBy(() -> jdbc.update("INSERT INTO games (id, group_id, creator_id, recorded_at, result, "
                + "alternate_win_con) VALUES (?, ?, ?, now(), 'DRAW', false)", UUID.randomUUID(), f.groupId(), profile))
                .hasMessageContaining("games.creator_id must reference an account");
        assertThatThrownBy(() -> jdbc.update("INSERT INTO group_invitations (token_hash, group_id, issuer_id, created_at, "
                + "expires_at) VALUES (?, ?, ?, now(), now() + interval '24 hours')", "a".repeat(64), f.groupId(), profile))
                .hasMessageContaining("group_invitations.issuer_id must reference an account");
        assertThatThrownBy(() -> jdbc.update("INSERT INTO play_groups (id, name, owner_id) VALUES (?, 'Mine', ?)",
                UUID.randomUUID(), profile)).hasMessageContaining("play_groups.owner_id must reference an account");
        assertThatThrownBy(() -> jdbc.update("INSERT INTO ownership_transfers (id, group_id, requester_id, target_id, "
                + "state, created_at) VALUES (?, ?, ?, ?, 'PENDING', now())", UUID.randomUUID(), f.groupId(),
                f.owner().id(), profile)).hasMessageContaining("ownership_transfers.target_id must reference an account");
        assertThatThrownBy(() -> jdbc.update("UPDATE users SET deleted = true WHERE id = ?", f.owner().id()))
                .hasMessageContaining("users_deleted");
    }

    @Test
    void accountsAndProfilesSharingADisplayNameStayDistinctWithUuidTieBreaking() throws Exception {
        Fixture f = fixture();
        UUID profile = create(f.member(), f);
        expect(f.member(), "PATCH", profile(f, profile), "{\"name\":\"Morgan\"}", OK.value());
        UUID profileDeck = id(expect(f.member(), "POST", decks(f, profile), deckBody("Deck", "Krenko", List.of("R")),
                CREATED.value()));
        JsonNode game = expect(f.member(), "POST", f.path(), body(List.of(assignment(f.member().id(), f.memberDeck()),
                assignment(profile, profileDeck)), "WIN", profile), CREATED.value());

        List<String> sameName = List.of(f.member().id().toString(), profile.toString()).stream().sorted(
                (left, right) -> UUID.fromString(left).compareTo(UUID.fromString(right))).toList();
        assertThat(ids(game.get("participants"), "userId")).containsExactlyElementsOf(sameName);
        assertThat(StreamSupport.stream(game.get("participants").spliterator(), false)
                .map(row -> row.get("username").asText())).containsOnly("Morgan");

        JsonNode statistics = expect(f.owner(), "GET", "/api/groups/" + f.groupId() + "/statistics", "", OK.value());
        assertThat(ids(statistics.get("players"), "userId")).containsExactlyElementsOf(sameName);
        assertThat(row(statistics.get("players"), "userId", profile.toString()).get("wins").asLong()).isEqualTo(1);
        assertThat(row(statistics.get("players"), "userId", f.member().id().toString()).get("wins").asLong()).isZero();
        assertThat(row(statistics.get("players"), "userId", profile.toString()).get("quickProfile").asBoolean()).isTrue();
        assertThat(row(statistics.get("players"), "userId", f.member().id().toString()).get("quickProfile").asBoolean())
                .isFalse();
        JsonNode members = expect(f.owner(), "GET", "/api/groups/" + f.groupId(), "", OK.value()).get("members");
        List<String> memberIds = ids(members, "userId");
        assertThat(memberIds.indexOf(sameName.get(0))).isLessThan(memberIds.indexOf(sameName.get(1)));
    }

    @Test
    void concurrentProfileDeletionAndGameWriteUsingItsDeckSerializeOnTheGroupLock() throws Exception {
        Fixture f = fixture();
        UUID profile = create(f.member(), f);
        UUID profileDeck = id(expect(f.member(), "POST", decks(f, profile), deckBody("Deck", "Krenko", List.of("R")),
                CREATED.value()));
        List<GameParticipant> players = List.of(assignment(f.creator().id(), f.creatorDeck()),
                assignment(profile, profileDeck));
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(3);
        try {
            Future<?> holder = executor.submit(() -> transactions.executeWithoutResult(status -> {
                jdbc.queryForObject("SELECT id FROM play_groups WHERE id = ? FOR UPDATE", UUID.class, f.groupId());
                locked.countDown();
                await(release);
            }));
            assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();
            Future<?> deletion = executor.submit(() -> quickProfiles.delete(f.owner().id(), f.groupId(), profile));
            Future<Throwable> game = executor.submit(() -> {
                try {
                    createGame(f.creator().id(), f.groupId(), players, GameResult.WIN, profile);
                    return null;
                } catch (InvalidGameException | InvalidDeckAssignmentException expected) {
                    return expected;
                }
            });
            Thread.sleep(300);
            release.countDown();
            holder.get(20, TimeUnit.SECONDS);
            deletion.get(20, TimeUnit.SECONDS);
            Throwable gameFailure = game.get(20, TimeUnit.SECONDS);
            boolean deleted = users.findById(profile).isEmpty();
            if (gameFailure == null) {
                // The game committed first, so deletion anonymized the participating profile.
                assertThat(deleted).isFalse();
                assertThat(users.findById(profile).orElseThrow().isDeleted()).isTrue();
                assertThat(games.count()).isEqualTo(1);
            } else {
                // Deletion committed first; the game no longer finds an active participant.
                assertThat(deleted).isTrue();
                assertThat(games.count()).isZero();
            }
        } finally {
            release.countDown();
            executor.shutdownNow();
        }
    }

    private UUID create(Actor actor, Fixture fixture) throws Exception {
        return UUID.fromString(expect(actor, "POST", profiles(fixture), "", CREATED.value()).get("userId").asText());
    }

    private String profiles(Fixture fixture) {
        return "/api/groups/" + fixture.groupId() + "/quick-profiles";
    }

    private String profile(Fixture fixture, UUID profileId) {
        return profiles(fixture) + "/" + profileId;
    }

    private String decks(Fixture fixture, UUID profileId) {
        return profile(fixture, profileId) + "/decks";
    }

    private static JsonNode row(JsonNode rows, String field, String value) {
        for (JsonNode row : rows) {
            if (row.get(field).asText().equals(value)) {
                return row;
            }
        }
        throw new AssertionError("Missing row " + field + "=" + value + " in " + rows);
    }

    private static List<String> ids(JsonNode rows, String field) {
        List<String> result = new ArrayList<>();
        rows.forEach(row -> result.add(row.get(field).asText()));
        return result;
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(20, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting for the test latch.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }
}
