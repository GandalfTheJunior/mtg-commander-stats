package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

import io.github.gandalfthejunior.mtgcommanderstats.user.application.RegisterUser;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.InvalidRegistrationException;
import io.github.gandalfthejunior.mtgcommanderstats.user.persistence.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(MtgCommanderStatsApplicationTest.DatabaseConfiguration.class)
class UserRegistrationTest {
    @Value("${local.server.port}")
    private int port;
    @Autowired
    private UserRepository users;
    @Autowired
    private PasswordEncoder passwords;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private RegisterUser registerUser;

    private final JsonMapper json = JsonMapper.builder().build();
    private final HttpClient client = HttpClient.newHttpClient();

    @BeforeEach
    void clearUsers() {
        users.deleteAll();
    }

    @Test
    void anonymousRegistrationPersistsStableIdentityAndOnlyReturnsPublicFields() throws Exception {
        var response = register(" \tGANDALF\n ", "correct horse battery");
        assertThat(response.statusCode()).isEqualTo(201);
        JsonNode body = json.readTree(response.body());
        assertThat(body.size()).isEqualTo(2);
        assertThat(body.get("username").asText()).isEqualTo("gandalf");
        UUID id = UUID.fromString(body.get("id").asText());
        var stored = users.findById(id).orElseThrow();
        assertThat(stored.getId()).isEqualTo(id);
        assertThat(stored.getUsername()).isEqualTo("gandalf");
        assertThat(stored.getEncodedPassword()).isNotEqualTo("correct horse battery");
        assertThat(passwords.matches("correct horse battery", stored.getEncodedPassword())).isTrue();
        assertThat(response.body()).doesNotContain("password", stored.getEncodedPassword(), "correct horse battery");
        assertThat(response.headers().allValues("set-cookie")).isEmpty();
        assertThat(send("GET", "/api/users", "").statusCode()).isEqualTo(403);
    }

    @ParameterizedTest
    @ValueSource(strings = {"  abcdefghij", "abcdefghij  ", "hello world!", "\tabcdefghij\n",
            "A long passphrase with whitespace and more than seventy-two bytes of password material!", "  Élf Wizards  "})
    void preservesExactPasswordIncludingWhitespace(String password) throws Exception {
        assertThat(register("wizard", password).statusCode()).isEqualTo(201);
        var encoded = users.findAll().getFirst().getEncodedPassword();
        assertThat(passwords.matches(password, encoded)).isTrue();
        assertThat(passwords.matches(password + " ", encoded)).isFalse();
        if (!password.equals(password.strip())) {
            assertThat(passwords.matches(password.strip(), encoded)).isFalse();
        }
        if (!password.equals(password.toLowerCase(java.util.Locale.ROOT))) {
            assertThat(passwords.matches(password.toLowerCase(java.util.Locale.ROOT), encoded)).isFalse();
        }
    }

    @Test
    void canonicalDuplicateReturnsConflictWithoutDatabaseDetails() throws Exception {
        assertThat(register("Gandalf", "correct horse battery").statusCode()).isEqualTo(201);
        var duplicate = register(" GANDALF ", "another good password");
        assertThat(duplicate.statusCode()).isEqualTo(409);
        assertThat(json.readTree(duplicate.body()).get("detail").asText())
                .isEqualTo("Username is already registered.");
        assertThat(duplicate.body()).doesNotContain("users_username_key", "SQL", "encoded_password");
        assertThat(users.count()).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"\u00A0", "\u2007", "\u202F", "\u0085", " \t\u00A0\u2007\u202F\u0085\u2003"})
    void unicodeWhitespaceIsNormalizedAndCannotCreateDuplicateUsers(String whitespace) throws Exception {
        var response = register(whitespace + "GANDALF" + whitespace, "correct horse battery");
        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(json.readTree(response.body()).get("username").asText()).isEqualTo("gandalf");
        assertThat(users.findAll().getFirst().getUsername()).isEqualTo("gandalf");
        assertThat(register("gandalf", "another good password").statusCode()).isEqualTo(409);
        assertThat(register(whitespace, "correct horse battery").statusCode()).isEqualTo(400);
        assertThat(register("wizard", whitespace.repeat(12)).statusCode()).isEqualTo(400);
        assertThat(users.count()).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"\u00A0", "\u2007", "\u202F", "\u0085"})
    void unicodePasswordWhitespaceCountsAndIsEncodedExactly(String whitespace) throws Exception {
        String password = whitespace + "abcde" + whitespace + "fghi" + whitespace;
        assertThat(register("wizard", password).statusCode()).isEqualTo(201);
        var encoded = users.findAll().getFirst().getEncodedPassword();
        assertThat(passwords.matches(password, encoded)).isTrue();
        assertThat(passwords.matches("abcde" + whitespace + "fghi", encoded)).isFalse();
        assertThat(passwords.matches(password.replace(whitespace, " "), encoded)).isFalse();
        assertThat(register("other", whitespace + "abcdefgh" + whitespace).statusCode()).isEqualTo(400);
    }

    @ParameterizedTest
    @ValueSource(strings = {"\u00A0", "\u2007", "\u202F", "\u0085", " \t\u00A0\u2007\u202F\u0085\u2003"})
    void databaseEnforcesBroaderWhitespaceBoundariesButPreservesInternalSpaces(String whitespace) {
        for (String username : List.of(whitespace, whitespace + "wizard", "wizard" + whitespace)) {
            assertThatThrownBy(() -> insertUser(username, "encoded-value"))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
        insertUser("grey" + whitespace + "wizard", "encoded-value");
        assertThat(users.findAll().getFirst().getUsername()).isEqualTo("grey" + whitespace + "wizard");
    }

    @Test
    void concurrentDuplicatesCreateOnlyOneUser() throws Exception {
        try (var executor = Executors.newFixedThreadPool(2)) {
            var start = new CountDownLatch(1);
            Callable<Integer> request = () -> {
                start.await();
                return register("Gandalf", "correct horse battery").statusCode();
            };
            var first = executor.submit(request);
            var second = executor.submit(request);
            start.countDown();
            assertThat(List.of(first.get(), second.get())).containsExactlyInAnyOrder(201, 409);
        }
        assertThat(users.count()).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "null", "{", "{\"username\":\"gandalf\"}",
            "{\"password\":\"correct horse battery\"}",
            "{\"username\":null,\"password\":\"correct horse battery\"}",
            "{\"username\":\"gandalf\",\"password\":null}"})
    void missingOrMalformedInputReturnsBadRequest(String body) throws Exception {
        assertThat(send("POST", "/api/users", body).statusCode()).isEqualTo(400);
        assertThat(users.count()).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "short", "12345678901", "            ", " \t\n            ", "😀😀😀😀😀😀"})
    void rejectsInvalidPasswords(String password) throws Exception {
        assertThat(register("wizard", password).statusCode()).isEqualTo(400);
        assertThat(users.count()).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "\t\n", "\u2003"})
    void rejectsBlankUsernames(String username) throws Exception {
        assertThat(register(username, "correct horse battery").statusCode()).isEqualTo(400);
        assertThat(users.count()).isZero();
    }

    @Test
    void serviceAlsoValidatesInputOutsideHttpBoundary() {
        assertThatThrownBy(() -> registerUser.register("wizard", "short"))
                .isInstanceOf(InvalidRegistrationException.class);
        assertThatThrownBy(() -> registerUser.register(" ", "correct horse battery"))
                .isInstanceOf(InvalidRegistrationException.class);
        assertThat(users.count()).isZero();
    }

    @Test
    void databaseProtectsUsernameUniquenessIndependentlyOfService() {
        var user = registerUser.register("gandalf", "correct horse battery");
        assertThatThrownBy(() -> insertUser("gandalf", user.getEncodedPassword()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(users.findById(user.getId())).isPresent();
        assertThat(users.count()).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "Gandalf", " gandalf", "gandalf ", "\tgandalf", "gandalf\n", "\u2003gandalf", "\u2003"})
    void databaseRejectsNoncanonicalUsernames(String username) {
        assertThatThrownBy(() -> insertUser(username, "encoded-value"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void passwordHashesAreSalted() {
        var first = registerUser.register("first", "correct horse battery");
        var second = registerUser.register("second", "correct horse battery");
        assertThat(first.getEncodedPassword()).isNotEqualTo(second.getEncodedPassword());
    }

    @Test
    void csrfExceptionIsLimitedToExactRegistrationPost() throws Exception {
        assertThat(register("wizard", "correct horse battery").statusCode()).isEqualTo(201);
        // These requests are rejected by CSRF before authorization (and before any endpoint lookup).
        for (String path : List.of("/api/users", "/api/users/", "/api/users/other", "/other")) {
            assertThat(send("DELETE", path, "{}").statusCode()).isEqualTo(403);
        }
        assertThat(send("POST", "/api/users/other", "{}").statusCode()).isEqualTo(403);
        assertThat(send("POST", "/api/users/", "{}").statusCode()).isEqualTo(403);
    }

    private void insertUser(String username, String encodedPassword) {
        jdbc.update("INSERT INTO users (id, username, encoded_password) VALUES (?, ?, ?)",
                UUID.randomUUID(), username, encodedPassword);
    }

    private HttpResponse<String> register(String username, String password) throws Exception {
        return send("POST", "/api/users", json.writeValueAsString(Map.of("username", username, "password", password)));
    }

    private HttpResponse<String> send(String method, String path, String body) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                        .header("Content-Type", "application/json")
                        .method(method, HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
    }
}
