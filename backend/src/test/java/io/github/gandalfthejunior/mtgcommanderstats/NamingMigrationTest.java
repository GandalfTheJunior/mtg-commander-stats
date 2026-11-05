package io.github.gandalfthejunior.mtgcommanderstats;

import java.sql.Connection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;

import io.github.gandalfthejunior.mtgcommanderstats.MtgCommanderStatsApplicationTest.DatabaseConfiguration;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Import(DatabaseConfiguration.class)
class NamingMigrationTest {
    @Autowired
    private DataSource dataSource;

    @ParameterizedTest
    @CsvSource({"users,username,20", "decks,name,30", "play_groups,name,30"})
    void refusesEveryNonconformingFieldWithoutChangingExistingRows(String table, String column, int maximum) throws Exception {
        String schema = "names_rejected_" + table;
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        try {
            migrate(schema, "15");
            seed(schema, "Player", "Deck", "Group");
            for (String name : List.of("x".repeat(maximum + 1), "q" + "\u0307".repeat(4 * maximum),
                    "bad  name", "😀", "a\tb", "a\u00A0b", "a\u2028b", "a\u200Bb",
                    "a\u202Eb", "a\uE000b", "a\u0378b", "a\uFE0Fb", "🇩🇪", "a\u0308", " Player ",
                    "©", "®", "™", "♥", "♠", "★", "✓", "→", "^", "`", "|", "~", "×", "÷",
                    "١", "１", "²", "½", "Ⅻ", "①", "‼", "⁉")) {
                jdbc.update("UPDATE " + schema + "." + table + " SET " + column + " = ?", name);
                List<Map<String, Object>> before = snapshot(jdbc, schema);
                assertThatThrownBy(() -> migrate(schema, "16"))
                        .hasStackTraceContaining("Nonconforming " + table + "." + column);
                assertThat(snapshot(jdbc, schema)).isEqualTo(before);
                assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema
                        + ".flyway_schema_history WHERE version = '16'", Integer.class)).isZero();
            }
        } finally {
            jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    @Test
    void acceptsCanonicalNamesAtCodePointBoundsAndAddsOnlyGenerousDatabaseLimits() throws Exception {
        String schema = "names_accepted";
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        try {
            migrate(schema, "15");
            seed(schema, "q" + "\u0307".repeat(79), "q" + "\u0307".repeat(119), "ä".repeat(30));
            List<Map<String, Object>> before = snapshot(jdbc, schema);
            assertThat(migrate(schema, "16")).isEqualTo(1);
            assertThat(snapshot(jdbc, schema)).isEqualTo(before);
            for (String[] field : new String[][] {{"users", "username", "80"}, {"decks", "name", "120"},
                    {"play_groups", "name", "120"}}) {
                int bound = Integer.parseInt(field[2]);
                assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + "." + field[0] + " SET " + field[1] + " = ?",
                        "x".repeat(bound + 1))).isInstanceOf(DataIntegrityViolationException.class);
            }
        } finally {
            jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    @Test
    void acceptsAllowlistedPunctuationCurrencyAndMathWithoutRewriting() throws Exception {
        String schema = "names_allowlisted";
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        try {
            migrate(schema, "15");
            seed(schema, "Äß 東京 09", "Quotes ‘–—’_#@%", "$€£¥ + = < >");
            List<Map<String, Object>> before = snapshot(jdbc, schema);
            assertThat(migrate(schema, "16")).isEqualTo(1);
            assertThat(snapshot(jdbc, schema)).isEqualTo(before);
        } finally {
            jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    private int migrate(String schema, String target) {
        return Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target(target)
                .load().migrate().migrationsExecuted;
    }

    private void seed(String schema, String username, String deckName, String groupName) throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            connection.setSchema(schema);
            JdbcTemplate seed = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
            UUID owner = UUID.randomUUID();
            UUID group = UUID.randomUUID();
            seed.update("INSERT INTO users (id, username, encoded_password, email) VALUES (?, ?, 'hash', ?)",
                    owner, username, owner + "@example.com");
            seed.update("INSERT INTO decks (id, owner_id, name, color_identity) VALUES (?, ?, ?, '')",
                    UUID.randomUUID(), owner, deckName);
            seed.update("INSERT INTO play_groups (id, name, owner_id) VALUES (?, ?, ?)", group, groupName, owner);
            seed.update("INSERT INTO group_memberships (id, group_id, user_id, role, active) VALUES (?, ?, ?, 'OWNER', true)",
                    UUID.randomUUID(), group, owner);
            connection.commit();
        }
    }

    private List<Map<String, Object>> snapshot(JdbcTemplate jdbc, String schema) {
        return List.of(
                Map.of("users", jdbc.queryForList("SELECT * FROM " + schema + ".users")),
                Map.of("decks", jdbc.queryForList("SELECT * FROM " + schema + ".decks")),
                Map.of("groups", jdbc.queryForList("SELECT * FROM " + schema + ".play_groups")),
                Map.of("memberships", jdbc.queryForList("SELECT * FROM " + schema + ".group_memberships")));
    }
}
