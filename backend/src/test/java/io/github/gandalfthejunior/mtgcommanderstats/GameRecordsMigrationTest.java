package io.github.gandalfthejunior.mtgcommanderstats;

import javax.sql.DataSource;

import io.github.gandalfthejunior.mtgcommanderstats.MtgCommanderStatsApplicationTest.DatabaseConfiguration;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Import(DatabaseConfiguration.class)
class GameRecordsMigrationTest {
    @Autowired
    private DataSource dataSource;

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
