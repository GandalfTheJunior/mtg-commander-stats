package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BoundedCacheTest {
    @Test
    void boundsEntriesByLeastRecentlyUsedAndExpiresWithoutSlidingReads() {
        AtomicLong time = new AtomicLong();
        BoundedCache<String, String> cache = new BoundedCache<>(2, Duration.ofNanos(10), time::get);
        cache.put("first", "one");
        cache.put("second", "two");
        time.set(5);
        assertThat(cache.get("first")).isEqualTo("one");
        cache.put("third", "three");
        assertThat(cache.get("second")).isNull();
        assertThat(cache.get("third")).isEqualTo("three");
        time.set(10);
        assertThat(cache.get("first")).isNull();
        assertThat(cache.get("third")).isEqualTo("three");
        time.set(15);
        assertThat(cache.get("third")).isNull();
    }
}
