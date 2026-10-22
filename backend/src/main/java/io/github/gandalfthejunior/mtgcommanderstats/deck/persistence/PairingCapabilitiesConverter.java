package io.github.gandalfthejunior.mtgcommanderstats.deck.persistence;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.PairingCapabilities;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import tools.jackson.databind.json.JsonMapper;

@Converter
public class PairingCapabilitiesConverter implements AttributeConverter<PairingCapabilities, String> {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Override
    public String convertToDatabaseColumn(PairingCapabilities value) {
        return JSON.writeValueAsString(value == null ? PairingCapabilities.NONE : value);
    }

    @Override
    public PairingCapabilities convertToEntityAttribute(String value) {
        return value == null ? PairingCapabilities.NONE : JSON.readValue(value, PairingCapabilities.class);
    }
}
