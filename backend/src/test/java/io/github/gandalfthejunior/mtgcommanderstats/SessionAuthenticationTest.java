package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;

import io.github.gandalfthejunior.mtgcommanderstats.user.persistence.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({MtgCommanderStatsApplicationTest.DatabaseConfiguration.class, SessionAuthenticationTest.AuthorizationConfiguration.class})
class SessionAuthenticationTest {
    @Value("${local.server.port}")
    private int port;
    @Autowired
    private UserRepository users;
    private final HttpClient client = HttpClient.newHttpClient();
    private final JsonMapper json = JsonMapper.builder().build();
    private static final String PASSWORD = "  Élf Σtraße password  ";

    @BeforeEach
    void clearUsers() {
        users.deleteAll();
    }

    @Test
    void completeSessionLifecycleRotatesSessionAndCsrfAndInvalidatesLogout() throws Exception {
        var registered = register("Gandalf", PASSWORD);
        var bootstrap = bootstrap("");
        String anonymousCookie = cookie(bootstrap);
        var login = login("GANDALF", PASSWORD, anonymousCookie, token(bootstrap));
        assertIdentity(login, registered);
        String sessionCookie = cookie(login);
        assertThat(sessionCookie).isNotEqualTo(anonymousCookie);
        assertThat(login.headers().firstValue("set-cookie").orElseThrow()).containsIgnoringCase("HttpOnly");
        assertIdentity(send("GET", "/api/me", "", sessionCookie, null), registered);
        assertThat(send("GET", "/api/me", "", anonymousCookie, null).statusCode()).isEqualTo(401);
        assertThat(send("DELETE", "/api/session", "", sessionCookie, token(bootstrap)).statusCode()).isEqualTo(403);
        var refreshed = bootstrap(sessionCookie);
        assertThat(send("DELETE", "/api/session", "", sessionCookie, null).statusCode()).isEqualTo(403);
        assertThat(send("POST", "/api/protected", "{}", sessionCookie, null).statusCode()).isEqualTo(403);
        var logout = send("DELETE", "/api/session", "", sessionCookie, token(refreshed));
        assertThat(logout.statusCode()).isEqualTo(204);
        assertThat(logout.body()).isEmpty();
        assertThat(send("GET", "/api/me", "", sessionCookie, null).statusCode()).isEqualTo(401);
        var next = bootstrap("");
        assertThat(send("DELETE", "/api/session", "", cookie(next), token(next)).statusCode()).isEqualTo(401);
        assertThat(send("DELETE", "/api/session", "", "", null).statusCode()).isEqualTo(403);
    }

    @ParameterizedTest
    @CsvSource({"Gandalf,GANDALF,gandalf", "Σ,ς,σ", "ΟΣ,Ος,οσ", "Straße,STRASSE,strasse",
            "ẞ,ss,ss", "ﬃ,FFI,ffi", "İ,i̇,i̇", "Ꭰ,ꭰ,ꭰ", "𐐀,𐐨,𐐨"})
    void loginUsesDatabaseOwnedCanonicalIdentity(String registeredName, String loginName, String expected)
            throws Exception {
        var registered = register(registeredName, PASSWORD);
        var csrf = bootstrap("");
        String whitespace = " \t\u001c\u00a0\u2007\u202f\u0085\u2003";
        var result = login(whitespace + loginName + whitespace, PASSWORD, cookie(csrf), token(csrf));
        assertIdentity(result, registered);
        assertThat(json.readTree(result.body()).get("username").asText()).isEqualTo(expected);
    }

    @Test
    void passwordsAreExactAndCredentialFailuresAreIndistinguishable() throws Exception {
        register("gandalf", PASSWORD);
        var csrf = bootstrap("");
        var wrong = login("gandalf", PASSWORD.strip(), cookie(csrf), token(csrf));
        var unknown = login("unknown", PASSWORD, cookie(csrf), token(csrf));
        assertThat(wrong.statusCode()).isEqualTo(401);
        assertThat(unknown.statusCode()).isEqualTo(401);
        assertThat(unknown.body()).isEqualTo(wrong.body());
        assertThat(wrong.body()).doesNotContain(PASSWORD, "gandalf", "unknown", "encoded");
        for (String transformed : new String[]{PASSWORD.toLowerCase(java.util.Locale.ROOT),
                PASSWORD.replace("É", "E\u0301"), PASSWORD + " "}) {
            assertThat(login("gandalf", transformed, cookie(csrf), token(csrf)).statusCode()).isEqualTo(401);
        }
        assertThat(send("GET", "/api/me", "", cookie(csrf), null).statusCode()).isEqualTo(401);
        assertThat(login("gandalf", PASSWORD, cookie(csrf), token(csrf)).statusCode()).isEqualTo(200);
    }

    @Test
    void loginRequiresRealBootstrapTokenAndSession() throws Exception {
        register("gandalf", PASSWORD);
        var csrf = bootstrap("");
        assertThat(login("gandalf", PASSWORD, cookie(csrf), null).statusCode()).isEqualTo(403);
        assertThat(login("gandalf", PASSWORD, cookie(csrf), "invalid").statusCode()).isEqualTo(403);
        assertThat(login("gandalf", PASSWORD, "", token(csrf)).statusCode()).isEqualTo(403);
        assertThat(login("gandalf", PASSWORD, cookie(csrf), token(csrf)).statusCode()).isEqualTo(200);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/me", "/api/users", "/api/unknown", "/login", "/logout"})
    void anonymousProtectedRequestsReturn401WithoutRedirect(String path) throws Exception {
        var response = send("GET", path, "", "", null);
        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.headers().firstValue("location")).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"username\":null,\"password\":null}"})
    void missingCredentialsAreGenericFailures(String body) throws Exception {
        var csrf = bootstrap("");
        assertThat(send("POST", "/api/session", body, cookie(csrf), token(csrf)).statusCode()).isEqualTo(401);
    }

    @Test
    void downstreamCodeUsesCredentialFreePrincipalAndForbiddenAccessIs403() throws Exception {
        var registered = register("gandalf", PASSWORD);
        var csrf = bootstrap("");
        String session = cookie(login("gandalf", PASSWORD, cookie(csrf), token(csrf)));
        var fresh = bootstrap(session);
        assertThat(send("POST", "/api/test/actor", "", session, null).statusCode()).isEqualTo(403);
        var actor = send("POST", "/api/test/actor", "", session, token(fresh));
        assertThat(actor.statusCode()).isEqualTo(200);
        assertThat(json.readTree(actor.body()).get("id").asText()).isEqualTo(registered.get("id").asText());
        assertThat(json.readTree(actor.body()).get("credentialsErased").asBoolean()).isTrue();
        assertThat(send("GET", "/api/test/forbidden", "", session, null).statusCode()).isEqualTo(403);
        assertThat(send("GET", "/api/test/forbidden", "", "", null).statusCode()).isEqualTo(401);
    }

    @ParameterizedTest
    @ValueSource(strings = {"null", "{", "[]"})
    void malformedLoginJsonReturns400(String body) throws Exception {
        var csrf = bootstrap("");
        assertThat(send("POST", "/api/session", body, cookie(csrf), token(csrf)).statusCode()).isEqualTo(400);
    }

    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods = false)
    @org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
    static class AuthorizationConfiguration {
        @org.springframework.context.annotation.Bean
        ProtectedEndpoints protectedEndpoints() {
            return new ProtectedEndpoints();
        }
    }

    @org.springframework.web.bind.annotation.RestController
    static class ProtectedEndpoints {
        @org.springframework.web.bind.annotation.PostMapping("/api/test/actor")
        Map<String, Object> actor(org.springframework.security.core.Authentication authentication) {
            var user = (io.github.gandalfthejunior.mtgcommanderstats.security.UserPrincipal) authentication.getPrincipal();
            return Map.of("id", user.getId(), "credentialsErased",
                    user.getPassword() == null && authentication.getCredentials() == null);
        }

        @org.springframework.web.bind.annotation.GetMapping("/api/test/forbidden")
        @org.springframework.security.access.prepost.PreAuthorize("denyAll()")
        String forbidden() {
            return "unreachable";
        }
    }

    private JsonNode register(String username, String password) throws Exception {
        var response = send("POST", "/api/users", credentials(username, password), "", null);
        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(response.headers().allValues("set-cookie")).isEmpty();
        return json.readTree(response.body());
    }

    private HttpResponse<String> bootstrap(String cookie) throws Exception {
        var response = send("GET", "/api/csrf", "", cookie, null);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("cache-control").orElseThrow()).contains("no-store");
        assertThat(json.readTree(response.body()).get("headerName").asText()).isEqualTo("X-CSRF-TOKEN");
        return response;
    }

    private String token(HttpResponse<String> response) {
        return json.readTree(response.body()).get("token").asText();
    }

    private String cookie(HttpResponse<String> response) {
        return response.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0];
    }

    private void assertIdentity(HttpResponse<String> response, JsonNode registered) {
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json.readTree(response.body())).isEqualTo(registered);
        assertThat(json.readTree(response.body()).size()).isEqualTo(2);
        assertThat(response.body()).doesNotContain("password", PASSWORD, users.findAll().getFirst().getEncodedPassword());
    }

    private String credentials(String username, String password) {
        return json.writeValueAsString(Map.of("username", username, "password", password));
    }

    private HttpResponse<String> login(String username, String password, String cookie, String token) throws Exception {
        return send("POST", "/api/session", credentials(username, password), cookie, token);
    }

    private HttpResponse<String> send(String method, String path, String body, String cookie, String token)
            throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json");
        if (!cookie.isEmpty()) request.header("Cookie", cookie);
        if (token != null) request.header("X-CSRF-TOKEN", token);
        return client.send(request.method(method, HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
    }
}
