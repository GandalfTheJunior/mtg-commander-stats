package io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain;

import java.util.UUID;

public record Artwork(UUID scryfallCardId, Integer artworkFaceIndex, String artCropUrl,
        String illustrationId, String artist, String scryfallUri) {
}
