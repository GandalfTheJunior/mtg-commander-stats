package io.github.gandalfthejunior.mtgcommanderstats.displaytext;

public record DisplayText(String value) {
    public DisplayText {
        if (value == null) {
            throw new InvalidDisplayTextException();
        }
        int start = 0;
        int end = value.length();
        while (start < end && isBoundaryWhitespace(value.codePointAt(start))) {
            start += Character.charCount(value.codePointAt(start));
        }
        while (end > start && isBoundaryWhitespace(value.codePointBefore(end))) {
            end -= Character.charCount(value.codePointBefore(end));
        }
        if (start == end) {
            throw new InvalidDisplayTextException();
        }
        value = value.substring(start, end);
    }

    // Unicode White_Space plus Java's existing whitespace controls (U+001C-U+001F).
    public static boolean isBoundaryWhitespace(int codePoint) {
        return Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint) || codePoint == 0x0085;
    }
}
