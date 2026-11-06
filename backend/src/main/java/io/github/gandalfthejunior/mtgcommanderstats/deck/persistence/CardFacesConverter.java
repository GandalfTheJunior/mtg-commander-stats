package io.github.gandalfthejunior.mtgcommanderstats.deck.persistence;

import java.util.List;

import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.CardFaces;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CardFace;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@Converter
public class CardFacesConverter implements AttributeConverter<CardFaces, String> {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final TypeReference<List<CardFace>> FACES = new TypeReference<>() { };

    @Override
    public String convertToDatabaseColumn(CardFaces value) {
        return value == null ? null : JSON.writeValueAsString(value.faces());
    }

    @Override
    public CardFaces convertToEntityAttribute(String value) {
        return value == null ? null : new CardFaces(JSON.readValue(value, FACES));
    }
}
