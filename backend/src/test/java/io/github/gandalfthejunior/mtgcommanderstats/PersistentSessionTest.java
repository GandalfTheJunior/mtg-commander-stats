package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.MtgCommanderStatsApplicationTest.DatabaseConfiguration;
import io.github.gandalfthejunior.mtgcommanderstats.SessionTestClient.Device;
import io.github.gandalfthejunior.mtgcommanderstats.SessionTestClient.MutableClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import static io.github.gandalfthejunior.mtgcommanderstats.SessionTestClient.cookie;
import static io.github.gandalfthejunior.mtgcommanderstats.SessionTestClient.sessionId;
import static io.github.gandalfthejunior.mtgcommanderstats.SessionTestClient.setCookie;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doThrow;

/** #303: PostgreSQL-backed browser sessions with a 7-day idle and a 30-day absolute limit. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ExtendWith(OutputCaptureExtension.class)
@Import({DatabaseConfiguration.class, PersistentSessionTest.ClockConfiguration.class})
class PersistentSessionTest {
    private static final Duration IDLE = Duration.ofDays(7);
    private static final Duration ABSOLUTE = Duration.ofDays(30);
    private static final String AUTHENTICATED_AT =
            "io.github.gandalfthejunior.mtgcommanderstats.security.AuthenticatedSessionLifetime.AUTHENTICATED_AT";
    @Value("${local.server.port}")
    private int port;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private MutableClock clock;
    @MockitoSpyBean
    private JdbcIndexedSessionRepository sessionRepository;
    private final SessionTestClient http = new SessionTestClient(() -> port);
    private String email;

    @BeforeEach
    void freshAccount() throws Exception {
        clock.reset();
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        email = "wizard-" + suffix + "@example.com";
        http.register(email, "Wizard " + suffix);
    }

    @Test
    void loginIssuesPersistentHostOnlyLaxHttpOnlyCookieAndLongServerSession() throws Exception {
        HttpResponse<String> anonymous = http.bootstrap("");
        assertThat(maxInactive(cookie(anonymous))).isEqualTo((int) Duration.ofMinutes(30).toSeconds());
        HttpResponse<String> login = http.login(email, new Device(cookie(anonymous), http.token(anonymous)));
        assertThat(login.statusCode()).isEqualTo(HttpStatus.OK.value());

        String attributes = setCookie(login);
        assertThat(attributes).startsWith("SESSION=").contains("; Max-Age=" + ABSOLUTE.toSeconds(), "; Expires=",
                "; Path=/", "; HttpOnly", "; SameSite=Lax");
        // Local HTTP development: no Secure flag, no Domain (host-only cookie).
        assertThat(attributes).doesNotContainIgnoringCase("Secure").doesNotContainIgnoringCase("Domain=");
        String session = cookie(login);
        assertThat(maxInactive(session)).isEqualTo((int) IDLE.toSeconds());
        // Login emails are not indexed or duplicated into the session table.
        assertThat(jdbc.queryForObject("SELECT principal_name FROM session_store.spring_session WHERE session_id = ?",
                String.class, sessionId(session))).isNull();
        assertThat(http.me(new Device(session, null))).isEqualTo(HttpStatus.OK.value());
        assertThat(http.me(new Device(cookie(anonymous), null))).isEqualTo(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    void idleSessionExpiresAtSevenDaysAndActivityJustBeforeRefreshesOnlyTheIdleWindow() throws Exception {
        Device device = http.signIn(email);
        age(device, IDLE.minusMinutes(1));
        assertThat(http.me(device)).isEqualTo(HttpStatus.OK.value());
        long expiry = jdbc.queryForObject("SELECT expiry_time FROM session_store.spring_session WHERE session_id = ?",
                Long.class, sessionId(device.cookie()));
        assertThat(expiry).isCloseTo(System.currentTimeMillis() + IDLE.toMillis(), within(60_000L));

        age(device, IDLE);
        assertThat(http.me(device)).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(sessionRows(device)).isZero();
        assertThat(http.createGroup(device, "Expired idle").statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @Test
    void absoluteLimitEndsActiveSessionThirtyDaysAfterPasswordLoginDespiteReadsAndCsrfRefresh() throws Exception {
        Device device = http.signIn(email);
        for (int day = 6; day <= 24; day += 6) {
            clock.advance(Duration.ofDays(6));
            assertThat(http.me(device)).isEqualTo(HttpStatus.OK.value());
            http.bootstrap(device.cookie());
        }
        clock.advance(ABSOLUTE.minusDays(24).minusMinutes(1));
        assertThat(http.me(device)).isEqualTo(HttpStatus.OK.value());
        assertThat(http.createGroup(device, "Just in time").statusCode()).isEqualTo(HttpStatus.CREATED.value());
        // The idle interval is capped by the remaining absolute lifetime.
        assertThat(maxInactive(device.cookie())).isEqualTo(60);
        HttpResponse<String> csrf = http.bootstrap(device.cookie());
        assertThat(csrf.headers().allValues(HttpHeaders.SET_COOKIE)).isEmpty();
        Device refreshed = new Device(device.cookie(), http.token(csrf));

        clock.advance(Duration.ofMinutes(1));
        assertThat(http.createGroup(refreshed, "Too late").statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(sessionRows(device)).isZero();
        assertThat(http.me(device)).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        // A later bootstrap with the old cookie yields only a new anonymous session.
        HttpResponse<String> anonymous = http.bootstrap(device.cookie());
        assertThat(http.me(new Device(cookie(anonymous), null))).isEqualTo(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    void expiryAtTheAbsoluteBoundaryAppliesToMeAsWell() throws Exception {
        Device device = http.signIn(email);
        clock.advance(ABSOLUTE);
        assertThat(http.me(device)).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(sessionRows(device)).isZero();
    }

    @Test
    void explicitReloginStartsANewLifetimeForThatDeviceOnly() throws Exception {
        Device laptop = http.signIn(email);
        Device phone = http.signIn(email);
        assertThat(laptop.cookie()).isNotEqualTo(phone.cookie());

        clock.advance(Duration.ofDays(29));
        HttpResponse<String> relogin = http.login(email, laptop);
        assertThat(relogin.statusCode()).isEqualTo(HttpStatus.OK.value());
        Device renewed = new Device(cookie(relogin), null);
        assertThat(renewed.cookie()).isNotEqualTo(laptop.cookie());
        assertThat(http.me(laptop)).isEqualTo(HttpStatus.UNAUTHORIZED.value());

        clock.advance(Duration.ofDays(1));
        assertThat(http.me(phone)).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(http.me(renewed)).isEqualTo(HttpStatus.OK.value());
        clock.advance(Duration.ofDays(29));
        assertThat(http.me(renewed)).isEqualTo(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    void logoutDeletesThePersistedSessionAndLeavesOtherDevicesSignedIn() throws Exception {
        Device laptop = http.signIn(email);
        Device phone = http.signIn(email);
        HttpResponse<String> logout = http.send(HttpMethod.DELETE, "/api/session", "", laptop.cookie(), laptop.token());
        assertThat(logout.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertThat(setCookie(logout)).startsWith("SESSION=;").contains("Max-Age=0");
        assertThat(sessionRows(laptop)).isZero();
        assertThat(http.me(laptop)).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(http.me(phone)).isEqualTo(HttpStatus.OK.value());
    }

    @ParameterizedTest
    @ValueSource(strings = {HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, AUTHENTICATED_AT})
    void unreadableOrMissingAuthenticationStateFailsClosed(String attribute, CapturedOutput output) throws Exception {
        Device corrupt = http.signIn(email);
        Device missing = http.signIn(email);
        assertThat(jdbc.update("UPDATE session_store.spring_session_attributes SET attribute_bytes = '\\x00ff'::bytea "
                + "WHERE attribute_name = ? AND session_primary_id = (SELECT primary_id FROM session_store.spring_session "
                + "WHERE session_id = ?)", attribute, sessionId(corrupt.cookie()))).isOne();
        assertThat(jdbc.update("DELETE FROM session_store.spring_session_attributes WHERE attribute_name = ? AND "
                + "session_primary_id = (SELECT primary_id FROM session_store.spring_session WHERE session_id = ?)",
                attribute, sessionId(missing.cookie()))).isOne();

        assertThat(http.me(corrupt)).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(http.me(missing)).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(sessionRows(corrupt)).isZero();
        assertThat(sessionRows(missing)).isZero();
        assertThat(output.getAll()).contains("Discarding unreadable session attribute")
                .doesNotContain(sessionId(corrupt.cookie()), corrupt.token());
    }

    @Test
    void sessionStoreOutageIsAServerErrorNotALogoutOrNewIdentity(CapturedOutput output) throws Exception {
        Device device = http.signIn(email);
        doThrow(new DataAccessResourceFailureException("simulated session store outage"))
                .when(sessionRepository).findById(anyString());
        HttpResponse<String> me = http.send(HttpMethod.GET, "/api/me", "", device.cookie(), null);
        assertThat(me.statusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR.value());
        assertThat(http.send(HttpMethod.GET, "/api/csrf", "", device.cookie(), null).statusCode())
                .isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR.value());
        assertThat(http.createGroup(device, "Outage").statusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR.value());
        doCallRealMethod().when(sessionRepository).findById(anyString());

        doThrow(new DataAccessResourceFailureException("simulated session store outage"))
                .when(sessionRepository).deleteById(anyString());
        HttpResponse<String> logout = http.send(HttpMethod.DELETE, "/api/session", "", device.cookie(), device.token());
        assertThat(logout.statusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR.value());
        assertThat(logout.headers().firstValue(HttpHeaders.LOCATION)).isEmpty();
        doCallRealMethod().when(sessionRepository).deleteById(anyString());
        // The failed logout was not confirmed; the session still exists and is still the same identity.
        assertThat(http.me(device)).isEqualTo(HttpStatus.OK.value());

        HttpResponse<String> anonymous = http.bootstrap("");
        @SuppressWarnings({"rawtypes", "unchecked"}) // JdbcSession is not public.
        SessionRepository<Session> sessions = (SessionRepository) sessionRepository;
        doThrow(new DataAccessResourceFailureException("simulated session store outage"))
                .when(sessions).save(any());
        HttpResponse<String> login = http.login(email, new Device(cookie(anonymous), http.token(anonymous)));
        assertThat(login.statusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR.value());
        assertThat(login.body()).doesNotContain("Invalid credentials");

        for (HttpResponse<String> response : java.util.List.of(me, logout, login)) {
            assertThat(response.body()).doesNotContain(sessionId(device.cookie()), device.token(), "outage");
        }
        assertThat(output.getAll()).doesNotContain(sessionId(device.cookie()), device.cookie(), device.token(),
                SessionTestClient.PASSWORD);
    }

    private void age(Device device, Duration elapsed) {
        assertThat(jdbc.update("UPDATE session_store.spring_session SET last_access_time = ?, expiry_time = ? "
                + "WHERE session_id = ?", System.currentTimeMillis() - elapsed.toMillis(),
                System.currentTimeMillis() - elapsed.toMillis() + IDLE.toMillis(), sessionId(device.cookie()))).isOne();
    }

    private int maxInactive(String cookie) {
        return jdbc.queryForObject("SELECT max_inactive_interval FROM session_store.spring_session WHERE session_id = ?",
                Integer.class, sessionId(cookie));
    }

    private int sessionRows(Device device) {
        return jdbc.queryForObject("SELECT count(*) FROM session_store.spring_session WHERE session_id = ?",
                Integer.class, sessionId(device.cookie()));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ClockConfiguration {
        @Bean
        MutableClock sessionClock() {
            return new MutableClock();
        }
    }
}
