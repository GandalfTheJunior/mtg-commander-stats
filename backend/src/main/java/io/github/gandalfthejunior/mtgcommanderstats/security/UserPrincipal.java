package io.github.gandalfthejunior.mtgcommanderstats.security;

import java.util.List;
import java.util.UUID;

// Spring's User erases the encoded password after authentication. This is a
// security adapter for the existing User identity, not another domain identity.
public final class UserPrincipal extends org.springframework.security.core.userdetails.User {
    private final UUID id;

    public UserPrincipal(UUID id, String username, String encodedPassword) {
        super(username, encodedPassword, List.of());
        this.id = id;
    }

    public UUID getId() {
        return id;
    }
}
