package io.github.gandalfthejunior.mtgcommanderstats.user.domain;

import io.github.gandalfthejunior.mtgcommanderstats.displaytext.NameRules;

public record Username(String value) {
    public static final int MAX_LENGTH = 20;

    public Username {
        value = NameRules.normalize(value, MAX_LENGTH);
    }
}
