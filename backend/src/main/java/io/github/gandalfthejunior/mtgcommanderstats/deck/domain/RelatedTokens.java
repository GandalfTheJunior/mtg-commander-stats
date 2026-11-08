package io.github.gandalfthejunior.mtgcommanderstats.deck.domain;

import java.util.List;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.RelatedToken;

public record RelatedTokens(List<RelatedToken> tokens) {
    public RelatedTokens {
        tokens = List.copyOf(tokens);
    }
}
