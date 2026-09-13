package io.github.gandalfthejunior.mtgcommanderstats.user.domain;

import java.util.Locale;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "users")
public class User {
    @Id
    private UUID id;

    @Column(nullable = false, columnDefinition = "text")
    private String username;

    @Column(name = "encoded_password", nullable = false, columnDefinition = "text")
    private String encodedPassword;

    protected User() {
    }

    public User(String username, String encodedPassword) {
        this.id = UUID.randomUUID();
        this.username = canonicalUsername(username);
        if (encodedPassword == null || encodedPassword.isBlank()) {
            throw new IllegalArgumentException("An encoded password is required.");
        }
        this.encodedPassword = encodedPassword;
    }

    public static String canonicalUsername(String username) {
        if (username == null || username.isBlank()) {
            throw new InvalidRegistrationException();
        }
        return username.strip().toLowerCase(Locale.ROOT);
    }

    public static void validatePassword(String password) {
        if (password == null || password.isBlank()
                || password.codePointCount(0, password.length()) < 12) {
            throw new InvalidRegistrationException();
        }
    }

    public UUID getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public String getEncodedPassword() {
        return encodedPassword;
    }
}
