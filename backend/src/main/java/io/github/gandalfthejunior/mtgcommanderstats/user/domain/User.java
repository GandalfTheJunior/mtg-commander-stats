package io.github.gandalfthejunior.mtgcommanderstats.user.domain;

import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.displaytext.DisplayText;
import io.github.gandalfthejunior.mtgcommanderstats.displaytext.InvalidDisplayTextException;
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
        try {
            return new DisplayText(username).value();
        } catch (InvalidDisplayTextException exception) {
            throw new InvalidRegistrationException();
        }
    }

    public static void validatePassword(String password) {
        if (password == null || password.codePoints().allMatch(DisplayText::isBoundaryWhitespace)
                || password.codePointCount(0, password.length()) < 12) {
            throw new InvalidRegistrationException();
        }
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
