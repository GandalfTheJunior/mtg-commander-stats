package io.github.gandalfthejunior.mtgcommanderstats.deck.domain;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ManaBoxUrlTest {
    @ParameterizedTest
    @ValueSource(strings = {"a", "Z9", "Mixed-CASE_123", "_", "-", "aVeryLongOpaqueShareIdWithoutAFixedLength1234567890"})
    void acceptsOpaqueIdsAndNormalizesOnlyTheUrlEnvelope(String id) {
        String expected = "https://manabox.app/decks/" + id;
        assertThat(new ManaBoxUrl(expected).value()).isEqualTo(expected);
        assertThat(new ManaBoxUrl(expected + "/").value()).isEqualTo(expected);
        assertThat(new ManaBoxUrl("HTTPS://MANABOX.APP:443/decks/" + id + "/").value()).isEqualTo(expected);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", " ", " https://manabox.app/decks/a", "https://manabox.app/decks/a ",
            "http://manabox.app/decks/a", "ftp://manabox.app/decks/a", "javascript:alert(1)",
            "//manabox.app/decks/a", "https:manabox.app/decks/a", "https:///manabox.app/decks/a",
            "https://www.manabox.app/decks/a", "https://share.manabox.app/decks/a", "https://manabox.app.evil.example/decks/a",
            "https://evil.example/manabox.app/decks/a", "https://manabox.app./decks/a", "https://manabоx.app/decks/a",
            "https://user@manabox.app/decks/a", "https://manabox.app@evil.example/decks/a", "https://@manabox.app/decks/a",
            "https://manabox.app:80/decks/a", "https://manabox.app:444/decks/a", "https://manabox.app:/decks/a",
            "https://manabox.app:0443/decks/a", "https://manabox.app/decks/a?", "https://manabox.app/decks/a?x=1",
            "https://manabox.app/decks/a#", "https://manabox.app/decks/a#fragment",
            "https://manabox.app", "https://manabox.app/decks", "https://manabox.app/decks/", "https://manabox.app/deck/a",
            "https://manabox.app/DECKS/a", "https://manabox.app//decks/a", "https://manabox.app/decks/a/b",
            "https://manabox.app/decks/a//", "https://manabox.app/decks/.", "https://manabox.app/decks/..",
            "https://manabox.app/decks/../a", "https://manabox.app/decks/a/../b", "https://manabox.app/decks/a.b",
            "https://manabox.app/decks/a;b", "https://manabox.app/decks/a+b", "https://manabox.app/decks/ä",
            "https://manabox.app/decks/%61", "https://manabox.app/decks/a%2fb", "https://manabox.app/decks/a%2Fb",
            "https://manabox.app/decks/%2e%2e", "https://manabox.app/decks/%252f", "https://manabox.app/decks/a%5Cb",
            "https://manabox.app/decks/%", "https://manabox.app/decks/%ZZ", "https://manabox.app/decks/a%00",
            "https://manabox%2eapp/decks/a", "https://manabox.app\\evil.example/decks/a", "https://manabox.app/decks/a\\b",
            "https://manabox.app/decks/a\n", "https://manabox.app/decks/a\t"})
    void rejectsUnverifiedHostsAndUnsafeOrAmbiguousUrls(String value) {
        assertThatThrownBy(() -> new ManaBoxUrl(value)).isInstanceOf(InvalidManaBoxUrlException.class);
    }

    @Test
    void neverFoldsTheCaseSensitiveShareId() {
        assertThat(new ManaBoxUrl("https://manabox.app/decks/Aa").value())
                .isNotEqualTo(new ManaBoxUrl("https://manabox.app/decks/aa").value());
    }
}
