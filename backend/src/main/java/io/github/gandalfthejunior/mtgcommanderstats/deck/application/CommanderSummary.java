package io.github.gandalfthejunior.mtgcommanderstats.deck.application;

import java.util.List;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckCommander;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.PairingCapabilities;

public record CommanderSummary(int position, UUID oracleId, String name, CommanderSelectionRef selectionRef,
        boolean canBeSoleCommander, boolean requiresChosenColor, List<String> colorIdentity,
        String chosenColor, List<String> effectiveColorIdentity, UUID scryfallCardId, Integer artworkFaceIndex,
        String artCropUrl, String illustrationId, String artist, String scryfallUri, PairingCapabilities pairing) {
    public static CommanderSummary from(DeckCommander commander) {
        return new CommanderSummary(commander.getPosition(), commander.getOracleId(), commander.getName(),
                commander.selectionRef(), commander.getCanBeSoleCommander(), commander.getRequiresChosenColor(),
                commander.getBaseColorIdentity().symbols(), commander.getChosenColor(),
                commander.effectiveColorIdentity().symbols(), commander.getScryfallCardId(),
                commander.getArtworkFaceIndex(), commander.getArtCropUrl(), commander.getIllustrationId(),
                commander.getArtist(), commander.getScryfallUri(), commander.getPairing());
    }
}
