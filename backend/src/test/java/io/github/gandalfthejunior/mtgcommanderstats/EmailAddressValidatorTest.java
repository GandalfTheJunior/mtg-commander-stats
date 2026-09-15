package io.github.gandalfthejunior.mtgcommanderstats;

import io.github.gandalfthejunior.mtgcommanderstats.user.application.EmailAddressValidator;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class EmailAddressValidatorTest {
    private final EmailAddressValidator emails = new EmailAddressValidator(
            Validation.buildDefaultValidatorFactory().getValidator());

    @Test
    void acceptsOrdinaryEmailAddress() {
        assertThat(emails.isValid("wizard@example.com")).isTrue();
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "plain-address", "missing-at.example.com", "user@", "@example.com",
            "user@example..com"})
    void rejectsMissingOrMalformedEmailAddress(String email) {
        assertThat(emails.isValid(email)).isFalse();
    }
}
