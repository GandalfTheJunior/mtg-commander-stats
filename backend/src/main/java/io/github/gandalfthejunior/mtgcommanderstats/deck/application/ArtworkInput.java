package io.github.gandalfthejunior.mtgcommanderstats.deck.application;

import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonInclude;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.InvalidCommanderException;
import tools.jackson.databind.JsonNode;

public record ArtworkInput(UUID scryfallCardId, @JsonInclude(JsonInclude.Include.NON_NULL) Integer artworkFaceIndex) {
    @JsonCreator(mode = JsonCreator.Mode.DELEGATING)
    public static ArtworkInput from(JsonNode value) {
        if (value == null || !value.isObject() || !value.path("scryfallCardId").isString()
                || value.size() != (value.has("artworkFaceIndex") ? 2 : 1)) {
            throw new InvalidCommanderException();
        }
        String supplied = value.path("scryfallCardId").asString();
        UUID printing;
        try {
            printing = UUID.fromString(supplied);
            if (!printing.toString().equalsIgnoreCase(supplied)) {
                throw new InvalidCommanderException();
            }
        } catch (IllegalArgumentException exception) {
            throw new InvalidCommanderException();
        }
        JsonNode face = value.get("artworkFaceIndex");
        if (face != null && (!face.isIntegralNumber() || !face.canConvertToInt() || face.intValue() < 0)) {
            throw new InvalidCommanderException();
        }
        return new ArtworkInput(printing, face == null ? null : face.intValue());
    }
}
