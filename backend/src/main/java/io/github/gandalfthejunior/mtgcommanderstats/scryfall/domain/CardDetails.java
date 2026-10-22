package io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain;

import java.util.List;
import java.util.UUID;

public record CardDetails(UUID scryfallCardId, String name, String oracleId, String layout,
        String commanderLegality, List<String> colorIdentity, boolean requiresChosenColor,
        String typeLine, List<String> keywords, String oracleText, String thumbnailUrl,
        String artCropUrl, String illustrationId, String artist, String scryfallUri,
        Artwork defaultArtwork, List<CommanderChoice> commanderSelections, List<GameplayCard> gameplayCards) {
    public CardDetails {
        colorIdentity = List.copyOf(colorIdentity);
        keywords = List.copyOf(keywords);
        commanderSelections = List.copyOf(commanderSelections);
        gameplayCards = List.copyOf(gameplayCards);
    }
}
