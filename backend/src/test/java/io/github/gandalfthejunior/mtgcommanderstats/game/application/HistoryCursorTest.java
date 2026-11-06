package io.github.gandalfthejunior.mtgcommanderstats.game.application;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HistoryCursorTest {
    @Test
    void roundTripsKnownAndUnknownDatesWithMicrosecondPrecision() {
        UUID group = UUID.randomUUID();
        for (HistoryCursor cursor : List.of(
                new HistoryCursor(group, LocalDate.of(2026, 10, 31), Instant.parse("2026-11-01T12:00:00.123456Z"), UUID.randomUUID()),
                new HistoryCursor(group, null, Instant.parse("2026-11-01T12:00:00Z"), UUID.randomUUID()))) {
            assertThat(cursor.encode()).matches("[A-Za-z0-9_-]+");
            assertThat(HistoryCursor.decode(cursor.encode(), group)).isEqualTo(cursor);
        }
        assertThat(HistoryCursor.decode(null, group)).isNull();
    }

    @Test
    void rejectsNoncanonicalCorruptedOrOutOfDatabaseRangePositions() {
        UUID group = UUID.randomUUID();
        String prefix = "1|" + group + "|";
        String suffix = "|" + UUID.randomUUID();
        for (String value : List.of(
                "2|" + group + "||2026-01-01T00:00:00Z" + suffix,
                prefix + "2026-02-30|2026-01-01T00:00:00Z" + suffix,
                prefix + "|not-an-instant" + suffix,
                prefix + "|+1000000000-12-31T23:59:59.999999999Z" + suffix,
                prefix + "|2026-01-01T00:00:00.000000001Z" + suffix,
                prefix + "|2026-01-01T00:00:00.000000Z" + suffix,
                prefix + "|2026-01-01T00:00:00Z|1-1-1-1-1",
                prefix + "|2026-01-01T00:00:00Z" + suffix + "|extra")) {
            String token = Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.US_ASCII));
            assertThatThrownBy(() -> HistoryCursor.decode(token, group)).isInstanceOf(InvalidHistoryCursorException.class);
        }
    }
}
