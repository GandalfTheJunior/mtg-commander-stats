package io.github.gandalfthejunior.mtgcommanderstats;

import io.github.gandalfthejunior.mtgcommanderstats.displaytext.DisplayText;
import io.github.gandalfthejunior.mtgcommanderstats.displaytext.InvalidDisplayTextException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DisplayTextTest {
    @ParameterizedTest
    @ValueSource(strings = {"\u00A0", "\u2007", "\u202F", "\u0085", " \t\u001c\u2003"})
    void trimsProductBoundaryWhitespaceAndPreservesInternalText(String whitespace) {
        assertThat(new DisplayText(whitespace + "Atraxa  SUPERFRIENDS" + whitespace).value())
                .isEqualTo("Atraxa  SUPERFRIENDS");
        assertThat(new DisplayText("Atraxa" + whitespace + "Voice").value())
                .isEqualTo("Atraxa" + whitespace + "Voice");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "\t\n", "\u00A0\u2007\u202F\u0085\u2003"})
    void rejectsBlankValues(String value) {
        assertThatThrownBy(() -> new DisplayText(value)).isInstanceOf(InvalidDisplayTextException.class);
    }

    @Test
    void rejectsNullButPreservesFormatCharacters() {
        assertThatThrownBy(() -> new DisplayText(null)).isInstanceOf(InvalidDisplayTextException.class);
        assertThat(new DisplayText("\u200BName\uFEFF").value()).isEqualTo("\u200BName\uFEFF");
    }
}
