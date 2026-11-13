package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.http.HttpResponse;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.MtgCommanderStatsApplicationTest.DatabaseConfiguration;
import io.github.gandalfthejunior.mtgcommanderstats.SessionTestClient.Device;
import io.github.gandalfthejunior.mtgcommanderstats.SessionTestClient.MutableClock;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;

import static io.github.gandalfthejunior.mtgcommanderstats.SessionTestClient.cookie;
import static io.github.gandalfthejunior.mtgcommanderstats.SessionTestClient.sessionId;
import static io.github.gandalfthejunior.mtgcommanderstats.SessionTestClient.setCookie;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * #303: sessions are restored by a genuinely fresh application context against the same existing
 * PostgreSQL database, and expired or logged-out sessions never come back.
 */
class SessionRestartTest {
    private static final String EMAIL = "restart@example.com";
    private int port;
    private final SessionTestClient http = new SessionTestClient(() -> port);

    @Test
    void sessionsSurviveBackendRestartWhileExpiredAndLoggedOutSessionsStayInvalid() throws Exception {
        String database = createDatabase();
        MutableClock clock = new MutableClock();
        JsonNode registered;
        Device active;
        Device loggedOut;
        Device idle;
        try (ConfigurableApplicationContext first = start(database, clock)) {
            registered = http.register(EMAIL, "Restart Wizard");
            active = http.signIn(EMAIL);
            assertThat(http.createGroup(active, "Before restart").statusCode()).isEqualTo(HttpStatus.CREATED.value());
            loggedOut = http.signIn(EMAIL);
            assertThat(http.send(HttpMethod.DELETE, "/api/session", "", loggedOut.cookie(), loggedOut.token())
                    .statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
            assertThat(http.me(loggedOut)).isEqualTo(HttpStatus.UNAUTHORIZED.value());
            idle = http.signIn(EMAIL);
        }
        expireIdle(database, idle);

        try (ConfigurableApplicationContext second = start(database, clock)) {
            HttpResponse<String> me = http.send(HttpMethod.GET, "/api/me", "", active.cookie(), null);
            assertThat(me.statusCode()).isEqualTo(HttpStatus.OK.value());
            assertThat(http.json.readTree(me.body())).isEqualTo(registered);
            HttpResponse<String> groups = http.send(HttpMethod.GET, "/api/groups", "", active.cookie(), null);
            assertThat(groups.statusCode()).isEqualTo(HttpStatus.OK.value());
            assertThat(groups.body()).contains("Before restart");
            // The persisted CSRF token is still required and still accepted.
            assertThat(http.createGroup(new Device(active.cookie(), null), "No token").statusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN.value());
            assertThat(http.createGroup(active, "After restart").statusCode()).isEqualTo(HttpStatus.CREATED.value());

            assertThat(http.me(loggedOut)).isEqualTo(HttpStatus.UNAUTHORIZED.value());
            assertThat(http.me(idle)).isEqualTo(HttpStatus.UNAUTHORIZED.value());

            clock.advance(Duration.ofDays(30));
            assertThat(http.me(active)).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        }
        assertThat(sessionIds(database)).doesNotContain(sessionId(active.cookie()), sessionId(loggedOut.cookie()),
                sessionId(idle.cookie()));
    }

    @Test
    void httpsDeploymentsCanRequireSecureCookiesExplicitly() throws Exception {
        try (ConfigurableApplicationContext context = start(createDatabase(), new MutableClock(),
                "server.servlet.session.cookie.secure=true")) {
            http.register(EMAIL, "Secure Wizard");
            HttpResponse<String> anonymous = http.bootstrap("");
            HttpResponse<String> login = http.login(EMAIL, new Device(cookie(anonymous), http.token(anonymous)));
            assertThat(login.statusCode()).isEqualTo(HttpStatus.OK.value());
            assertThat(setCookie(login)).contains("; Secure", "; HttpOnly", "; SameSite=Lax", "; Max-Age=2592000");
            assertThat(login.headers().firstValue(HttpHeaders.SET_COOKIE).orElseThrow()).doesNotContain("Domain=");
        }
    }

    private ConfigurableApplicationContext start(String database, MutableClock clock, String... properties) {
        List<String> all = new ArrayList<>(List.of(
                "spring.datasource.url=" + jdbcUrl(database),
                "spring.datasource.username=" + postgres().getUsername(),
                "spring.datasource.password=" + postgres().getPassword(),
                "spring.datasource.hikari.maximum-pool-size=4",
                "server.port=0"));
        all.addAll(List.of(properties));
        ConfigurableApplicationContext context = new SpringApplicationBuilder(MtgCommanderStatsApplication.class)
                .initializers(created -> created.getBeanFactory().registerSingleton("sessionClock", clock))
                // Command-line arguments take precedence over application.yaml.
                .run(all.stream().map(property -> "--" + property).toArray(String[]::new));
        port = ((WebServerApplicationContext) context).getWebServer().getPort();
        return context;
    }

    private static PostgreSQLContainer postgres() {
        synchronized (DatabaseConfiguration.class) {
            if (!DatabaseConfiguration.POSTGRES.isRunning()) {
                DatabaseConfiguration.POSTGRES.start();
            }
            return DatabaseConfiguration.POSTGRES;
        }
    }

    private static String createDatabase() throws Exception {
        String name = "restart_" + UUID.randomUUID().toString().replace("-", "");
        try (Connection admin = DriverManager.getConnection(postgres().getJdbcUrl(), postgres().getUsername(),
                postgres().getPassword()); Statement statement = admin.createStatement()) {
            statement.execute("CREATE DATABASE " + name);
        }
        return name;
    }

    private static String jdbcUrl(String database) {
        return "jdbc:postgresql://" + postgres().getHost() + ":" + postgres().getMappedPort(5432) + "/" + database;
    }

    private static Connection connect(String database) throws Exception {
        return DriverManager.getConnection(jdbcUrl(database), postgres().getUsername(), postgres().getPassword());
    }

    /** Last activity exactly seven days ago, while the backend is down. */
    private static void expireIdle(String database, Device device) throws Exception {
        long lastAccess = System.currentTimeMillis() - Duration.ofDays(7).toMillis();
        try (Connection connection = connect(database); PreparedStatement update = connection.prepareStatement(
                "UPDATE session_store.spring_session SET last_access_time = ?, expiry_time = ? WHERE session_id = ?")) {
            update.setLong(1, lastAccess);
            update.setLong(2, lastAccess + Duration.ofDays(7).toMillis());
            update.setString(3, sessionId(device.cookie()));
            assertThat(update.executeUpdate()).isOne();
        }
    }

    private static List<String> sessionIds(String database) throws Exception {
        List<String> ids = new ArrayList<>();
        try (Connection connection = connect(database); Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery("SELECT session_id FROM session_store.spring_session")) {
            while (rows.next()) {
                ids.add(rows.getString(1));
            }
        }
        return ids;
    }
}
