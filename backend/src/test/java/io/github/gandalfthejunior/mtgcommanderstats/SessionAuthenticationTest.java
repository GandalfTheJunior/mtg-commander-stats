package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Locale;
import java.util.Map;

import io.github.gandalfthejunior.mtgcommanderstats.MtgCommanderStatsApplicationTest.DatabaseConfiguration;
import io.github.gandalfthejunior.mtgcommanderstats.SessionAuthenticationTest.AuthorizationConfiguration;
import io.github.gandalfthejunior.mtgcommanderstats.security.UserPrincipal;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.UserAuthenticationDetails;
import io.github.gandalfthejunior.mtgcommanderstats.user.persistence.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({DatabaseConfiguration.class, AuthorizationConfiguration.class})
class SessionAuthenticationTest {
    @Value("${local.server.port}")
    private int port;
    @Autowired
    private UserRepository users;
    @MockitoSpyBean
    private UserAuthenticationDetails authenticationDetails;
    private final HttpClient client = HttpClient.newHttpClient();
    private final JsonMapper json = JsonMapper.builder().build();
    private static final String EMAIL = "gandalf@example.com";
    private static final String PASSWORD = "  Élf Σtraße password  ";
    private static final String CSRF_HEADER = "X-CSRF-TOKEN";

    @BeforeEach
    void clearUsers() {
        users.deleteAll();
    }

    @Test
    void completeSessionLifecycleRotatesSessionAndCsrfAndInvalidatesLogout() throws Exception {
        JsonNode registered = register(EMAIL, "Gandalf", PASSWORD);
        HttpResponse<String> bootstrap = bootstrap("");
        String anonymousCookie = cookie(bootstrap);
        HttpResponse<String> login = login(" GANDALF@EXAMPLE.COM ", PASSWORD, anonymousCookie, token(bootstrap));
        assertIdentity(login, registered);
        String sessionCookie = cookie(login);
        assertThat(sessionCookie).isNotEqualTo(anonymousCookie);
        assertThat(login.headers().firstValue(HttpHeaders.SET_COOKIE).orElseThrow()).containsIgnoringCase("HttpOnly");
        assertIdentity(send(HttpMethod.GET, "/api/me", "", sessionCookie, null), registered);
        assertThat(send(HttpMethod.GET, "/api/me", "", anonymousCookie, null).statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(send(HttpMethod.DELETE, "/api/session", "", sessionCookie, token(bootstrap)).statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        HttpResponse<String> refreshed = bootstrap(sessionCookie);
        assertThat(send(HttpMethod.DELETE, "/api/session", "", sessionCookie, null).statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(send(HttpMethod.POST, "/api/protected", "{}", sessionCookie, null).statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        HttpResponse<String> logout = send(HttpMethod.DELETE, "/api/session", "", sessionCookie, token(refreshed));
        assertThat(logout.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertThat(logout.body()).isEmpty();
        assertThat(send(HttpMethod.GET, "/api/me", "", sessionCookie, null).statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        HttpResponse<String> next = bootstrap("");
        assertThat(send(HttpMethod.DELETE, "/api/session", "", cookie(next), token(next)).statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(send(HttpMethod.DELETE, "/api/session", "", "", null).statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @Test
    void loginUsesDatabaseOwnedCanonicalEmailAndReturnsDisplayUsername() throws Exception {
        JsonNode registered = register("Alice@Example.com", "Mixed Case Name", PASSWORD);
        HttpResponse<String> csrf = bootstrap("");
        String whitespace = " \t\u001c\u00a0\u2007\u202f\u0085\u2003";
        HttpResponse<String> result = login(whitespace + "ALICE@example.COM" + whitespace,
                PASSWORD, cookie(csrf), token(csrf));
        assertIdentity(result, registered);
        assertThat(json.readTree(result.body()).get("username").asText()).isEqualTo("Mixed Case Name");
        assertThat(result.body()).doesNotContain("alice@example.com");
    }

    @Test
    void passwordsAreExactAndCredentialFailuresAreIndistinguishable() throws Exception {
        register(EMAIL, "Gandalf", PASSWORD);
        HttpResponse<String> csrf = bootstrap("");
        HttpResponse<String> wrong = login(EMAIL, PASSWORD.strip(), cookie(csrf), token(csrf));
        HttpResponse<String> unknown = login("unknown@example.com", PASSWORD, cookie(csrf), token(csrf));
        HttpResponse<String> malformed = login("not-an-email", PASSWORD, cookie(csrf), token(csrf));
        HttpResponse<String> username = login("Gandalf", PASSWORD, cookie(csrf), token(csrf));
        assertThat(wrong.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(unknown.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(malformed.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(username.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(unknown.body()).isEqualTo(wrong.body());
        assertThat(malformed.body()).isEqualTo(wrong.body());
        assertThat(username.body()).isEqualTo(wrong.body());
        assertThat(wrong.body()).doesNotContain(PASSWORD, EMAIL, "Gandalf", "unknown", "encoded");
        for (String transformed : new String[]{PASSWORD.toLowerCase(Locale.ROOT),
                PASSWORD.replace("É", "E\u0301"), PASSWORD + " "}) {
            assertThat(login(EMAIL, transformed, cookie(csrf), token(csrf)).statusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED.value());
        }
        assertThat(send(HttpMethod.GET, "/api/me", "", cookie(csrf), null).statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(login(EMAIL, PASSWORD, cookie(csrf), token(csrf)).statusCode()).isEqualTo(HttpStatus.OK.value());
    }

    @Test
    void internalAuthenticationServiceFailureIsNotReportedAsInvalidCredentials() throws Exception {
        register(EMAIL, "Gandalf", PASSWORD);
        HttpResponse<String> csrf = bootstrap("");
        doThrow(new IllegalStateException("Authentication store unavailable"))
                .when(authenticationDetails).loadUserByUsername(EMAIL);

        HttpResponse<String> response = login(EMAIL, PASSWORD, cookie(csrf), token(csrf));
        assertThat(response.statusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR.value());
        assertThat(response.body()).doesNotContain("Invalid credentials.", "Authentication store unavailable");
    }

    @Test
    void loginRequiresRealBootstrapTokenAndSession() throws Exception {
        register(EMAIL, "Gandalf", PASSWORD);
        HttpResponse<String> csrf = bootstrap("");
        assertThat(login(EMAIL, PASSWORD, cookie(csrf), null).statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(login(EMAIL, PASSWORD, cookie(csrf), "invalid").statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(login(EMAIL, PASSWORD, "", token(csrf)).statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(login(EMAIL, PASSWORD, cookie(csrf), token(csrf)).statusCode()).isEqualTo(HttpStatus.OK.value());
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/me", "/api/users", "/api/unknown", "/login", "/logout"})
    void anonymousProtectedRequestsReturn401WithoutRedirect(String path) throws Exception {
        HttpResponse<String> response = send(HttpMethod.GET, path, "", "", null);
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.headers().firstValue(HttpHeaders.LOCATION)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"email\":null,\"password\":null}",
            "{\"username\":\"Gandalf\",\"password\":\"  Élf Σtraße password  \"}"})
    void missingCredentialsAreGenericFailures(String body) throws Exception {
        HttpResponse<String> csrf = bootstrap("");
        assertThat(send(HttpMethod.POST, "/api/session", body, cookie(csrf), token(csrf)).statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    void downstreamCodeUsesCredentialFreePrincipalAndForbiddenAccessIs403() throws Exception {
        JsonNode registered = register(EMAIL, "Gandalf", PASSWORD);
        HttpResponse<String> csrf = bootstrap("");
        String session = cookie(login(EMAIL, PASSWORD, cookie(csrf), token(csrf)));
        HttpResponse<String> fresh = bootstrap(session);
        assertThat(send(HttpMethod.POST, "/api/test/actor", "", session, null).statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        HttpResponse<String> actor = send(HttpMethod.POST, "/api/test/actor", "", session, token(fresh));
        assertThat(actor.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(json.readTree(actor.body()).get("id").asText()).isEqualTo(registered.get("id").asText());
        assertThat(json.readTree(actor.body()).get("credentialsErased").asBoolean()).isTrue();
        assertThat(send(HttpMethod.GET, "/api/test/forbidden", "", session, null).statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(send(HttpMethod.GET, "/api/test/forbidden", "", "", null).statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
    }

    @ParameterizedTest
    @ValueSource(strings = {"null", "{", "[]"})
    void malformedLoginJsonReturns400(String body) throws Exception {
        HttpResponse<String> csrf = bootstrap("");
        assertThat(send(HttpMethod.POST, "/api/session", body, cookie(csrf), token(csrf)).statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
    }

    @TestConfiguration(proxyBeanMethods = false)
    @EnableMethodSecurity
    static class AuthorizationConfiguration {
        @Bean
        ProtectedEndpoints protectedEndpoints() {
            return new ProtectedEndpoints();
        }
    }

    @RestController
    static class ProtectedEndpoints {
        @PostMapping("/api/test/actor")
        Map<String, Object> actor(Authentication authentication) {
            UserPrincipal user = (UserPrincipal) authentication.getPrincipal();
            return Map.of("id", user.getId(), "credentialsErased",
                    user.getPassword() == null && authentication.getCredentials() == null);
        }

        @GetMapping("/api/test/forbidden")
        @PreAuthorize("denyAll()")
        String forbidden() {
            return "unreachable";
        }
    }

    private JsonNode register(String email, String username, String password) throws Exception {
        String body = json.writeValueAsString(Map.of("email", email, "username", username, "password", password));
        HttpResponse<String> response = send(HttpMethod.POST, "/api/users", body, "", null);
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        assertThat(response.headers().allValues(HttpHeaders.SET_COOKIE)).isEmpty();
        return json.readTree(response.body());
    }

    private HttpResponse<String> bootstrap(String cookie) throws Exception {
        HttpResponse<String> response = send(HttpMethod.GET, "/api/csrf", "", cookie, null);
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(response.headers().firstValue(HttpHeaders.CACHE_CONTROL).orElseThrow()).contains("no-store");
        assertThat(json.readTree(response.body()).get("headerName").asText()).isEqualTo(CSRF_HEADER);
        return response;
    }

    private String token(HttpResponse<String> response) {
        return json.readTree(response.body()).get("token").asText();
    }

    private String cookie(HttpResponse<String> response) {
        return response.headers().firstValue(HttpHeaders.SET_COOKIE).orElseThrow().split(";", 2)[0];
    }

    private void assertIdentity(HttpResponse<String> response, JsonNode registered) {
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(json.readTree(response.body())).isEqualTo(registered);
        assertThat(json.readTree(response.body()).size()).isEqualTo(2);
        assertThat(response.body()).doesNotContain("email", "password", PASSWORD,
                users.findAll().getFirst().getEmail(), users.findAll().getFirst().getEncodedPassword());
    }

    private String credentials(String email, String password) {
        return json.writeValueAsString(Map.of("email", email, "password", password));
    }

    private HttpResponse<String> login(String email, String password, String cookie, String token) throws Exception {
        return send(HttpMethod.POST, "/api/session", credentials(email, password), cookie, token);
    }

    private HttpResponse<String> send(HttpMethod method, String path, String body, String cookie, String token)
            throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
        if (!cookie.isEmpty()) request.header(HttpHeaders.COOKIE, cookie);
        if (token != null) request.header(CSRF_HEADER, token);
        return client.send(request.method(method.name(), HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
    }
}
