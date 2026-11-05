package io.github.gandalfthejunior.mtgcommanderstats.group.domain;

import io.github.gandalfthejunior.mtgcommanderstats.displaytext.NameRules;

public record PlaygroupName(String value) {
    public static final int MAX_LENGTH = 30;

    public PlaygroupName {
        value = NameRules.normalize(value, MAX_LENGTH);
    }
}
