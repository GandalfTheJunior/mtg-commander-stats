package io.github.gandalfthejunior.mtgcommanderstats;

import java.sql.Connection;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;

import io.github.gandalfthejunior.mtgcommanderstats.MtgCommanderStatsApplicationTest.DatabaseConfiguration;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Import(DatabaseConfiguration.class)
class GameRecordsMigrationTest {
    @Autowired
    private DataSource dataSource;

    @Test
    void invitationCutoverInvalidatesLegacyCodesWithoutChangingMemberships() throws Exception {
        String schema = "invitation_upgrade";
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        try {
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("12").load().migrate();
            UUID owner = UUID.randomUUID();
            UUID group = UUID.randomUUID();
            try (Connection connection = dataSource.getConnection()) {
                connection.setAutoCommit(false);
                connection.setSchema(schema);
                JdbcTemplate seed = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
                seed.update("INSERT INTO users (id, username, encoded_password, email) VALUES (?, 'Player', 'hash', ?)",
                        owner, owner + "@example.com");
                seed.update("INSERT INTO play_groups (id, name, join_code, owner_id) VALUES (?, 'Pod', 'AAAAAAAAAAAAAAAAAAAAAA', ?)",
                        group, owner);
                seed.update("INSERT INTO group_memberships (id, group_id, user_id, role, active) VALUES (?, ?, ?, 'OWNER', true)",
                        UUID.randomUUID(), group, owner);
                connection.commit();
            }
            List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM " + schema + ".group_memberships");
            assertThat(Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("13").load()
                    .migrate().migrationsExecuted).isEqualTo(1);
            assertThat(jdbc.queryForList("SELECT * FROM " + schema + ".group_memberships")).isEqualTo(before);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".group_invitations", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM information_schema.columns WHERE table_schema = ? AND table_name = 'play_groups' AND column_name = 'join_code'",
                    Integer.class, schema)).isZero();
        } finally {
            jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    @Test
    void adminUpgradePreservesExistingMembershipRowsAndOwnerInvariant() throws Exception {
        String schema = "admin_upgrade";
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        Flyway old = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("10").load();
        try {
            old.migrate();
            UUID owner = UUID.randomUUID();
            UUID member = UUID.randomUUID();
            UUID group = UUID.randomUUID();
            try (Connection connection = dataSource.getConnection()) {
                connection.setAutoCommit(false);
                connection.setSchema(schema);
                JdbcTemplate seed = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
                for (UUID user : List.of(owner, member)) {
                    seed.update("INSERT INTO users (id, username, encoded_password, email) VALUES (?, 'Player', 'hash', ?)",
                            user, user + "@example.com");
                }
                seed.update("INSERT INTO play_groups (id, name, join_code, owner_id) VALUES (?, 'Pod', 'AAAAAAAAAAAAAAAAAAAAAA', ?)",
                        group, owner);
                seed.update("INSERT INTO group_memberships (id, group_id, user_id, role, active) VALUES (?, ?, ?, 'OWNER', true)",
                        UUID.randomUUID(), group, owner);
                seed.update("INSERT INTO group_memberships (id, group_id, user_id, role, active) VALUES (?, ?, ?, 'MEMBER', true)",
                        UUID.randomUUID(), group, member);
                connection.commit();
            }
            List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM " + schema + ".group_memberships ORDER BY id");
            Flyway upgrade = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("11").load();
            assertThat(upgrade.migrate().migrationsExecuted).isEqualTo(1);
            assertThat(upgrade.validateWithResult().validationSuccessful).isTrue();
            assertThat(jdbc.queryForList("SELECT * FROM " + schema + ".group_memberships ORDER BY id")).isEqualTo(before);
            jdbc.update("UPDATE " + schema + ".group_memberships SET role = 'ADMIN' WHERE user_id = ?", member);
            assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".group_memberships SET role = 'ADMIN' WHERE user_id = ?", owner))
                    .hasStackTraceContaining("must have its designated active owner membership");
        } finally {
            jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    @Test
    void deckFormatUpgradeDefaultsExistingRowsAndPreservesAllSnapshotsAndHistory() throws Exception {
        String schema = "format_upgrade";
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        try {
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("14").load().migrate();
            try (Connection connection = dataSource.getConnection()) {
                connection.setAutoCommit(false);
                connection.setSchema(schema);
                JdbcTemplate seed = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
                UUID owner = UUID.randomUUID();
                UUID member = UUID.randomUUID();
                UUID group = UUID.randomUUID();
                UUID game = UUID.randomUUID();
                UUID first = UUID.randomUUID();
                UUID second = UUID.randomUUID();
                for (UUID user : List.of(owner, member)) {
                    seed.update("INSERT INTO users (id, username, encoded_password, email) VALUES (?, 'Player', 'hash', ?)", user, user + "@example.com");
                }
                seed.update("INSERT INTO play_groups (id, name, owner_id) VALUES (?, 'Pod', ?)", group, owner);
                seed.update("INSERT INTO group_memberships (id, group_id, user_id, role, active) VALUES (?, ?, ?, 'OWNER', true)", UUID.randomUUID(), group, owner);
                int seat = 0;
                for (UUID deck : List.of(first, second)) {
                    UUID user = deck.equals(first) ? owner : member;
                    seed.update("INSERT INTO decks (id, owner_id, name, color_identity, ever_used, archived, mana_box_url) VALUES (?, ?, 'Deck', 'R', true, ?, 'https://manabox.app/decks/Example')", deck, user, deck.equals(second));
                    seed.update("INSERT INTO deck_commanders (deck_id, position, oracle_id, name, base_color_identity, requires_chosen_color, can_be_sole_commander, scryfall_card_id) VALUES (?, 1, ?, 'Commander', 'R', false, true, ?)", deck, UUID.randomUUID(), UUID.randomUUID());
                    seed.update("INSERT INTO deck_companions (deck_id, oracle_id, name, base_color_identity, scryfall_card_id) VALUES (?, ?, 'Companion', 'R', ?)", deck, UUID.randomUUID(), UUID.randomUUID());
                    if (seat == 0) {
                        seed.update("INSERT INTO games (id, group_id, creator_id, recorded_at, result, alternate_win_con, played_on) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'DRAW', false, CURRENT_DATE)", game, group, owner);
                    }
                    seed.update("INSERT INTO game_participants (game_id, user_id, deck_id, start_position, still_in_game) VALUES (?, ?, ?, ?, true)", game, user, deck, ++seat);
                }
                connection.commit();
            }
            List<String> tables = List.of("users", "decks", "deck_commanders", "deck_companions", "games", "game_participants", "play_groups", "group_memberships");
            Map<String, List<Map<String, Object>>> before = new LinkedHashMap<>();
            for (String table : tables) {
                before.put(table, jdbc.queryForList("SELECT * FROM " + schema + "." + table));
            }
            assertThat(Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("15").load()
                    .migrate().migrationsExecuted).isEqualTo(1);
            for (String table : tables) {
                List<Map<String, Object>> after = jdbc.queryForList("SELECT * FROM " + schema + "." + table);
                if (table.equals("decks")) {
                    assertThat(after).allSatisfy(row -> assertThat(row.remove("format")).isEqualTo("COMMANDER"));
                }
                assertThat(after).containsExactlyInAnyOrderElementsOf(before.get(table));
            }
            for (String invalid : List.of("UNKNOWN", "commander", "")) {
                assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".decks SET format = ?", invalid)).hasStackTraceContaining("decks_format_check");
            }
            assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".decks SET format = NULL")).hasStackTraceContaining("not-null");
            jdbc.update("UPDATE " + schema + ".decks SET format = 'PAUPER_COMMANDER'");
            assertThat(jdbc.queryForList("SELECT format FROM " + schema + ".decks", String.class)).containsOnly("PAUPER_COMMANDER");
        } finally {
            jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    @Test
    void companionUpgradeIsAdditiveAndDatabaseEnforcesOneSnapshotPerOwningDeck() {
        String schema = "companion_upgrade";
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        try {
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("13").load().migrate();
            UUID owner = UUID.randomUUID();
            UUID unused = UUID.randomUUID();
            jdbc.update("INSERT INTO " + schema + ".users (id, username, encoded_password, email) VALUES (?, 'Player', 'hash', ?)",
                    owner, owner + "@example.com");
            for (String state : List.of("unused", "used", "archived")) {
                UUID deck = state.equals("unused") ? unused : UUID.randomUUID();
                jdbc.update("INSERT INTO " + schema + ".decks (id, owner_id, name, color_identity, ever_used, archived, mana_box_url)"
                        + " VALUES (?, ?, ?, 'R', ?, ?, 'https://manabox.app/decks/Example')",
                        deck, owner, state, !state.equals("unused"), state.equals("archived"));
                jdbc.update("INSERT INTO " + schema + ".deck_commanders (deck_id, position, oracle_id, name, base_color_identity, requires_chosen_color, can_be_sole_commander, chosen_color, scryfall_card_id)"
                        + " VALUES (?, 1, ?, 'Commander', '', true, true, 'R', ?)", deck, UUID.randomUUID(), UUID.randomUUID());
            }
            List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM " + schema + ".decks ORDER BY id");
            List<Map<String, Object>> commanders = jdbc.queryForList("SELECT * FROM " + schema + ".deck_commanders ORDER BY deck_id");
            assertThat(Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("14").load()
                    .migrate().migrationsExecuted).isEqualTo(1);
            assertThat(jdbc.queryForList("SELECT * FROM " + schema + ".decks ORDER BY id")).isEqualTo(before);
            assertThat(jdbc.queryForList("SELECT * FROM " + schema + ".deck_commanders ORDER BY deck_id")).isEqualTo(commanders);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".deck_companions", Integer.class)).isZero();
            String insert = "INSERT INTO " + schema + ".deck_companions (deck_id, oracle_id, name, base_color_identity, scryfall_card_id) VALUES (?, ?, 'Companion', 'R', ?)";
            jdbc.update(insert, unused, UUID.randomUUID(), UUID.randomUUID());
            assertThatThrownBy(() -> jdbc.update(insert, unused, UUID.randomUUID(), UUID.randomUUID()))
                    .hasStackTraceContaining("duplicate key");
            assertThatThrownBy(() -> jdbc.update(insert, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()))
                    .hasStackTraceContaining("foreign key");
            assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".deck_companions SET base_color_identity = 'RW'"))
                    .hasStackTraceContaining("check constraint");
            jdbc.update("DELETE FROM " + schema + ".decks WHERE id = ?", unused);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".deck_companions", Integer.class)).isZero();
        } finally {
            jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    @Test
    void manaBoxUpgradeLeavesExistingDecksAndCommanderSnapshotsIntactWithNullLinks() {
        String schema = "mana_box_upgrade";
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        Flyway old = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("9").load();
        try {
            old.migrate();
            UUID owner = UUID.randomUUID();
            jdbc.update("INSERT INTO " + schema + ".users (id, username, encoded_password, email) VALUES (?, 'Player', 'test-hash', ?)",
                    owner, owner + "@example.com");
            for (String state : List.of("unused", "used", "archived")) {
                UUID deck = UUID.randomUUID();
                jdbc.update("INSERT INTO " + schema + ".decks (id, owner_id, name, color_identity, ever_used, archived) VALUES (?, ?, ?, 'R', ?, ?)",
                        deck, owner, state, !state.equals("unused"), state.equals("archived"));
                jdbc.update("INSERT INTO " + schema + ".deck_commanders (deck_id, position, oracle_id, name, base_color_identity, requires_chosen_color, can_be_sole_commander, chosen_color, scryfall_card_id, artist, art_crop_url)"
                        + " VALUES (?, 1, ?, 'Synthetic Commander', '', true, true, 'R', ?, 'Synthetic Artist', 'https://cards.scryfall.io/art_crop/synthetic.jpg')",
                        deck, UUID.randomUUID(), UUID.randomUUID());
            }
            List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM " + schema + ".decks ORDER BY id");
            List<Map<String, Object>> snapshots = jdbc.queryForList("SELECT * FROM " + schema + ".deck_commanders ORDER BY deck_id, position");
            Flyway upgrade = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("10").load();
            assertThat(upgrade.migrate().migrationsExecuted).isEqualTo(1);
            assertThat(upgrade.validateWithResult().validationSuccessful).isTrue();
            List<Map<String, Object>> after = jdbc.queryForList("SELECT * FROM " + schema + ".decks ORDER BY id");
            for (Map<String, Object> deck : after) {
                assertThat(deck).containsEntry("mana_box_url", null);
                deck.remove("mana_box_url");
            }
            assertThat(after).isEqualTo(before);
            assertThat(jdbc.queryForList("SELECT * FROM " + schema + ".deck_commanders ORDER BY deck_id, position")).isEqualTo(snapshots);
            assertThat(jdbc.queryForMap("SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = ? AND table_name = 'decks' AND column_name = 'mana_box_url'", schema))
                    .containsEntry("data_type", "text").containsEntry("is_nullable", "YES").containsEntry("column_default", null);
        } finally {
            jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    @Test
    void playedOnUpgradePreservesCompleteV8GamesAndLeavesTheirDatesUnknown() throws Exception {
        String schema = "played_on_upgrade";
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        Flyway old = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("8").load();
        try {
            old.migrate();
            try (Connection connection = dataSource.getConnection()) {
                connection.setAutoCommit(false);
                JdbcTemplate seed = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
                seed.execute("SET LOCAL search_path TO " + schema + ", public");
                UUID owner = UUID.randomUUID();
                UUID member = UUID.randomUUID();
                UUID group = UUID.randomUUID();
                UUID ownerDeck = UUID.randomUUID();
                UUID memberDeck = UUID.randomUUID();
                for (UUID user : List.of(owner, member)) {
                    seed.update("INSERT INTO users (id, username, encoded_password, email) VALUES (?, 'Player', 'test-hash', ?)",
                            user, user + "@example.com");
                }
                seed.update("INSERT INTO play_groups (id, name, join_code, owner_id) VALUES (?, 'Pod', 'abcdefghijklmnopqrstuv', ?)", group, owner);
                seed.update("INSERT INTO group_memberships (id, group_id, user_id, role, active) VALUES (?, ?, ?, 'OWNER', true)",
                        UUID.randomUUID(), group, owner);
                seed.update("INSERT INTO decks (id, owner_id, name, color_identity, ever_used, archived) VALUES (?, ?, 'Deck', 'R', true, false)", ownerDeck, owner);
                seed.update("INSERT INTO decks (id, owner_id, name, color_identity, ever_used, archived) VALUES (?, ?, 'Deck', 'R', true, true)", memberDeck, member);
                for (String mode : List.of("normal", "alternate", "draw")) {
                    UUID game = UUID.randomUUID();
                    seed.update("INSERT INTO games (id, group_id, creator_id, recorded_at, result, alternate_win_con) VALUES (?, ?, ?, '2026-11-01T00:30:00.123456Z', ?, ?)",
                            game, group, owner, mode.equals("draw") ? "DRAW" : "WIN", mode.equals("alternate"));
                    seed.update("INSERT INTO game_participants (game_id, user_id, deck_id, start_position, placement, winner, still_in_game) VALUES (?, ?, ?, 1, ?, ?, ?)",
                            game, owner, ownerDeck, mode.equals("normal") ? 1 : null, mode.equals("alternate") ? true : null, mode.equals("draw") ? true : null);
                    seed.update("INSERT INTO game_participants (game_id, user_id, deck_id, start_position, placement, still_in_game) VALUES (?, ?, ?, 2, ?, ?)",
                            game, member, memberDeck, mode.equals("normal") ? 2 : null, mode.equals("normal") ? null : true);
                }
                connection.commit();
            }
            List<Map<String, Object>> gamesBefore = jdbc.queryForList("SELECT * FROM " + schema + ".games ORDER BY id");
            List<Map<String, Object>> participantsBefore = jdbc.queryForList("SELECT * FROM " + schema + ".game_participants ORDER BY game_id, user_id");
            List<Map<String, Object>> decksBefore = jdbc.queryForList("SELECT * FROM " + schema + ".decks ORDER BY id");
            Flyway upgrade = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("9").load();
            assertThat(upgrade.migrate().migrationsExecuted).isEqualTo(1);
            assertThat(upgrade.validateWithResult().validationSuccessful).isTrue();
            List<Map<String, Object>> gamesAfter = jdbc.queryForList("SELECT * FROM " + schema + ".games ORDER BY id");
            assertThat(gamesAfter).hasSize(3);
            for (Map<String, Object> game : gamesAfter) {
                assertThat(game).containsEntry("played_on", null);
                game.remove("played_on");
            }
            assertThat(gamesAfter).isEqualTo(gamesBefore);
            assertThat(jdbc.queryForList("SELECT * FROM " + schema + ".game_participants ORDER BY game_id, user_id")).isEqualTo(participantsBefore);
            assertThat(jdbc.queryForList("SELECT * FROM " + schema + ".decks ORDER BY id")).isEqualTo(decksBefore);
            assertThat(jdbc.queryForMap("SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = ? AND table_name = 'games' AND column_name = 'played_on'", schema))
                    .containsEntry("data_type", "date").containsEntry("is_nullable", "YES").containsEntry("column_default", null);
        } finally {
            jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    @Test
    void refusesAnyLegacyGameBeforeChangingSchemaOrDataAndAllowsEmptyUpgrade() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        for (boolean existing : new boolean[] {false, true}) {
            String schema = existing ? "legacy_games" : "empty_games";
            Flyway old = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("7").load();
            try {
                old.migrate();
                if (existing) {
                    // One old row suffices: do not require well-formed/real historical data to block.
                    jdbc.execute("ALTER TABLE " + schema + ".games DISABLE TRIGGER ALL");
                    jdbc.execute("INSERT INTO " + schema + ".games VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), now(), 'DRAW', NULL)");
                    jdbc.execute("ALTER TABLE " + schema + ".games ENABLE TRIGGER ALL");
                }
                Flyway upgrade = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).load();
                if (existing) {
                    assertThatThrownBy(upgrade::migrate).hasStackTraceContaining("existing pre-upgrade games");
                    assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".games", Long.class)).isEqualTo(1);
                    assertThat(jdbc.queryForObject("SELECT count(*) FROM information_schema.columns WHERE table_schema = ? AND table_name = 'games' AND column_name = 'winner_user_id'", Long.class, schema)).isEqualTo(1);
                    assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".flyway_schema_history WHERE version = '8'", Long.class)).isZero();
                } else {
                    upgrade.migrate();
                    assertThat(upgrade.validateWithResult().validationSuccessful).isTrue();
                }
            } finally {
                jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
            }
        }
    }
}
