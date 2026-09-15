package io.github.gandalfthejunior.mtgcommanderstats.user.domain;

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
    private String email;

    @Column(nullable = false, columnDefinition = "text")
    private String username;

    @Column(name = "encoded_password", nullable = false, columnDefinition = "text")
    private String encodedPassword;

    protected User() {
    }

    public User(String email, String username, String encodedPassword) {
        this.id = UUID.randomUUID();
        if (email == null || email.isBlank()) {
            throw new InvalidRegistrationException();
        }
        this.email = email;
        this.username = trimUsername(username);
        if (encodedPassword == null || encodedPassword.isBlank()) {
            throw new IllegalArgumentException("An encoded password is required.");
        }
        this.encodedPassword = encodedPassword;
    }

    public static String trimUsername(String username) {
        if (username == null) {
            throw new InvalidRegistrationException();
        }
        int start = 0;
        int end = username.length();
        while (start < end && isRegistrationWhitespace(username.codePointAt(start))) {
            start += Character.charCount(username.codePointAt(start));
        }
        while (end > start && isRegistrationWhitespace(username.codePointBefore(end))) {
            end -= Character.charCount(username.codePointBefore(end));
        }
        if (start == end) {
            throw new InvalidRegistrationException();
        }
        return username.substring(start, end);
    }

    public static void validatePassword(String password) {
        if (password == null || password.codePoints().allMatch(User::isRegistrationWhitespace)
                || password.codePointCount(0, password.length()) < 12) {
            throw new InvalidRegistrationException();
        }
    }

    // Unicode White_Space plus Java's existing whitespace controls (U+001C–U+001F).
    private static boolean isRegistrationWhitespace(int codePoint) {
        return Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint) || codePoint == 0x0085;
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getUsername() {
        return username;
    }

    public String getEncodedPassword() {
        return encodedPassword;
    }
}
