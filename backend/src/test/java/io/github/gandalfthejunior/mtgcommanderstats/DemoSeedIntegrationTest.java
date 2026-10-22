package io.github.gandalfthejunior.mtgcommanderstats;

import java.nio.file.Path;
import java.nio.file.Files;
import java.util.concurrent.TimeUnit;

import io.github.gandalfthejunior.mtgcommanderstats.demo.OfflineDemoSeedApplication;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/** Entire Node seed through real sessions/CSRF/validators, backed by PostgreSQL 18. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({MtgCommanderStatsApplicationTest.DatabaseConfiguration.class, OfflineDemoSeedApplication.Fixtures.class})
class DemoSeedIntegrationTest {
    @Value("${local.server.port}")
    private int port;
    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void seedsAndVerifiesTheCompletePinnedScenarioOfflineTwice() throws Exception {
        for (int run = 0; run < 2; run++) {
            // Only this test's disposable Testcontainer, never a developer database.
            jdbc.execute("TRUNCATE users CASCADE");
            Path log = Files.createTempFile("offline-demo-test-", ".log");
            Process child = new ProcessBuilder("node", "--input-type=module", "-e",
                    "import {seed} from './tools/demo/api.mjs'; import {randomBytes} from 'node:crypto'; "
                    + "await seed('http://127.0.0.1:" + port + "', randomBytes(9).toString('base64url'));")
                    .directory(Path.of("..").toFile()).redirectErrorStream(true).redirectOutput(log.toFile()).start();
            try {
                assertThat(child.waitFor(90, TimeUnit.SECONDS)).as("Node demo seed must terminate").isTrue();
                // The seed never logs sessions or randomly generated passwords.
                assertThat(child.exitValue()).as("Node demo seed/verification: %s", Files.readString(log)).isZero();
            } finally {
                if (child.isAlive()) child.destroyForcibly().waitFor();
                Files.deleteIfExists(log);
            }
            assertThat(jdbc.queryForObject("SELECT count(*) FROM users", Integer.class)).isEqualTo(6);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM decks", Integer.class)).isEqualTo(18);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM decks WHERE ever_used", Integer.class)).isEqualTo(12);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM decks WHERE archived", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM play_groups", Integer.class)).isEqualTo(2);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM games", Integer.class)).isEqualTo(36);
        }
    }
}
