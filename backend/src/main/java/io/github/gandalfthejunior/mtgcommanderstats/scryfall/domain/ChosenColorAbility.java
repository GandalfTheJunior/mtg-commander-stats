package io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain;

import java.util.regex.Pattern;

/** Recognizes the specific pregame Commander color-choice ability in English Oracle text. */
public final class ChosenColorAbility {
    private static final Pattern WHITESPACE = Pattern.compile("\\s+", Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern ABILITY = Pattern.compile(
            "\\bif (.+?) is your commander, choose a color before the game begins\\. "
                    + "(?:\\1|it|he|she|they) is the chosen color\\.",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    private ChosenColorAbility() {
    }

    public static boolean requiresChosenColor(String oracleText) {
        if (oracleText == null || oracleText.isBlank()) {
            return false;
        }
        String normalized = WHITESPACE.matcher(oracleText).replaceAll(" ");
        return ABILITY.matcher(normalized).find();
    }
}
