package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Function;

import io.github.gandalfthejunior.mtgcommanderstats.MtgCommanderStatsApplicationTest.DatabaseConfiguration;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.RegisterUser;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.InvalidRegistrationException;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.User;
import io.github.gandalfthejunior.mtgcommanderstats.user.persistence.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(DatabaseConfiguration.class)
class UserRegistrationTest {
    private static final String EMAIL = "wizard@example.com";
    private static final String PASSWORD = "correct horse battery";

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
    void anonymousRegistrationPersistsCanonicalEmailAndOnlyReturnsPublicIdentity() throws Exception {
        HttpResponse<String> response = register(" Alice@Example.COM ", " \tGANDALF\n ", PASSWORD);
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        JsonNode body = json.readTree(response.body());
        assertThat(body.size()).isEqualTo(2);
        assertThat(body.get("username").asText()).isEqualTo("GANDALF");
        UUID id = UUID.fromString(body.get("id").asText());
        User stored = users.findById(id).orElseThrow();
        assertThat(stored.getEmail()).isEqualTo("alice@example.com");
        assertThat(stored.getUsername()).isEqualTo("GANDALF");
        assertThat(stored.getEncodedPassword()).isNotEqualTo(PASSWORD);
        assertThat(passwords.matches(PASSWORD, stored.getEncodedPassword())).isTrue();
        assertThat(response.body()).doesNotContain("email", "password", stored.getEncodedPassword(), PASSWORD);
        assertThat(response.headers().allValues("set-cookie")).isEmpty();
        assertThat(send("GET", "/api/users", "").statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
    }

    @ParameterizedTest
    @ValueSource(strings = {"  abcdefghij", "abcdefghij  ", "hello world!", "\tabcdefghij\n",
            "A long passphrase with whitespace and more than seventy-two bytes of password material!", "  Élf Wizards  "})
    void preservesExactPasswordIncludingWhitespace(String password) throws Exception {
        assertThat(register(EMAIL, "wizard", password).statusCode()).isEqualTo(HttpStatus.CREATED.value());
        String encoded = users.findAll().getFirst().getEncodedPassword();
        assertThat(passwords.matches(password, encoded)).isTrue();
        assertThat(passwords.matches(password + " ", encoded)).isFalse();
        if (!password.equals(password.strip())) {
            assertThat(passwords.matches(password.strip(), encoded)).isFalse();
        }
        if (!password.equals(password.toLowerCase(Locale.ROOT))) {
            assertThat(passwords.matches(password.toLowerCase(Locale.ROOT), encoded)).isFalse();
        }
    }

    @Test
    void canonicalDuplicateEmailReturnsConflictWithoutDatabaseDetails() throws Exception {
        assertThat(register("Alice@Example.com", "Gandalf", PASSWORD).statusCode())
                .isEqualTo(HttpStatus.CREATED.value());
        HttpResponse<String> duplicate = register(" ALICE@example.COM ", "Other", "another good password");
        assertThat(duplicate.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(json.readTree(duplicate.body()).get("detail").asText())
                .isEqualTo("Email is already registered.");
        assertThat(duplicate.body()).doesNotContain("users_email_key", "SQL", "encoded_password");
        assertThat(users.count()).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"\u00A0", "\u2007", "\u202F", "\u0085", " \t\u00A0\u2007\u202F\u0085\u2003"})
    void emailBoundaryWhitespaceUsesDatabaseCanonicalIdentity(String whitespace) throws Exception {
        HttpResponse<String> response = register(whitespace + "Alice@Example.COM" + whitespace, "Gandalf", PASSWORD);
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        assertThat(users.findAll().getFirst().getEmail()).isEqualTo("alice@example.com");
        assertThat(register("alice@example.com", "Other", "another good password").statusCode())
                .isEqualTo(HttpStatus.CONFLICT.value());
    }

    @Test
    void differentEmailsMayShareTheSameCasePreservedUsername() throws Exception {
        assertThat(register("first@example.com", " Gandalf ", PASSWORD).statusCode())
                .isEqualTo(HttpStatus.CREATED.value());
        assertThat(register("second@example.com", "Gandalf", PASSWORD).statusCode())
                .isEqualTo(HttpStatus.CREATED.value());
        assertThat(users.findAll()).extracting(User::getUsername).containsOnly("Gandalf");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "plain-address", "missing-at.example.com", "user@", "@example.com", "user@example..com"})
    void rejectsInvalidEmailsAtHttpAndApplicationBoundaries(String email) throws Exception {
        assertThat(register(email, "wizard", PASSWORD).statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThatThrownBy(() -> registerUser.register(email, "wizard", PASSWORD))
                .isInstanceOf(InvalidRegistrationException.class);
        assertThat(users.count()).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "null", "{", "{\"username\":\"gandalf\",\"password\":\"correct horse battery\"}",
            "{\"email\":\"gandalf@example.com\",\"password\":\"correct horse battery\"}",
            "{\"email\":null,\"username\":\"gandalf\",\"password\":\"correct horse battery\"}",
            "{\"email\":\"gandalf@example.com\",\"username\":null,\"password\":\"correct horse battery\"}",
            "{\"email\":\"gandalf@example.com\",\"username\":\"gandalf\",\"password\":null}"})
    void missingOrMalformedInputReturnsBadRequest(String body) throws Exception {
        assertThat(send("POST", "/api/users", body).statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(users.count()).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "short", "12345678901", "            ", " \t\n            ", "😀😀😀😀😀😀"})
    void rejectsInvalidPasswords(String password) throws Exception {
        assertThat(register(EMAIL, "wizard", password).statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(users.count()).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "\t\n", "\u2003"})
    void rejectsBlankUsernames(String username) throws Exception {
        assertThat(register(EMAIL, username, PASSWORD).statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(users.count()).isZero();
    }

    @Test
    void databaseProtectsCanonicalEmailUniquenessIndependentlyOfService() {
        User user = registerUser.register(EMAIL, "Gandalf", PASSWORD);
        assertThatThrownBy(() -> insertUser(EMAIL, "Other", user.getEncodedPassword()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(users.findById(user.getId())).isPresent();
        assertThat(users.count()).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "Alice@Example.com", " alice@example.com", "alice@example.com ", "\u2003alice@example.com"})
    void databaseRejectsNoncanonicalEmails(String email) {
        assertThatThrownBy(() -> insertUser(email, "Gandalf", "encoded-value"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void databaseRejectsBlankUsernameButAllowsMixedCaseAndBoundaryWhitespace() {
        assertThatThrownBy(() -> insertUser(EMAIL, "\u2003", "encoded-value"))
                .isInstanceOf(DataIntegrityViolationException.class);
        insertUser(EMAIL, " Gandalf ", "encoded-value");
        assertThat(users.findAll().getFirst().getUsername()).isEqualTo(" Gandalf ");
    }

    @Test
    void concurrentCaseEquivalentEmailsCreateOnlyOneUser() throws Exception {
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            CountDownLatch start = new CountDownLatch(1);
            Function<String, Callable<Integer>> request = email -> () -> {
                start.await();
                return register(email, "Gandalf", PASSWORD).statusCode();
            };
            Future<Integer> first = executor.submit(request.apply("Alice@Example.com"));
            Future<Integer> second = executor.submit(request.apply(" ALICE@example.COM "));
            start.countDown();
            assertThat(List.of(first.get(), second.get()))
                    .containsExactlyInAnyOrder(HttpStatus.CREATED.value(), HttpStatus.CONFLICT.value());
        }
        assertThat(users.count()).isEqualTo(1);
    }

    @Test
    void passwordHashesAreSalted() {
        User first = registerUser.register("first@example.com", "Same name", PASSWORD);
        User second = registerUser.register("second@example.com", "Same name", PASSWORD);
        assertThat(first.getEncodedPassword()).isNotEqualTo(second.getEncodedPassword());
    }

    @Test
    void csrfExceptionIsLimitedToExactRegistrationPost() throws Exception {
        assertThat(register(EMAIL, "wizard", PASSWORD).statusCode()).isEqualTo(HttpStatus.CREATED.value());
        for (String path : List.of("/api/users", "/api/users/", "/api/users/other", "/other")) {
            assertThat(send("DELETE", path, "{}").statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        }
        assertThat(send("POST", "/api/users/other", "{}").statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(send("POST", "/api/users/", "{}").statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    private void insertUser(String email, String username, String encodedPassword) {
        jdbc.update("INSERT INTO users (id, email, username, encoded_password) VALUES (?, ?, ?, ?)",
                UUID.randomUUID(), email, username, encodedPassword);
    }

    private HttpResponse<String> register(String email, String username, String password) throws Exception {
        return send("POST", "/api/users", json.writeValueAsString(
                Map.of("email", email, "username", username, "password", password)));
    }

    private HttpResponse<String> send(String method, String path, String body) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                        .header("Content-Type", "application/json")
                        .method(method, HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
    }
}
