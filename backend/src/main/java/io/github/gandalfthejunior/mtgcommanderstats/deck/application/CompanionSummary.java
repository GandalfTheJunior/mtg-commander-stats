package io.github.gandalfthejunior.mtgcommanderstats.deck.application;

import java.util.List;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckCompanion;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;

public record CompanionSummary(UUID oracleId, String name, CommanderSelectionRef selectionRef,
        UUID scryfallCardId, List<String> colorIdentity, Integer artworkFaceIndex,
        String artCropUrl, String illustrationId, String artist, String scryfallUri) {
    public static CompanionSummary from(DeckCompanion companion) {
        return companion == null ? null : new CompanionSummary(companion.getOracleId(), companion.getName(),
                companion.selectionRef(), companion.getScryfallCardId(), companion.getBaseColorIdentity().symbols(),
                companion.getArtworkFaceIndex(), companion.getArtCropUrl(), companion.getIllustrationId(),
                companion.getArtist(), companion.getScryfallUri());
    }
}
