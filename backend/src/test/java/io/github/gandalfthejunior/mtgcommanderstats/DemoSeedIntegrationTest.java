package io.github.gandalfthejunior.mtgcommanderstats;

import java.nio.file.Path;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import java.io.OutputStream;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import io.github.gandalfthejunior.mtgcommanderstats.demo.OfflineDemoSeedApplication;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Entire Node seed through real sessions/CSRF/validators, backed by PostgreSQL 18. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.servlet.context-path=/demo-0123456789abcdef0123456789abcdef")
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
                    + "await seed('http://127.0.0.1:" + port + "/demo-0123456789abcdef0123456789abcdef', randomBytes(9).toString('base64url'));")
                    .directory(Path.of("..").toFile()).redirectErrorStream(true).redirectOutput(log.toFile()).start();
            try {
                assertThat(child.waitFor(90, TimeUnit.SECONDS)).as("Node demo seed must terminate").isTrue();
                // The seed never logs sessions or randomly generated passwords.
                assertThat(child.exitValue()).as("Node demo seed/verification: %s", Files.readString(log)).isZero();
            } finally {
                if (child.isAlive()) child.destroyForcibly().waitFor();
                Files.deleteIfExists(log);
            }
            // Seven accounts plus one quick profile (#223) with one unused deck.
            assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE kind = 'ACCOUNT'", Integer.class)).isEqualTo(7);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE kind = 'QUICK_PROFILE'", Integer.class))
                    .isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM decks", Integer.class)).isEqualTo(22);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM decks WHERE ever_used", Integer.class)).isEqualTo(14);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM decks WHERE archived", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM play_groups", Integer.class)).isEqualTo(2);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM games", Integer.class)).isEqualTo(32);
        }
        restoresTheCanonicalFixtureIntoAnEmptyMigratedTarget();
    }

    private void restoresTheCanonicalFixtureIntoAnEmptyMigratedTarget() throws Exception {
        PostgreSQLContainer postgres = MtgCommanderStatsApplicationTest.DatabaseConfiguration.POSTGRES;
        String target = "restore_" + UUID.randomUUID().toString().replace("-", "");
        try (Connection admin = DriverManager.getConnection(postgres.getJdbcUrl(),
                postgres.getUsername(), postgres.getPassword());
             Statement statement = admin.createStatement()) {
            statement.execute("CREATE DATABASE " + target);
        }
        String targetUrl = postgres.getJdbcUrl().replaceFirst("/[^/]+$", "/" + target);
        Flyway.configure().dataSource(targetUrl, postgres.getUsername(), postgres.getPassword()).load().migrate();

        String source = jdbc.queryForObject("SELECT current_database()", String.class);
        String container = postgres.getContainerId();
        String user = postgres.getUsername();
        List<String> names = jdbc.queryForList("SELECT tablename FROM pg_tables WHERE schemaname = 'public' "
                + "AND tablename <> 'flyway_schema_history' ORDER BY tablename", String.class);
        byte[] archive = command(null, "docker", "exec", container, "pg_dump", "-U", user,
                "-d", source, "--format=custom", "--data-only", "--no-owner", "--no-acl",
                "--exclude-table=public.flyway_schema_history", "--exclude-schema=session_store");
        byte[] dump = command(archive, "docker", "exec", "-i", container, "pg_restore",
                "--data-only", "--no-owner", "--no-acl", "--file=-");
        byte[] script = command(dump, "node", "--input-type=module", "-e",
                "import {readFileSync} from 'node:fs'; import {restorationSql} from './.devcontainer/seed-demo.mjs'; "
                + "process.stdout.write(restorationSql(readFileSync(0, 'utf8'), process.argv[1].split(',')));",
                String.join(",", names));
        String broken = new String(script, StandardCharsets.UTF_8).replace("SET CONSTRAINTS ALL IMMEDIATE;",
                "INSERT INTO public.play_groups (id, name, owner_id) VALUES "
                + "('00000000-0000-0000-0000-000000000001', 'Broken Reference', "
                + "'00000000-0000-0000-0000-000000000002');\n"
                + "SET CONSTRAINTS ALL IMMEDIATE;");
        assertThat(broken).isNotEqualTo(new String(script, StandardCharsets.UTF_8));
        rejectedRestore(broken.getBytes(StandardCharsets.UTF_8), container, user, target, null);
        try (Connection connection = DriverManager.getConnection(targetUrl, user, postgres.getPassword());
             Statement statement = connection.createStatement()) {
            for (String name : names) {
                try (ResultSet rows = statement.executeQuery("SELECT count(*) FROM public.\"" + name + "\"")) {
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getInt(1)).isZero();
                }
            }
        }
        command(script, "docker", "exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1",
                "-U", user, "-d", target);
        try (Connection connection = DriverManager.getConnection(targetUrl, user, postgres.getPassword());
             Statement statement = connection.createStatement()) {
            for (Map.Entry<String, Integer> entry : Map.of("users", 8, "decks", 22,
                    "play_groups", 2, "games", 32).entrySet()) {
                try (ResultSet rows = statement.executeQuery("SELECT count(*) FROM " + entry.getKey())) {
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getInt(1)).isEqualTo(entry.getValue());
                }
            }
            try (ResultSet rows = statement.executeQuery("SELECT count(*) FROM users profile "
                    + "JOIN group_memberships membership ON membership.user_id = profile.id "
                    + "AND membership.group_id = profile.home_group_id AND membership.role = 'MEMBER' "
                    + "JOIN decks deck ON deck.owner_id = profile.id "
                    + "WHERE profile.kind = 'QUICK_PROFILE' AND membership.active AND NOT deck.ever_used")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getInt(1)).isEqualTo(1);
            }
            try (ResultSet rows = statement.executeQuery("SELECT count(*) FROM play_groups group_row "
                    + "JOIN group_memberships membership ON membership.group_id = group_row.id "
                    + "AND membership.user_id = group_row.owner_id AND membership.role = 'OWNER' "
                    + "WHERE membership.active")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getInt(1)).isEqualTo(2);
            }
            assertThatThrownBy(() -> statement.execute("INSERT INTO play_groups (id, name, owner_id) "
                    + "VALUES ('00000000-0000-0000-0000-000000000003', 'Invalid Owner', "
                    + "'00000000-0000-0000-0000-000000000004')"))
                    .isInstanceOf(SQLException.class)
                    .satisfies(error -> assertThat(((SQLException) error).getSQLState()).isEqualTo("23503"));
        }
        rejectedRestore(script, container, user, target, "Refusing to restore into nonempty application database");
        try (Connection connection = DriverManager.getConnection(targetUrl, user, postgres.getPassword());
             Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery("SELECT count(*) FROM users")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getInt(1)).isEqualTo(8);
        }
    }

    private void rejectedRestore(byte[] script, String container, String user, String target,
            String expectedDiagnostic) throws Exception {
        Path errors = Files.createTempFile("demo-rejected-restore-", ".log");
        try {
            Process process = new ProcessBuilder("docker", "exec", "-i", container, "psql", "-X", "-v",
                    "ON_ERROR_STOP=1", "-U", user, "-d", target).directory(Path.of("..").toFile())
                    .redirectError(errors.toFile()).start();
            try (OutputStream stdin = process.getOutputStream()) {
                stdin.write(script);
            }
            process.getInputStream().readAllBytes();
            assertThat(process.waitFor(60, TimeUnit.SECONDS)).isTrue();
            assertThat(process.exitValue()).isNotZero();
            if (expectedDiagnostic != null) {
                assertThat(Files.readString(errors, StandardCharsets.UTF_8).contains(expectedDiagnostic)).isTrue();
            }
        } finally {
            Files.deleteIfExists(errors);
        }
    }

    private byte[] command(byte[] input, String... args) throws Exception {
        ProcessBuilder builder = new ProcessBuilder(args).directory(Path.of("..").toFile());
        Path errors = Files.createTempFile("demo-restore-errors-", ".log");
        builder.redirectError(errors.toFile());
        try {
            Process process = builder.start();
            try (OutputStream stdin = process.getOutputStream()) {
                if (input != null) stdin.write(input);
            }
            byte[] output = process.getInputStream().readAllBytes();
            assertThat(process.waitFor(60, TimeUnit.SECONDS)).isTrue();
            String errorText = Files.readString(errors, StandardCharsets.UTF_8);
            Matcher constraint = Pattern.compile("constraint \"([a-z0-9_]+)\"").matcher(errorText);
            Matcher category = Pattern.compile("ERROR: *([^\\r\\n]+)").matcher(errorText);
            assertThat(process.exitValue()).as("Data-only restore command failed; constraint: %s; category: %s",
                    constraint.find() ? constraint.group(1) : "none",
                    category.find() ? category.group(1).replaceAll("[0-9a-f]{8}-[0-9a-f-]{27,}", "<id>") : "none")
                    .isZero();
            return output;
        } finally {
            Files.deleteIfExists(errors);
        }
    }
}
