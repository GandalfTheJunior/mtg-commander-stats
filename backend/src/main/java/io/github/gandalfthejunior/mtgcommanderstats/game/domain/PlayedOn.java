package io.github.gandalfthejunior.mtgcommanderstats.game.domain;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

/** Validates explicit date writes without converting the calendar date into an instant. */
public final class PlayedOn {
    private PlayedOn() {
    }

    public static void validate(LocalDate date, String timeZone, Clock clock) {
        if (timeZone == null && date == null) {
            return;
        }
        // ZoneId.of alone also accepts fixed offsets and synthetic GMT/UTC offsets.
        if (timeZone == null || !ZoneId.getAvailableZoneIds().contains(timeZone)) {
            throw new InvalidPlayedOnException("PLAYED_ON_TIME_ZONE_INVALID");
        }
        if (date != null && date.isAfter(LocalDate.now(clock.withZone(ZoneId.of(timeZone))))) {
            throw new InvalidPlayedOnException("PLAYED_ON_FUTURE");
        }
    }
}
