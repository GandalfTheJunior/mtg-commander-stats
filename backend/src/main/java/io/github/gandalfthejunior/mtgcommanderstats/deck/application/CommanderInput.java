package io.github.gandalfthejunior.mtgcommanderstats.deck.application;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.InvalidCommanderException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;

public record CommanderInput(CommanderSelectionRef selectionRef, String chosenColor) {
    @JsonAnySetter
    public void rejectUnknownField(String field, Object value) {
        throw new InvalidCommanderException();
    }
}
