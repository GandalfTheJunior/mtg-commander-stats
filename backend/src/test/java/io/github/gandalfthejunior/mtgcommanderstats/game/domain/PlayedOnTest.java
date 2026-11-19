package io.github.gandalfthejunior.mtgcommanderstats.game.domain;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PlayedOnTest {
    @ParameterizedTest
    @CsvSource({
        "2026-11-15T22:59:59Z, Europe/Berlin, 2026-11-15",
        "2026-11-15T23:00:00Z, Europe/Berlin, 2026-11-16",
        "2026-11-16T09:59:59Z, Pacific/Kiritimati, 2026-11-16",
        "2026-11-16T10:00:00Z, Pacific/Kiritimati, 2026-11-17",
        "2026-11-16T09:59:59Z, Pacific/Honolulu, 2026-11-15",
        "2026-11-16T10:00:00Z, Pacific/Honolulu, 2026-11-16",
        "2026-03-28T22:59:59Z, Europe/Berlin, 2026-03-28",
        "2026-03-28T23:00:00Z, Europe/Berlin, 2026-03-29",
        "2026-03-29T00:59:59Z, Europe/Berlin, 2026-03-29",
        "2026-03-29T01:00:00Z, Europe/Berlin, 2026-03-29",
        "2026-10-24T21:59:59Z, Europe/Berlin, 2026-10-24",
        "2026-10-24T22:00:00Z, Europe/Berlin, 2026-10-25",
        "2026-10-25T00:59:59Z, Europe/Berlin, 2026-10-25",
        "2026-10-25T01:00:00Z, Europe/Berlin, 2026-10-25"
    })
    void acceptsYesterdayAndTodayButRejectsTomorrowUsingServerInstantInPlayerZone(String instant, String zone, LocalDate today) {
        // Deliberately different server zone: its calendar date must not govern player writes.
        Clock clock = Clock.fixed(Instant.parse(instant), ZoneId.of("America/Los_Angeles"));
        assertThatCode(() -> PlayedOn.validate(today.minusDays(1), zone, clock)).doesNotThrowAnyException();
        assertThatCode(() -> PlayedOn.validate(today, zone, clock)).doesNotThrowAnyException();
        assertThatThrownBy(() -> PlayedOn.validate(today.plusDays(1), zone, clock))
                .isInstanceOfSatisfying(InvalidPlayedOnException.class,
                        error -> org.assertj.core.api.Assertions.assertThat(error.code()).isEqualTo("PLAYED_ON_FUTURE"));
    }
}
