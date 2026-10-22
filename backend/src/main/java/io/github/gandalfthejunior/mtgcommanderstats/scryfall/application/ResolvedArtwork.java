package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.Artwork;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;

public record ResolvedArtwork(CommanderSelectionRef selectionRef, Artwork artwork) {
}
