package io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain;

import java.util.List;
import java.util.UUID;

public record CommanderChoice(CommanderSelectionRef selectionRef, UUID scryfallCardId,
        boolean canBeSoleCommander, String name, List<String> colorIdentity, boolean requiresChosenColor,
        String thumbnailUrl, PairingCapabilities pairing) {
    public CommanderChoice {
        colorIdentity = List.copyOf(colorIdentity);
    }
}
