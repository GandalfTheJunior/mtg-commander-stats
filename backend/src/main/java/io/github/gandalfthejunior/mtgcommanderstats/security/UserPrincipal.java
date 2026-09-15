package io.github.gandalfthejunior.mtgcommanderstats.security;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.userdetails.User;

// Spring's User erases the encoded password after authentication. This is a
// security adapter for the existing User identity, not another domain identity.
public final class UserPrincipal extends User {
    private final UUID id;
    private final String displayUsername;

    public UserPrincipal(UUID id, String email, String displayUsername, String encodedPassword) {
        super(email, encodedPassword, List.of());
        this.id = id;
        this.displayUsername = displayUsername;
    }

    public UUID getId() {
        return id;
    }

    public String getDisplayUsername() {
        return displayUsername;
    }
}
