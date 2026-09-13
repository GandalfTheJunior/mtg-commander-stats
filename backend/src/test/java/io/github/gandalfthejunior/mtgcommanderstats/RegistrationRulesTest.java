package io.github.gandalfthejunior.mtgcommanderstats;

import java.util.Locale;

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
    void usernameCanonicalizationDoesNotDependOnServerLocale() {
        Locale previous = Locale.getDefault();
        try {
            Locale.setDefault(Locale.forLanguageTag("tr-TR"));
            assertThat(User.canonicalUsername("  GANDALF I  ")).isEqualTo("gandalf i");
        } finally {
            Locale.setDefault(previous);
        }
    }

    @Test
    void unicodeWhitespaceIsStrippedAndNoUsernameFormatIsInvented() {
        assertThat(User.canonicalUsername("\u2003Wizard #1!\t")).isEqualTo("wizard #1!");
    }

    @ParameterizedTest
    @ValueSource(strings = {"\u00A0", "\u2007", "\u202F", "\u0085", " \t\u00A0\u2007\u202F\u0085\u2003"})
    void unicodeWhitespaceUsesTheSameRulesForUsernamesAndPasswords(String whitespace) {
        assertThat(User.canonicalUsername(whitespace + "GANDALF" + whitespace)).isEqualTo("gandalf");
        assertThat(User.canonicalUsername("Grey" + whitespace + "Wizard"))
                .isEqualTo("grey" + whitespace + "wizard");
        assertThatThrownBy(() -> User.canonicalUsername(whitespace))
                .isInstanceOf(InvalidRegistrationException.class);
        assertThatThrownBy(() -> User.validatePassword(whitespace.repeat(12)))
                .isInstanceOf(InvalidRegistrationException.class);
        assertThatCode(() -> User.validatePassword(whitespace + "abcdefghij" + whitespace))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"\u200B", "\uFEFF"})
    void formatCharactersAreNotSilentlyTreatedAsWhitespace(String character) {
        assertThat(User.canonicalUsername(character + "GANDALF" + character))
                .isEqualTo(character + "gandalf" + character);
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
