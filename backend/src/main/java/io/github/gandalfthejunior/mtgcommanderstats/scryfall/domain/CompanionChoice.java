package io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain;

import java.util.List;

public record CompanionChoice(CommanderSelectionRef selectionRef, String name,
        List<String> colorIdentity, String thumbnailUrl) {
    public CompanionChoice {
        colorIdentity = List.copyOf(colorIdentity);
    }
}
