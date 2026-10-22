package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CardDetails;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.GameplayCard;

/** Printing and selected gameplay metadata remain separate for subsequent deck snapshots. */
public record ResolvedCommander(CardDetails card, GameplayCard gameplay) {
}
