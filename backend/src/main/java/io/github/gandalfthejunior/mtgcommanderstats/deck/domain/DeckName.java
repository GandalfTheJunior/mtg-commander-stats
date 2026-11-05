package io.github.gandalfthejunior.mtgcommanderstats.deck.domain;

import io.github.gandalfthejunior.mtgcommanderstats.displaytext.NameRules;

public record DeckName(String value) {
    public static final int MAX_LENGTH = 30;

    public DeckName {
        value = NameRules.normalize(value, MAX_LENGTH);
    }
}
