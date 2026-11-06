package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import java.util.List;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.Artwork;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CardFace;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;

public record ResolvedArtwork(CommanderSelectionRef selectionRef, Artwork artwork, List<CardFace> cardFaces) {
    public ResolvedArtwork {
        cardFaces = List.copyOf(cardFaces);
    }
}
