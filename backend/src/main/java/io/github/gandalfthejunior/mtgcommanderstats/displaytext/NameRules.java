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
        return switch (Character.getType(codePoint)) {
            case Character.CONTROL, Character.FORMAT, Character.PRIVATE_USE, Character.UNASSIGNED,
                    Character.SURROGATE, Character.LINE_SEPARATOR, Character.PARAGRAPH_SEPARATOR -> true;
            default -> false;
        };
    }
}
