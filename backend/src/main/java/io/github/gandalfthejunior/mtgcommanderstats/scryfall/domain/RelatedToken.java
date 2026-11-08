package io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain;

import java.util.List;
import java.util.UUID;

/** Exact Scryfall-linked printing; reverse faces are physical presentation, not production claims. */
public record RelatedToken(UUID scryfallCardId, String name, String typeLine, String imageUrl,
        String layout, List<CardFace> cardFaces) {
    public RelatedToken {
        cardFaces = List.copyOf(cardFaces);
    }
}
