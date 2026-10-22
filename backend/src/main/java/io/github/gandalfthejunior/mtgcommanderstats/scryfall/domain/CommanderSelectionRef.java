package io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain;

import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonInclude;

public record CommanderSelectionRef(UUID scryfallCardId,
        @JsonInclude(JsonInclude.Include.NON_NULL) Integer gameplayFaceIndex) {
    @JsonAnySetter
    public void rejectUnknownField(String field, Object value) {
        throw new InvalidScryfallSelectionException();
    }
}
