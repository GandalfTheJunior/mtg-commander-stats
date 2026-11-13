package io.github.gandalfthejunior.mtgcommanderstats.security;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.core.convert.support.GenericConversionService;
import org.springframework.core.serializer.support.DeserializingConverter;
import org.springframework.core.serializer.support.SerializationFailedException;
import org.springframework.core.serializer.support.SerializingConverter;
import org.springframework.session.config.SessionRepositoryCustomizer;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;

/** Customizes the Spring Boot-managed PostgreSQL session repository (#303). */
@Configuration(proxyBeanMethods = false)
class SessionStoreConfiguration {
    private static final Logger LOGGER = LoggerFactory.getLogger(SessionStoreConfiguration.class);

    @Bean
    SessionRepositoryCustomizer<JdbcIndexedSessionRepository> sessionStoreCustomizer() {
        return repository -> {
            repository.setConversionService(attributeConversion(SessionStoreConfiguration.class.getClassLoader()));
            // No find-by-principal feature exists: keep login emails out of the session table.
            repository.setIndexResolver(session -> Map.of());
        };
    }

    /**
     * Spring Session's default Java serialization, except that an unreadable stored attribute
     * (corrupt bytes or an incompatible class version after an upgrade) reads as absent. The
     * lifetime policy then invalidates an authenticated session with missing state, so a client
     * re-authenticates instead of receiving a permanent server error for its cookie.
     */
    static GenericConversionService attributeConversion(ClassLoader classLoader) {
        DeserializingConverter deserializer = new DeserializingConverter(classLoader);
        GenericConversionService conversion = new GenericConversionService();
        conversion.addConverter(Object.class, byte[].class, new SerializingConverter());
        conversion.addConverter(byte[].class, Object.class, (Converter<byte[], Object>) source -> {
            try {
                return deserializer.convert(source);
            } catch (SerializationFailedException exception) {
                // Never log attribute names, bytes or exception messages; they can contain session state.
                LOGGER.warn("Discarding unreadable session attribute; causeType={}",
                        exception.getCause() == null ? exception.getClass().getName()
                                : exception.getCause().getClass().getName());
                return null;
            }
        });
        return conversion;
    }
}
