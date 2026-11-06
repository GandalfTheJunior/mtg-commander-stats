package io.github.gandalfthejunior.mtgcommanderstats;

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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Import(DatabaseConfiguration.class)
class UsernameMigrationTest {
    @Autowired
    private DataSource dataSource;

    @ParameterizedTest
    @CsvSource(delimiter = '|', textBlock = """
            Gandalf | GANDALF
            Straße | STRASSE
            Ärger | ärger
            """)
    void refusesCaseInsensitiveDuplicatesWithoutRenamingOrExposingThem(String first, String second) {
        String schema = "usernames_rejected_" + Math.abs(first.hashCode());
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        try {
            migrate(schema, "17");
            insertUser(jdbc, schema, first);
            insertUser(jdbc, schema, second);
            List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM " + schema + ".users ORDER BY id");
            assertThatThrownBy(() -> migrate(schema, "18"))
                    .hasStackTraceContaining("Case-insensitively duplicate users.username values exist")
                    .satisfies(failure -> assertThat(failure.toString()).doesNotContain(first, second));
            assertThat(jdbc.queryForList("SELECT * FROM " + schema + ".users ORDER BY id")).isEqualTo(before);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema
                    + ".flyway_schema_history WHERE version = '18' AND success", Integer.class)).isZero();
        } finally {
            jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    @Test
    void acceptsDistinctUsernamesUnchangedAndThenEnforcesTheCanonicalIndex() {
        String schema = "usernames_accepted";
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        try {
            migrate(schema, "17");
            insertUser(jdbc, schema, "Gandalf");
            insertUser(jdbc, schema, "Gаndalf");
            insertUser(jdbc, schema, "Straße");
            List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM " + schema + ".users ORDER BY id");
            assertThat(migrate(schema, "18")).isEqualTo(1);
            assertThat(jdbc.queryForList("SELECT * FROM " + schema + ".users ORDER BY id")).isEqualTo(before);
            assertThatThrownBy(() -> insertUser(jdbc, schema, "STRASSE"))
                    .isInstanceOf(DataIntegrityViolationException.class);
        } finally {
            jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    private int migrate(String schema, String target) {
        return Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target(target)
                .load().migrate().migrationsExecuted;
    }

    private void insertUser(JdbcTemplate jdbc, String schema, String username) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO " + schema + ".users (id, username, encoded_password, email) VALUES (?, ?, 'hash', ?)",
                id, username, id + "@example.com");
    }
}
