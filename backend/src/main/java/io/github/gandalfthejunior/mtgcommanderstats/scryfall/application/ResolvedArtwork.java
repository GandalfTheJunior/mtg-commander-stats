package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import java.time.Instant;
import java.util.List;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.Artwork;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CardFace;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.RelatedToken;

public record ResolvedArtwork(CommanderSelectionRef selectionRef, Artwork artwork, List<CardFace> cardFaces,
        List<RelatedToken> relatedTokens, Instant tokenRetryNotBefore, int usableArtworkFaces) {
    public ResolvedArtwork(CommanderSelectionRef selectionRef, Artwork artwork, List<CardFace> cardFaces) {
        this(selectionRef, artwork, cardFaces, null, null, -1);
    }

    public ResolvedArtwork {
        relatedTokens = relatedTokens == null ? null : List.copyOf(relatedTokens);
        cardFaces = List.copyOf(cardFaces);
    }
}
