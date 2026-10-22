package io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.LongSupplier;

import static io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClientException.Kind.UNAVAILABLE;

/** One gate for the singleton client: below seven upstream request starts per second. */
final class ScryfallRequestGate {
    static final Duration REQUEST_SPACING = Duration.ofMillis(150);
    private static final Duration MAX_CONTENTION_WAIT = Duration.ofSeconds(1);
    private static final Duration DEFAULT_COOLDOWN = Duration.ofSeconds(1);

    private final ReentrantLock lock = new ReentrantLock();
    private final Clock clock;
    private final LongSupplier nanoTime;
    private final Sleeper sleeper;
    private long lastStart;
    private boolean started;
    private volatile Instant cooldownUntil = Instant.MIN;

    ScryfallRequestGate() {
        this(Clock.systemUTC(), System::nanoTime, duration -> TimeUnit.NANOSECONDS.sleep(duration.toNanos()));
    }

    ScryfallRequestGate(Clock clock, LongSupplier nanoTime, Sleeper sleeper) {
        this.clock = clock;
        this.nanoTime = nanoTime;
        this.sleeper = sleeper;
    }

    void awaitRequest() throws InterruptedException {
        if (!lock.tryLock(MAX_CONTENTION_WAIT.toMillis(), TimeUnit.MILLISECONDS)) {
            throw new ScryfallClientException(UNAVAILABLE);
        }
        try {
            checkCooldown();
            long now = nanoTime.getAsLong();
            long remaining = REQUEST_SPACING.toNanos() - (now - lastStart);
            if (started && remaining > 0) {
                sleeper.sleep(Duration.ofNanos(remaining));
            }
            checkCooldown();
            lastStart = nanoTime.getAsLong();
            started = true;
        } finally {
            lock.unlock();
        }
    }

    synchronized void rateLimited(String retryAfter) {
        Instant now = clock.instant();
        Instant retryAt = now.plus(DEFAULT_COOLDOWN);
        if (retryAfter != null) {
            try {
                long seconds = Long.parseLong(retryAfter.trim());
                retryAt = seconds > 0 ? now.plusSeconds(seconds) : retryAt;
            } catch (NumberFormatException exception) {
                if (retryAfter.trim().matches("[0-9]+")) {
                    // A positive numeric delay larger than long must not become a short cooldown.
                    retryAt = Instant.MAX;
                } else {
                    try {
                        retryAt = ZonedDateTime.parse(retryAfter, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant();
                    } catch (DateTimeParseException ignored) {
                        // Missing or invalid guidance still gets a conservative cooldown, never a retry.
                    }
                }
            } catch (RuntimeException exception) {
                retryAt = Instant.MAX;
            }
        }
        Instant minimum = now.plus(DEFAULT_COOLDOWN);
        if (retryAt.isBefore(minimum)) {
            retryAt = minimum;
        }
        if (retryAt.isAfter(cooldownUntil)) {
            cooldownUntil = retryAt;
        }
    }

    private void checkCooldown() {
        if (clock.instant().isBefore(cooldownUntil)) {
            throw new ScryfallClientException(UNAVAILABLE);
        }
    }

    @FunctionalInterface
    interface Sleeper {
        void sleep(Duration duration) throws InterruptedException;
    }
}
