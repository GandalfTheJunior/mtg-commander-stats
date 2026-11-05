package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CardDetails;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.GameplayCard;

public record ResolvedCompanion(CardDetails card, GameplayCard gameplay) {
}
