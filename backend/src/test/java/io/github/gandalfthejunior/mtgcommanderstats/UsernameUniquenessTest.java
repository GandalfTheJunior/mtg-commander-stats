package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import io.github.gandalfthejunior.mtgcommanderstats.MtgCommanderStatsApplicationTest.DatabaseConfiguration;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.ReservedUsernames;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.User;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(DatabaseConfiguration.class)
class UsernameUniquenessTest {
    private static final String PASSWORD = "correct horse battery";

    @Value("${local.server.port}")
    private int port;
    @Autowired
    private UserRepository users;
    @Autowired
    private JdbcTemplate jdbc;

    private final JsonMapper json = JsonMapper.builder().build();
    private final HttpClient client = HttpClient.newHttpClient();

    @BeforeEach
    void clearUsers() {
        users.deleteAll();
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', textBlock = """
            Gandalf | gandalf
            Gandalf | GANDALF
            Gandalf | ' gAnDaLf '
            Straße | STRASSE
            Straße | strasse
            STRAẞE | straße
            Ärger | ÄRGER
            Ärger | Ärger
            ᏣᎳᎩ | ꮳꮃꭹ
            ΣΊΣΥΦΟΣ | σίσυφος
            J̌ | ǰ
            """)
    void caseEquivalentUsernameReturnsFieldSpecificConflictAndKeepsTheFirstSpelling(String first, String second)
            throws Exception {
        assertThat(register("first@example.com", first).statusCode()).isEqualTo(HttpStatus.CREATED.value());
        HttpResponse<String> duplicate = register("second@example.com", second);
        assertThat(duplicate.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(duplicate.headers().firstValue("Content-Type")).hasValue("application/problem+json");
        JsonNode problem = json.readTree(duplicate.body());
        assertThat(problem.get("detail").asText()).isEqualTo("Username is already taken.");
        assertThat(problem.get("errors").size()).isEqualTo(1);
        assertThat(problem.get("errors").get(0).get("field").asText()).isEqualTo("username");
        assertThat(problem.get("errors").get(0).get("code").asText()).isEqualTo("USERNAME_TAKEN");
        assertThat(duplicate.body()).doesNotContain("users_username_canonical_key", "SQL", "second@example.com");
        assertThat(users.findAll()).extracting(User::getUsername)
                .containsExactly(java.text.Normalizer.normalize(first, java.text.Normalizer.Form.NFC));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', textBlock = """
            Gandalf | Gandalf2
            Ärger | Arger
            Straße | Strase
            Gandalf | Gаndalf
            """)
    void distinctCanonicalFormsMayCoexistIncludingCrossScriptConfusables(String first, String second)
            throws Exception {
        // The second "Gаndalf" contains Cyrillic U+0430: confusables are deliberately out of scope (#214).
        assertThat(register("first@example.com", first).statusCode()).isEqualTo(HttpStatus.CREATED.value());
        assertThat(register("second@example.com", second).statusCode()).isEqualTo(HttpStatus.CREATED.value());
        assertThat(users.count()).isEqualTo(2);
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', textBlock = """
            Gandalf | gandalf
            Straße | strasse
            STRASSE | strasse
            ẞ | ss
            Ärger | ärger
            ÄRGER | ärger
            ÄRGER | ärger
            ᏣᎳᎩ | ꮳꮃꭹ
            ꮳꮃꭹ | ꮳꮃꭹ
            ΣΊΣΥΦΟΣ | σίσυφοσ
            J̌ | ǰ
            ǰ | ǰ
            ﬃ | ffi
            İ | i̇
            """)
    void databaseCanonicalFormMatchesUnicodeDefaultCaseFolding(String username, String canonical) {
        String expected = java.text.Normalizer.normalize(canonical, java.text.Normalizer.Form.NFC);
        assertThat(users.canonicalizeUsername(username)).isEqualTo(expected);
        assertThat(users.canonicalizeUsername(expected)).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"admin", "Admin", "ADMIN", " aDmIn ", "Administrator", "MODERATOR", "Support", "system",
            "MTG Commander Stats", "mtg-commander-stats", "MtgCommanderStats"})
    void reservedUsernamesAreRejectedInCanonicalForm(String username) throws Exception {
        HttpResponse<String> response = register("wizard@example.com", username);
        assertThat(response.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        JsonNode problem = json.readTree(response.body());
        assertThat(problem.get("detail").asText()).isEqualTo("Username is reserved.");
        assertThat(problem.get("errors").size()).isEqualTo(1);
        assertThat(problem.get("errors").get(0).get("field").asText()).isEqualTo("username");
        assertThat(problem.get("errors").get(0).get("code").asText()).isEqualTo("USERNAME_RESERVED");
        assertThat(users.count()).isZero();
    }

    @Test
    void reservedUsernameIsReportedTogetherWithOtherFieldErrorsInStableOrder() throws Exception {
        HttpResponse<String> response = send(json.writeValueAsString(
                Map.of("email", "invalid", "username", "Admin", "password", "short")));
        assertThat(response.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        JsonNode errors = json.readTree(response.body()).get("errors");
        assertThat(List.of(errors.get(0).get("code").asText(), errors.get(1).get("code").asText(),
                errors.get(2).get("code").asText()))
                .containsExactly("INVALID_EMAIL", "USERNAME_RESERVED", "PASSWORD_TOO_SHORT");
    }

    @Test
    void reservedListIsStoredInCanonicalForm() {
        for (String reserved : ReservedUsernames.CANONICAL) {
            assertThat(users.canonicalizeUsername(reserved)).isEqualTo(reserved);
        }
        assertThat(ReservedUsernames.CANONICAL)
                .contains("admin", "administrator", "moderator", "support", "system", "mtg commander stats");
    }

    @Test
    void namesMerelyContainingAReservedWordRemainAvailable() throws Exception {
        assertThat(register("wizard@example.com", "Admin Gandalf").statusCode()).isEqualTo(HttpStatus.CREATED.value());
    }

    @Test
    void concurrentCaseEquivalentUsernamesCreateExactlyOneUser() throws Exception {
        List<String> names = List.of("Gandalf", "GANDALF", "gandalf", "gAnDaLf", " Gandalf ", "GandAlf");
        try (ExecutorService executor = Executors.newFixedThreadPool(names.size())) {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<Integer>> results = new ArrayList<>();
            for (int index = 0; index < names.size(); index++) {
                String email = "player" + index + "@example.com";
                String name = names.get(index);
                results.add(executor.submit(() -> {
                    start.await();
                    return register(email, name).statusCode();
                }));
            }
            start.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> result : results) {
                statuses.add(result.get());
            }
            assertThat(statuses).containsOnly(HttpStatus.CREATED.value(), HttpStatus.CONFLICT.value())
                    .filteredOn(status -> status == HttpStatus.CREATED.value()).hasSize(1);
        }
        assertThat(users.count()).isEqualTo(1);
    }

    @Test
    void databaseEnforcesUniquenessIndependentlyOfTheService() {
        insertUser("first@example.com", "Gandalf");
        assertThatThrownBy(() -> insertUser("second@example.com", "GANDALF"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("users_username_canonical_key");
        assertThatThrownBy(() -> insertUser("third@example.com", "gandalf"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(users.count()).isEqualTo(1);
    }

    @Test
    void duplicateEmailStillTakesItsExistingConflictResponse() throws Exception {
        assertThat(register("wizard@example.com", "Gandalf").statusCode()).isEqualTo(HttpStatus.CREATED.value());
        HttpResponse<String> duplicate = register("WIZARD@example.com", "Saruman");
        assertThat(duplicate.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(json.readTree(duplicate.body()).get("detail").asText()).isEqualTo("Email is already registered.");
    }

    private void insertUser(String email, String username) {
        jdbc.update("INSERT INTO users (id, email, username, encoded_password) VALUES (?, ?, ?, 'encoded-value')",
                UUID.randomUUID(), email, username);
    }

    private HttpResponse<String> register(String email, String username) throws Exception {
        return send(json.writeValueAsString(Map.of("email", email, "username", username, "password", PASSWORD)));
    }

    private HttpResponse<String> send(String body) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/users"))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
    }
}
