package io.github.gandalfthejunior.mtgcommanderstats.deck.domain;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;

public final class ColorIdentity {
    private final String canonicalValue;

    private ColorIdentity(String canonicalValue) {
        this.canonicalValue = canonicalValue;
    }

    public static ColorIdentity fromSymbols(List<String> symbols) {
        if (symbols == null) {
            throw new InvalidColorIdentityException();
        }
        EnumSet<MagicColor> colors = EnumSet.noneOf(MagicColor.class);
        for (String symbol : symbols) {
            MagicColor color;
            try {
                color = MagicColor.valueOf(symbol);
            } catch (IllegalArgumentException | NullPointerException exception) {
                throw new InvalidColorIdentityException();
            }
            if (!colors.add(color)) {
                throw new InvalidColorIdentityException();
            }
        }
        String canonical = Arrays.stream(MagicColor.values())
                .filter(colors::contains)
                .map(MagicColor::name)
                .reduce("", String::concat);
        return new ColorIdentity(canonical);
    }

    public static ColorIdentity fromCanonicalValue(String value) {
        if (value == null) {
            throw new InvalidColorIdentityException();
        }
        List<String> symbols = value.codePoints()
                .mapToObj(codePoint -> Character.toString(codePoint))
                .toList();
        ColorIdentity identity = fromSymbols(symbols);
        if (!identity.canonicalValue.equals(value)) {
            throw new InvalidColorIdentityException();
        }
        return identity;
    }

    public List<String> symbols() {
        return canonicalValue.codePoints()
                .mapToObj(codePoint -> Character.toString(codePoint))
                .toList();
    }

    public String canonicalValue() {
        return canonicalValue;
    }
}
