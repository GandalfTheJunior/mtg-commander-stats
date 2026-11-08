package io.github.gandalfthejunior.mtgcommanderstats.deck.persistence;

import java.util.List;

import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.RelatedTokens;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.RelatedToken;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@Converter
public class RelatedTokensConverter implements AttributeConverter<RelatedTokens, String> {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final TypeReference<List<RelatedToken>> TOKENS = new TypeReference<>() { };

    @Override
    public String convertToDatabaseColumn(RelatedTokens value) {
        return value == null ? null : JSON.writeValueAsString(value.tokens());
    }

    @Override
    public RelatedTokens convertToEntityAttribute(String value) {
        return value == null ? null : new RelatedTokens(JSON.readValue(value, TOKENS));
    }
}
