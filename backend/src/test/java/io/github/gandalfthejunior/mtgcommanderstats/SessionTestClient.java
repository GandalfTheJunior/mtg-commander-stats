package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.function.IntSupplier;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

/** Real loopback HTTP client for browser-session tests (#303). One instance holds no cookies. */
final class SessionTestClient {
    static final String PASSWORD = "  Élf Σtraße password  ";
    static final String CSRF_HEADER = "X-CSRF-TOKEN";
    private final IntSupplier port;
    private final HttpClient client = HttpClient.newHttpClient();
    final JsonMapper json = JsonMapper.builder().build();

    SessionTestClient(IntSupplier port) {
        this.port = port;
    }

    /** A browser/device: its session cookie and current CSRF token. */
    record Device(String cookie, String token) {}

    JsonNode register(String email, String username) throws Exception {
        HttpResponse<String> response = send(HttpMethod.POST, "/api/users",
                json.writeValueAsString(Map.of("email", email, "username", username, "password", PASSWORD)), "", null);
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        assertThat(response.headers().allValues(HttpHeaders.SET_COOKIE)).isEmpty();
        return json.readTree(response.body());
    }

    HttpResponse<String> bootstrap(String cookie) throws Exception {
        HttpResponse<String> response = send(HttpMethod.GET, "/api/csrf", "", cookie, null);
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        return response;
    }

    HttpResponse<String> login(String email, Device anonymous) throws Exception {
        return send(HttpMethod.POST, "/api/session",
                json.writeValueAsString(Map.of("email", email, "password", PASSWORD)), anonymous.cookie(), anonymous.token());
    }

    /** Anonymous bootstrap, password login and fresh CSRF token, as the SPA does. */
    Device signIn(String email) throws Exception {
        HttpResponse<String> anonymous = bootstrap("");
        HttpResponse<String> login = login(email, new Device(cookie(anonymous), token(anonymous)));
        assertThat(login.statusCode()).isEqualTo(HttpStatus.OK.value());
        String cookie = cookie(login);
        assertThat(cookie).isNotEqualTo(cookie(anonymous));
        return new Device(cookie, token(bootstrap(cookie)));
    }

    int me(Device device) throws Exception {
        return send(HttpMethod.GET, "/api/me", "", device.cookie(), null).statusCode();
    }

    HttpResponse<String> createGroup(Device device, String name) throws Exception {
        return send(HttpMethod.POST, "/api/groups", json.writeValueAsString(Map.of("name", name)),
                device.cookie(), device.token());
    }

    String token(HttpResponse<String> response) {
        return json.readTree(response.body()).get("token").asText();
    }

    static String cookie(HttpResponse<String> response) {
        return setCookie(response).split(";", 2)[0];
    }

    static String setCookie(HttpResponse<String> response) {
        return response.headers().firstValue(HttpHeaders.SET_COOKIE).orElseThrow();
    }

    /** The raw session ID stored in PostgreSQL for a Base64-encoded {@code SESSION} cookie. */
    static String sessionId(String cookie) {
        assertThat(cookie).startsWith("SESSION=");
        return new String(java.util.Base64.getDecoder().decode(cookie.substring("SESSION=".length())),
                java.nio.charset.StandardCharsets.UTF_8);
    }

    HttpResponse<String> send(HttpMethod method, String path, String body, String cookie, String token)
            throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port.getAsInt() + path))
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
        if (!cookie.isEmpty()) request.header(HttpHeaders.COOKIE, cookie);
        if (token != null) request.header(CSRF_HEADER, token);
        return client.send(request.method(method.name(), HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
    }

    /** Deterministic server time for the authenticated-lifetime policy. */
    static final class MutableClock extends Clock {
        private volatile Instant now = Instant.now();

        void reset() {
            now = Instant.now();
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
