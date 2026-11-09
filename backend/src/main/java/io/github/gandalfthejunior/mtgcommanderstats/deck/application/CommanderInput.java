package io.github.gandalfthejunior.mtgcommanderstats.deck.application;

import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonInclude;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.InvalidCommanderException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import tools.jackson.databind.JsonNode;

public record CommanderInput(CommanderSelectionRef selectionRef, String chosenColor,
        @JsonInclude(JsonInclude.Include.NON_NULL) ArtworkInput artwork) {
    public CommanderInput(CommanderSelectionRef selectionRef, String chosenColor) {
        this(selectionRef, chosenColor, null);
    }

    @JsonCreator(mode = JsonCreator.Mode.DELEGATING)
    public static CommanderInput from(JsonNode value) {
        if (value == null || !value.isObject() || !value.path("selectionRef").isObject()
                || value.size() != (1 + (value.has("chosenColor") ? 1 : 0) + (value.has("artwork") ? 1 : 0))) {
            throw new InvalidCommanderException();
        }
        JsonNode reference = value.path("selectionRef");
        if (!reference.path("scryfallCardId").isString()
                || reference.size() != (reference.has("gameplayFaceIndex") ? 2 : 1)) {
            throw new InvalidCommanderException();
        }
        String supplied = reference.path("scryfallCardId").asString();
        UUID printing;
        try {
            printing = UUID.fromString(supplied);
            if (!printing.toString().equalsIgnoreCase(supplied)) {
                throw new InvalidCommanderException();
            }
        } catch (IllegalArgumentException exception) {
            throw new InvalidCommanderException();
        }
        JsonNode face = reference.get("gameplayFaceIndex");
        if (face != null && !face.isNull()
                && (!face.isIntegralNumber() || !face.canConvertToInt() || face.intValue() < 0)) {
            throw new InvalidCommanderException();
        }
        JsonNode color = value.get("chosenColor");
        if (color != null && !color.isNull() && !color.isString()) {
            throw new InvalidCommanderException();
        }
        return new CommanderInput(new CommanderSelectionRef(printing, face == null || face.isNull() ? null : face.intValue()),
                color == null || color.isNull() ? null : color.asString(),
                value.has("artwork") ? ArtworkInput.from(value.get("artwork")) : null);
    }

    @JsonAnySetter
    public void rejectUnknownField(String field, Object value) {
        throw new InvalidCommanderException();
    }
}
