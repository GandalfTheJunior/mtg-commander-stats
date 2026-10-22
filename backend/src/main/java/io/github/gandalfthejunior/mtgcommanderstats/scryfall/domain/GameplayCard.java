package io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain;

import java.util.List;

public record GameplayCard(Integer gameplayFaceIndex, String oracleId, String name,
        List<String> colorIdentity, boolean requiresChosenColor, boolean canBeSoleCommander,
        String typeLine, List<String> keywords, String oracleText, Artwork defaultArtwork, PairingCapabilities pairing) {
    public GameplayCard {
        colorIdentity = List.copyOf(colorIdentity);
        keywords = List.copyOf(keywords);
    }
}
