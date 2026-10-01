package io.github.gandalfthejunior.mtgcommanderstats.deck.persistence;

import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.ColorIdentity;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class ColorIdentityConverter implements AttributeConverter<ColorIdentity, String> {
    @Override
    public String convertToDatabaseColumn(ColorIdentity attribute) {
        return attribute == null ? null : attribute.canonicalValue();
    }

    @Override
    public ColorIdentity convertToEntityAttribute(String databaseValue) {
        return databaseValue == null ? null : ColorIdentity.fromCanonicalValue(databaseValue);
    }
}
