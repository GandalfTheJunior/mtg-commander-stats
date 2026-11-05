package io.github.gandalfthejunior.mtgcommanderstats;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import io.github.gandalfthejunior.mtgcommanderstats.user.application.RegisterUser;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.InvalidRegistrationException;
import io.github.gandalfthejunior.mtgcommanderstats.displaytext.InvalidNameException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NamingApiTest extends GameTestSupport {
    private static final String PASSWORD = "correct horse battery";

    @Autowired
    private RegisterUser registrations;

    private static Stream<Arguments> invalidNames() {
        return Stream.of(
                Arguments.of("", "NAME_BLANK"),
                Arguments.of("\u00A0\t\u202F", "NAME_BLANK"),
                Arguments.of("two  spaces", "NAME_INVALID_CHARACTERS"),
                Arguments.of("a\u0000b", "NAME_INVALID_CHARACTERS"),
                Arguments.of("a\tb", "NAME_INVALID_CHARACTERS"),
                Arguments.of("a\nb", "NAME_INVALID_CHARACTERS"),
                Arguments.of("a\u00A0b", "NAME_INVALID_CHARACTERS"),
                Arguments.of("a\u2028b", "NAME_INVALID_CHARACTERS"),
                Arguments.of("a\u200Bb", "NAME_INVALID_CHARACTERS"),
                Arguments.of("a\u202Eb", "NAME_INVALID_CHARACTERS"),
                Arguments.of("a\uE000b", "NAME_INVALID_CHARACTERS"),
                Arguments.of("a\u0378b", "NAME_INVALID_CHARACTERS"),
                Arguments.of("😀", "NAME_INVALID_CHARACTERS"),
                Arguments.of("❤", "NAME_INVALID_CHARACTERS"),
                Arguments.of("a\uFE0Fb", "NAME_INVALID_CHARACTERS"),
                Arguments.of("🇩🇪", "NAME_INVALID_CHARACTERS"));
    }

    @ParameterizedTest
    @MethodSource("invalidNames")
    void everyWriteRejectsInvalidNamesWithoutPartialWrites(String value, String code) throws Exception {
        JsonNode registration = expect(null, "POST", "/api/users", json.writeValueAsString(
                Map.of("email", "rejected@example.com", "username", value, "password", PASSWORD)), 400);
        assertError(registration, "username", code.equals("NAME_BLANK") ? "USERNAME_BLANK" : code, null);
        assertThat(users.count()).isZero();

        Actor owner = register("owner", "Owner");
        JsonNode create = expect(owner, "POST", "/api/decks", deckBody(value, "Karn", List.of()), 400);
        assertError(create, "name", code, null);
        assertThat(decks.count()).isZero();

        UUID deckId = deck(owner);
        JsonNode before = expect(owner, "GET", "/api/decks", "", 200);
        ObjectNode rename = json.createObjectNode();
        rename.put("name", value);
        rename.put("manaBoxUrl", "https://manabox.app/decks/RejectedChange");
        assertError(expect(owner, "PUT", "/api/decks/" + deckId, rename.toString(), 400), "name", code, null);
        assertThat(expect(owner, "GET", "/api/decks", "", 200)).isEqualTo(before);

        JsonNode group = expect(owner, "POST", "/api/groups", json.writeValueAsString(Map.of("name", value)), 400);
        assertError(group, "name", code, null);
        assertThat(groups.count()).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM group_memberships", Long.class)).isZero();
    }

    @Test
    void allWriteEndpointsNormalizeBeforeCountingAndStoreTheExactCanonicalValue() throws Exception {
        Actor owner = register("owner", "\u00A0" + "a\u0308".repeat(20) + "\u202F");
        assertThat(users.findById(owner.id()).orElseThrow().getUsername()).isEqualTo("ä".repeat(20));
        JsonNode deck = expect(owner, "POST", "/api/decks",
                deckBody("\t" + "a\u0308".repeat(30) + "\u202F", "Karn", List.of()), 201);
        UUID deckId = id(deck);
        assertThat(deck.get("name").asText()).isEqualTo("ä".repeat(30));
        String renamed = "q\u0307".repeat(30);
        provider.offline = true;
        JsonNode updated = expect(owner, "PUT", "/api/decks/" + deckId,
                json.writeValueAsString(Map.of("name", renamed)), 200);
        assertThat(updated.get("name").asText()).isEqualTo(renamed);
        assertThat(updated.get("commanders")).isEqualTo(deck.get("commanders"));
        assertThat(decks.findById(deckId).orElseThrow().getName()).isEqualTo(renamed);
        JsonNode group = expect(owner, "POST", "/api/groups",
                json.writeValueAsString(Map.of("name", "\u2007" + "a\u0308".repeat(30) + "\u0085")), 201);
        assertThat(group.get("name").asText()).isEqualTo("ä".repeat(30));
        assertThat(groups.findById(id(group)).orElseThrow().getName()).isEqualTo("ä".repeat(30));
    }

    @Test
    void allWriteEndpointsReportTheirOwnLengthLimit() throws Exception {
        Actor owner = register("owner", "Owner");
        UUID deckId = deck(owner);
        for (String username : List.of("a\u0308".repeat(21), "q" + "\u0307".repeat(80))) {
            JsonNode problem = expect(null, "POST", "/api/users", json.writeValueAsString(
                    Map.of("email", "rejected@example.com", "username", username, "password", PASSWORD)), 400);
            assertError(problem, "username", "NAME_TOO_LONG", 20);
        }
        JsonNode before = expect(owner, "GET", "/api/decks", "", 200);
        for (String name : List.of("a\u0308".repeat(31), "q" + "\u0307".repeat(120))) {
            assertError(expect(owner, "POST", "/api/decks", deckBody(name, "Karn", List.of()), 400),
                    "name", "NAME_TOO_LONG", 30);
            assertError(expect(owner, "PUT", "/api/decks/" + deckId,
                    json.writeValueAsString(Map.of("name", name)), 400), "name", "NAME_TOO_LONG", 30);
            assertError(expect(owner, "POST", "/api/groups", json.writeValueAsString(Map.of("name", name)), 400),
                    "name", "NAME_TOO_LONG", 30);
        }
        assertThat(users.count()).isEqualTo(1);
        assertThat(groups.count()).isZero();
        assertThat(expect(owner, "GET", "/api/decks", "", 200)).isEqualTo(before);
    }

    @Test
    void registrationAccumulatesAllFieldErrorsInExistingOrderAndKeepsDetailTexts() throws Exception {
        for (String body : List.of("{}", "{\"email\":\"invalid\",\"username\":\" \",\"password\":\"short\"}")) {
            JsonNode problem = expect(null, "POST", "/api/users", body, 400);
            String passwordCode = body.equals("{}") ? "PASSWORD_BLANK" : "PASSWORD_TOO_SHORT";
            String passwordDetail = body.equals("{}")
                    ? "Password must not be blank or consist only of whitespace."
                    : "Password must be at least 12 characters long.";
            assertThat(problem.get("detail").asText()).isEqualTo(
                    "Provide a valid email address. Username must not be blank. " + passwordDetail);
            assertThat(problem.get("errors")).isEqualTo(json.valueToTree(List.of(
                    Map.of("field", "email", "code", "INVALID_EMAIL"),
                    Map.of("field", "username", "code", "USERNAME_BLANK"),
                    Map.of("field", "password", "code", passwordCode))));
        }
        for (String username : List.of("😀", "x".repeat(21))) {
            JsonNode problem = expect(null, "POST", "/api/users", json.writeValueAsString(
                    Map.of("email", "invalid", "username", username, "password", "short")), 400);
            assertThat(problem.get("errors").size()).isEqualTo(3);
            assertThat(problem.get("errors").get(0).get("code").asText()).isEqualTo("INVALID_EMAIL");
            assertThat(problem.get("errors").get(1).get("field").asText()).isEqualTo("username");
            assertThat(problem.get("errors").get(1).get("code").asText())
                    .isEqualTo(username.equals("😀") ? "NAME_INVALID_CHARACTERS" : "NAME_TOO_LONG");
            assertThat(problem.get("errors").get(2).get("code").asText()).isEqualTo("PASSWORD_TOO_SHORT");
        }
        assertThat(users.count()).isZero();
    }

    @Test
    void acceptsMtgPunctuationAndMarkupThroughRealWrites() throws Exception {
        Actor owner = register("owner", "Krark & Sakashima");
        String name = "Atraxa, Praetors' Voice";
        JsonNode deck = expect(owner, "POST", "/api/decks", deckBody(name, "Karn", List.of()), 201);
        assertThat(deck.get("name").asText()).isEqualTo(name);
        JsonNode group = expect(owner, "POST", "/api/groups", json.writeValueAsString(Map.of("name", name)), 201);
        assertThat(group.get("name").asText()).isEqualTo(name);
        JsonNode renamed = expect(owner, "PUT", "/api/decks/" + id(deck),
                json.writeValueAsString(Map.of("name", "<Krark> & Sakashima!")), 200);
        assertThat(renamed.get("name").asText()).isEqualTo("<Krark> & Sakashima!");
    }

    @Test
    void missingAndNullNamesReturnStructuredBlankErrors() throws Exception {
        Actor owner = register("owner", "Owner");
        UUID deckId = deck(owner);
        for (String body : List.of("{}", "{\"name\":null}")) {
            assertError(expect(owner, "POST", "/api/decks", body, 400), "name", "NAME_BLANK", null);
            assertError(expect(owner, "PUT", "/api/decks/" + deckId, body, 400), "name", "NAME_BLANK", null);
            assertError(expect(owner, "POST", "/api/groups", body, 400), "name", "NAME_BLANK", null);
        }
        assertThat(decks.count()).isEqualTo(1);
        assertThat(decks.findById(deckId).orElseThrow().getName()).isEqualTo("Deck");
        assertThat(groups.count()).isZero();
    }

    @Test
    void applicationServicesAlsoEnforceRulesAndRetainOtherFieldsOnRejection() throws Exception {
        Actor owner = register("owner", "Owner");
        UUID deckId = deck(owner);
        assertThatThrownBy(
                () -> registrations.register("second@example.com", "bad  name", PASSWORD))
                .isInstanceOf(InvalidRegistrationException.class);
        assertThatThrownBy(() -> deckService.create(owner.id(), "😀", List.of()))
                .isInstanceOf(InvalidNameException.class);
        assertThatThrownBy(() -> deckService.update(owner.id(), deckId, "😀", null))
                .isInstanceOf(InvalidNameException.class);
        assertThatThrownBy(() -> groupService.create(owner.id(), "bad  name"))
                .isInstanceOf(InvalidNameException.class);
        assertThat(users.count()).isEqualTo(1);
        assertThat(decks.findById(deckId).orElseThrow().getName()).isEqualTo("Deck");
        assertThat(groups.count()).isZero();
    }

    private void assertError(JsonNode problem, String field, String code, Integer maximum) {
        assertThat(problem.get("detail").asText()).isNotBlank();
        Map<String, Object> entry = new java.util.LinkedHashMap<>();
        entry.put("field", field);
        entry.put("code", code);
        if (maximum != null) {
            entry.put("maxLength", maximum);
        }
        assertThat(problem.get("errors")).isEqualTo(json.valueToTree(List.of(entry)));
    }
}
