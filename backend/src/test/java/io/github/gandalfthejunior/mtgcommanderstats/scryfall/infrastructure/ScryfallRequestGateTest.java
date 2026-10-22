package io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ScryfallRequestGateTest {
    private static final Instant NOW = Instant.parse("2026-10-22T00:00:00Z");

    @Test
    void spacesRequestStartsWithoutRealTimeSleeps() throws Exception {
        AtomicLong nanos = new AtomicLong();
        ScryfallRequestGate gate = new ScryfallRequestGate(Clock.fixed(NOW, ZoneOffset.UTC), nanos::get,
                duration -> nanos.addAndGet(duration.toNanos()));
        gate.awaitRequest();
        assertThat(nanos.get()).isZero();
        gate.awaitRequest();
        gate.awaitRequest();
        assertThat(nanos.get()).isEqualTo(Duration.ofMillis(300).toNanos());
    }

    @ParameterizedTest
    @ValueSource(strings = {"30", "Thu, 22 Oct 2026 00:01:00 GMT", "nonsense", "0", "-10",
            "999999999999999999999999999999999999"})
    void enforcesCooldownForSecondsHttpDatesAndMissingOrMalformedGuidance(String retryAfter) {
        ScryfallRequestGate gate = new ScryfallRequestGate(Clock.fixed(NOW, ZoneOffset.UTC), () -> 0,
                duration -> { });
        gate.rateLimited(retryAfter);
        assertThatThrownBy(gate::awaitRequest).isInstanceOf(ScryfallClientException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"9223372036854775807", "999999999999999999999999999999999999"})
    void overflowingNumericRetryAfterDoesNotBecomeAShortCooldown(String retryAfter) {
        MutableClock clock = new MutableClock();
        ScryfallRequestGate gate = new ScryfallRequestGate(clock, () -> 0, duration -> { });
        gate.rateLimited(retryAfter);
        clock.current = NOW.plusSeconds(2);
        assertThatThrownBy(gate::awaitRequest).isInstanceOf(ScryfallClientException.class);
    }

    private static final class MutableClock extends Clock {
        private Instant current = NOW;

        @Override
        public Instant instant() {
            return current;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return Clock.fixed(current, zone);
        }
    }
}
