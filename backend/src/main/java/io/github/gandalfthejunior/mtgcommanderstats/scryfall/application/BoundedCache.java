package io.github.gandalfthejunior.mtgcommanderstats.scryfall.application;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.LongSupplier;

/** Small access-ordered cache; failures are never stored and reads do not extend expiry. */
final class BoundedCache<K, V> {
    private final int capacity;
    private final long ttlNanos;
    private final LongSupplier clock;
    private final Map<K, Entry<V>> entries = new LinkedHashMap<>(16, 0.75f, true);

    BoundedCache(int capacity, Duration ttl, LongSupplier clock) {
        this.capacity = capacity;
        this.ttlNanos = ttl.toNanos();
        this.clock = clock;
    }

    synchronized V get(K key) {
        Entry<V> entry = entries.get(key);
        if (entry == null) {
            return null;
        }
        if (clock.getAsLong() - entry.createdAt() >= ttlNanos) {
            entries.remove(key);
            return null;
        }
        return entry.value();
    }

    synchronized void put(K key, V value) {
        entries.put(key, new Entry<>(value, clock.getAsLong()));
        while (entries.size() > capacity) {
            entries.remove(entries.keySet().iterator().next());
        }
    }

    private record Entry<V>(V value, long createdAt) {
    }
}
