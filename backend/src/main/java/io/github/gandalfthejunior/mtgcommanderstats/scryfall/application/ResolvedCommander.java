package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import java.time.Instant;
import java.util.List;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CardDetails;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.GameplayCard;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.RelatedToken;

/** Printing and selected gameplay metadata remain separate for subsequent deck snapshots. */
public record ResolvedCommander(CardDetails card, GameplayCard gameplay,
        List<RelatedToken> relatedTokens, Instant tokenRetryNotBefore) {
    public ResolvedCommander {
        relatedTokens = relatedTokens == null ? null : List.copyOf(relatedTokens);
    }

    public ResolvedCommander(CardDetails card, GameplayCard gameplay) {
        this(card, gameplay, null, null);
    }
}
