package io.github.gandalfthejunior.mtgcommanderstats.deck.application;

import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonInclude;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.InvalidCompanionSelectionException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import tools.jackson.databind.JsonNode;

public record CompanionInput(CommanderSelectionRef selectionRef,
        @JsonInclude(JsonInclude.Include.NON_NULL) ArtworkInput artwork) {
    public CompanionInput(CommanderSelectionRef selectionRef) {
        this(selectionRef, null);
    }

    /** Prevent Jackson coercion of strings/fractions into gameplay face indices. */
    @JsonCreator(mode = JsonCreator.Mode.DELEGATING)
    public static CompanionInput from(JsonNode value) {
        if (value == null || !value.isObject() || !value.path("selectionRef").isObject()
                || value.size() != (value.has("artwork") ? 2 : 1)) {
            throw invalidReference();
        }
        JsonNode reference = value.path("selectionRef");
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
        return new CompanionInput(new CommanderSelectionRef(printing, index),
                value.has("artwork") ? ArtworkInput.from(value.get("artwork")) : null);
    }

    private static InvalidCompanionSelectionException invalidReference() {
        return new InvalidCompanionSelectionException("Provide a Companion printing UUID and, only when required, a non-negative integer gameplayFaceIndex.");
    }

    @JsonAnySetter
    public void rejectUnknownField(String field, Object value) {
        throw new InvalidCompanionSelectionException("Supply only a Companion selectionRef and optional artwork; card metadata is resolved by the server.");
    }
}
