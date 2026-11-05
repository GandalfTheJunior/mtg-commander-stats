package io.github.gandalfthejunior.mtgcommanderstats.displaytext;

import java.text.Normalizer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import io.github.gandalfthejunior.mtgcommanderstats.displaytext.InvalidNameException.Reason;

public final class NameRules {
    private static final Pattern GRAPHEME = Pattern.compile("\\X");

    private NameRules() {
    }

    public static String normalize(String value, int maxLength) {
        try {
            value = new DisplayText(value == null ? null : Normalizer.normalize(value, Normalizer.Form.NFC)).value();
        } catch (InvalidDisplayTextException exception) {
            throw new InvalidNameException(Reason.BLANK, maxLength);
        }
        if (value.contains("  ") || value.codePoints().anyMatch(NameRules::forbidden)) {
            throw new InvalidNameException(Reason.INVALID_CHARACTERS, maxLength);
        }
        if (value.codePointCount(0, value.length()) > 4 * maxLength) {
            throw new InvalidNameException(Reason.TOO_LONG, maxLength);
        }
        Matcher graphemes = GRAPHEME.matcher(value);
        int count = 0;
        while (graphemes.find()) {
            if (++count > maxLength) {
                throw new InvalidNameException(Reason.TOO_LONG, maxLength);
            }
        }
        return value;
    }

    private static boolean forbidden(int codePoint) {
        if ((codePoint != ' ' && DisplayText.isBoundaryWhitespace(codePoint))
                || Character.isExtendedPictographic(codePoint)
                || codePoint == 0xFE0E || codePoint == 0xFE0F
                || (codePoint >= 0x1F1E6 && codePoint <= 0x1F1FF)) {
            return true;
        }
        if (codePoint == ' ' || (codePoint >= '0' && codePoint <= '9')
                || codePoint == '+' || codePoint == '=' || codePoint == '<' || codePoint == '>') {
            return false;
        }
        return switch (Character.getType(codePoint)) {
            case Character.UPPERCASE_LETTER, Character.LOWERCASE_LETTER, Character.TITLECASE_LETTER,
                    Character.MODIFIER_LETTER, Character.OTHER_LETTER,
                    Character.NON_SPACING_MARK, Character.COMBINING_SPACING_MARK, Character.ENCLOSING_MARK,
                    Character.CONNECTOR_PUNCTUATION, Character.DASH_PUNCTUATION, Character.START_PUNCTUATION,
                    Character.END_PUNCTUATION, Character.INITIAL_QUOTE_PUNCTUATION,
                    Character.FINAL_QUOTE_PUNCTUATION, Character.OTHER_PUNCTUATION,
                    Character.CURRENCY_SYMBOL -> false;
            default -> true;
        };
    }
}
