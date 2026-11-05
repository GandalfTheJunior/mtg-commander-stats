package io.github.gandalfthejunior.mtgcommanderstats.deck.application;

import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.InvalidCompanionSelectionException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import tools.jackson.databind.JsonNode;

public record CompanionInput(CommanderSelectionRef selectionRef) {
    /** Prevent Jackson coercion of strings/fractions into gameplay face indices. */
    @JsonCreator(mode = JsonCreator.Mode.PROPERTIES)
    public static CompanionInput from(@JsonProperty("selectionRef") JsonNode reference) {
        if (reference == null || !reference.isObject() || !reference.path("scryfallCardId").isString()
                || reference.size() != (reference.has("gameplayFaceIndex") ? 2 : 1)) {
            throw invalidReference();
        }
        String suppliedId = reference.path("scryfallCardId").asString();
        UUID printing;
        try {
            printing = UUID.fromString(suppliedId);
            if (!printing.toString().equalsIgnoreCase(suppliedId)) {
                throw invalidReference();
            }
        } catch (IllegalArgumentException exception) {
            throw invalidReference();
        }
        JsonNode face = reference.get("gameplayFaceIndex");
        Integer index = null;
        if (face != null && !face.isNull()) {
            if (!face.isIntegralNumber() || !face.canConvertToInt() || face.intValue() < 0) {
                throw invalidReference();
            }
            index = face.intValue();
        }
        return new CompanionInput(new CommanderSelectionRef(printing, index));
    }

    private static InvalidCompanionSelectionException invalidReference() {
        return new InvalidCompanionSelectionException("Provide a Companion printing UUID and, only when required, a non-negative integer gameplayFaceIndex.");
    }

    @JsonAnySetter
    public void rejectUnknownField(String field, Object value) {
        throw new InvalidCompanionSelectionException("Supply only a Companion selectionRef; card metadata is resolved by the server.");
    }
}
