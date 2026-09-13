package io.github.gandalfthejunior.mtgcommanderstats;

import java.util.Locale;

import io.github.gandalfthejunior.mtgcommanderstats.user.domain.InvalidRegistrationException;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.User;
import org.junit.jupiter.api.Test;

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
