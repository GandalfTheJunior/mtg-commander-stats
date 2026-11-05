package io.github.gandalfthejunior.mtgcommanderstats;

import java.util.function.Function;
import java.util.stream.Stream;

import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckName;
import io.github.gandalfthejunior.mtgcommanderstats.displaytext.DisplayText;
import io.github.gandalfthejunior.mtgcommanderstats.displaytext.InvalidNameException;
import io.github.gandalfthejunior.mtgcommanderstats.displaytext.InvalidNameException.Reason;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.PlaygroupName;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.Username;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NameRulesTest {
    private record Field(int maximum, Function<String, String> normalize) {
    }

    private static Stream<Field> fields() {
        return Stream.of(new Field(20, value -> new Username(value).value()),
                new Field(30, value -> new DeckName(value).value()),
                new Field(30, value -> new PlaygroupName(value).value()));
    }

    @ParameterizedTest
    @MethodSource("fields")
    void limitsGraphemesAfterNfcAndBoundaryTrimming(Field field) {
        for (int length : new int[] {1, field.maximum() - 1, field.maximum()}) {
            assertThat(field.normalize().apply("\u00A0\t" + "a\u0308".repeat(length) + "\u202F"))
                    .isEqualTo("ä".repeat(length));
            assertThat(field.normalize().apply("q\u0307".repeat(length))).isEqualTo("q\u0307".repeat(length));
            assertThat(field.normalize().apply("𐐀".repeat(length))).isEqualTo("𐐀".repeat(length));
            assertThat(field.normalize().apply("क्ष".repeat(length))).isEqualTo("क्ष".repeat(length));
        }
        assertFailure(field, "a".repeat(field.maximum() + 1), Reason.TOO_LONG);
        assertFailure(field, "a\u0308".repeat(field.maximum() + 1), Reason.TOO_LONG);
        assertFailure(field, "q\u0307".repeat(field.maximum() + 1), Reason.TOO_LONG);
    }

    @ParameterizedTest
    @MethodSource("fields")
    void boundsStackedCombiningMarksAfterNormalization(Field field) {
        String boundary = "q" + "\u0307".repeat(4 * field.maximum() - 1);
        assertThat(field.normalize().apply(boundary)).isEqualTo(boundary);
        assertFailure(field, boundary + "\u0307", Reason.TOO_LONG);
    }

    @ParameterizedTest
    @MethodSource("fields")
    void allowsLettersMarksAsciiDigitsPunctuationCurrencyAndExplicitMath(Field field) {
        for (String value : new String[] {"Ärger Straße 123", "東京 デッキ", "العربية", "किरण",
                "Krark & Sakashima", "<Name> / !?:.'-()", "Café", "a\u034F", "$ € + = 09"}) {
            assertThat(field.normalize().apply(value)).isEqualTo(value);
        }
        assertThat(new DeckName("Atraxa, Praetors' Voice").value()).isEqualTo("Atraxa, Praetors' Voice");
        assertThat(new PlaygroupName("Atraxa, Praetors' Voice").value()).isEqualTo("Atraxa, Praetors' Voice");
    }

    @ParameterizedTest
    @MethodSource("fields")
    void acceptsAllowlistedCategoryBoundaries(Field field) {
        for (String character : new String[] {"A", "a", "ǅ", "ʰ", "界", "𐐀",
                "\u0301", "\u093E", "\u20DD", "0", "9", "_", "-", "–", "—", "(", ")",
                "‘", "’", "“", "”", "'", "\"", "&", "/", "!", "?", ":", ".", ",", "#", "@", "%",
                "$", "€", "£", "¥", "+", "=", "<", ">"}) {
            String value = "q" + character + "q";
            assertThat(field.normalize().apply(value)).as("allowed character %s", character).isEqualTo(value);
        }
    }

    @ParameterizedTest
    @MethodSource("fields")
    void rejectsSymbolsAndNumbersOutsideTheAllowlist(Field field) {
        for (String character : new String[] {"©", "®", "™", "♥", "♠", "★", "✓", "→", "^", "`",
                "|", "~", "×", "÷", "−", "∞", "٠", "١", "०", "１", "²", "½", "Ⅻ", "①"}) {
            assertFailure(field, "q" + character + "q", Reason.INVALID_CHARACTERS);
        }
    }

    @ParameterizedTest
    @MethodSource("fields")
    void rejectsNullAndBlankAfterTrimming(Field field) {
        for (String value : new String[] {null, "", " ", "\t\n", "\u00A0\u2007\u202F\u0085\u001C"}) {
            assertFailure(field, value, Reason.BLANK);
        }
    }

    @ParameterizedTest
    @MethodSource("fields")
    void rejectsForbiddenCharactersWithoutRewritingThem(Field field) {
        int[] forbidden = {0, 1, 0x7F, 0x85, 0x9, 0xA, 0xD, 0x1C, 0xA0, 0x1680, 0x2003,
                0x2007, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0x200B, 0x200C, 0x200D, 0xFEFF,
                0x061C, 0x202A, 0x202E, 0x2066, 0x2069, 0xE000, 0xF0000, 0x0378, 0xD800, 0xDFFF,
                0x1F600, 0x2764, 0x00A9, 0x203C, 0x2049, 0xFE0E, 0xFE0F, 0x1F1E6, 0x1F1FF, 0x1FAE8};
        for (int codePoint : forbidden) {
            assertFailure(field, "a" + new String(Character.toChars(codePoint)) + "b", Reason.INVALID_CHARACTERS);
        }
        assertFailure(field, "two  spaces", Reason.INVALID_CHARACTERS);
        assertFailure(field, "three   spaces", Reason.INVALID_CHARACTERS);
        assertFailure(field, "a".repeat(field.maximum() + 1) + "😀", Reason.INVALID_CHARACTERS);
    }

    @Test
    void genericDisplayTextRemainsLimitFreeAndUnnormalized() {
        String value = "a\u0308".repeat(100) + "  \u200B😀";
        assertThat(new DisplayText(value).value()).isEqualTo(value);
    }

    private void assertFailure(Field field, String value, Reason reason) {
        assertThatThrownBy(() -> field.normalize().apply(value))
                .isInstanceOfSatisfying(InvalidNameException.class, exception -> {
                    assertThat(exception.reason()).isEqualTo(reason);
                    assertThat(exception.maxLength()).isEqualTo(field.maximum());
                });
    }
}
