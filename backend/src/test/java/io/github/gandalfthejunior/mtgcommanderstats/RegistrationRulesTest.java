package io.github.gandalfthejunior.mtgcommanderstats;

import io.github.gandalfthejunior.mtgcommanderstats.user.domain.InvalidRegistrationException;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RegistrationRulesTest {
    @Test
    void unicodeWhitespaceIsStrippedAndNoUsernameFormatIsInvented() {
        assertThat(User.trimUsername("\u2003Wizard #1!\t")).isEqualTo("Wizard #1!");
    }

    @ParameterizedTest
    @ValueSource(strings = {"\u00A0", "\u2007", "\u202F", "\u0085", " \t\u00A0\u2007\u202F\u0085\u2003"})
    void unicodeWhitespaceUsesTheSameRulesForUsernamesAndPasswords(String whitespace) {
        assertThat(User.trimUsername(whitespace + "GANDALF" + whitespace)).isEqualTo("GANDALF");
        assertThat(User.trimUsername("Grey" + whitespace + "Wizard"))
                .isEqualTo("Grey" + whitespace + "Wizard");
        assertThatThrownBy(() -> User.trimUsername(whitespace))
                .isInstanceOf(InvalidRegistrationException.class);
        assertThatThrownBy(() -> User.validatePassword(whitespace.repeat(12)))
                .isInstanceOf(InvalidRegistrationException.class);
        assertThatCode(() -> User.validatePassword(whitespace + "abcdefghij" + whitespace))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"\u200B", "\uFEFF"})
    void formatCharactersAreNotSilentlyTreatedAsWhitespace(String character) {
        assertThat(User.trimUsername(character + "GANDALF" + character))
                .isEqualTo(character + "GANDALF" + character);
        assertThatCode(() -> User.validatePassword(character.repeat(12))).doesNotThrowAnyException();
    }

    @Test
    void passwordLengthCountsCharactersAndAllowsWhitespaceAtTheBoundary() {
        assertThatCode(() -> User.validatePassword("  abcdefghij")).doesNotThrowAnyException();
        assertThatCode(() -> User.validatePassword("😀".repeat(12))).doesNotThrowAnyException();
        assertThatThrownBy(() -> User.validatePassword("😀".repeat(11)))
                .isInstanceOf(InvalidRegistrationException.class);
        assertThatThrownBy(() -> User.validatePassword("\u2003".repeat(12)))
                .isInstanceOf(InvalidRegistrationException.class);
    }
}
