package io.github.gandalfthejunior.mtgcommanderstats.user.domain;

import java.util.Set;

public final class ReservedUsernames {
    // The single source of reserved names (#214). Entries must already be in the
    // canonical username form (case-folded NFC) because registration compares them
    // with the database-canonicalized candidate.
    public static final Set<String> CANONICAL = Set.of(
            "admin", "administrator", "moderator", "support", "system",
            "mtg commander stats", "mtg-commander-stats", "mtgcommanderstats");

    private ReservedUsernames() {
    }

    public static boolean isReserved(String canonicalUsername) {
        return CANONICAL.contains(canonicalUsername);
    }
}
