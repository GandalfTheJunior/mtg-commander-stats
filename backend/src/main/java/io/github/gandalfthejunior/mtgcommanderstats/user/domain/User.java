package io.github.gandalfthejunior.mtgcommanderstats.user.domain;

import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.displaytext.InvalidNameException;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.InvalidRegistrationException.Reason;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "users")
public class User {
    /** Stored display name of an anonymized quick profile; clients show a localized label instead. */
    public static final String DELETED_PROFILE_NAME = "Deleted profile";

    @Id
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "text", updatable = false)
    private UserKind kind = UserKind.ACCOUNT;

    @Column(name = "home_group_id", updatable = false)
    private UUID homeGroupId;

    @Column(nullable = false)
    private boolean deleted;

    @Column(name = "deleted_number")
    private Integer deletedNumber;

    @Column(columnDefinition = "text")
    private String email;

    @Column(nullable = false, columnDefinition = "text")
    private String username;

    @Column(name = "encoded_password", columnDefinition = "text")
    private String encodedPassword;

    protected User() {
    }

    public User(String email, String username, String encodedPassword) {
        this.id = UUID.randomUUID();
        if (email == null || email.isBlank()) {
            throw new InvalidRegistrationException(Reason.INVALID_EMAIL);
        }
        this.email = email;
        this.username = trimUsername(username);
        if (encodedPassword == null || encodedPassword.isBlank()) {
            throw new IllegalArgumentException("An encoded password is required.");
        }
        this.encodedPassword = encodedPassword;
    }

    /** A credential-less placeholder member of exactly one group; it can never authenticate. */
    public static User quickProfile(UUID homeGroupId, String username) {
        if (homeGroupId == null) {
            throw new IllegalArgumentException("A quick profile requires a home group.");
        }
        User profile = new User();
        profile.id = UUID.randomUUID();
        profile.kind = UserKind.QUICK_PROFILE;
        profile.homeGroupId = homeGroupId;
        profile.username = new Username(username).value();
        return profile;
    }

    public void renameQuickProfile(String username) {
        requireActiveQuickProfile();
        this.username = new Username(username).value();
    }

    /** Replaces the display name without retaining it; participations and decks stay intact. */
    public void anonymize(int deletedNumber) {
        requireActiveQuickProfile();
        if (deletedNumber < 1) {
            throw new IllegalArgumentException("A positive deleted-profile number is required.");
        }
        this.username = DELETED_PROFILE_NAME;
        this.deleted = true;
        this.deletedNumber = deletedNumber;
    }

    private void requireActiveQuickProfile() {
        if (kind != UserKind.QUICK_PROFILE || deleted) {
            throw new IllegalStateException("Only active quick profiles can be changed.");
        }
    }

    public static String trimUsername(String username) {
        try {
            return new Username(username).value();
        } catch (InvalidNameException exception) {
            throw new InvalidRegistrationException(switch (exception.reason()) {
                case BLANK -> Reason.BLANK_USERNAME;
                case INVALID_CHARACTERS -> Reason.INVALID_USERNAME;
                case TOO_LONG -> Reason.LONG_USERNAME;
            });
        }
    }

    public static void validatePassword(String password) {
        if (password == null || password.codePoints().allMatch(User::isPasswordWhitespace)) {
            throw new InvalidRegistrationException(Reason.BLANK_PASSWORD);
        }
        if (password.codePointCount(0, password.length()) < 12) {
            throw new InvalidRegistrationException(Reason.SHORT_PASSWORD);
        }
    }

    private static boolean isPasswordWhitespace(int codePoint) {
        return Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint) || codePoint == 0x0085;
    }

    public UUID getId() {
        return id;
    }

    public UserKind getKind() {
        return kind;
    }

    public boolean isQuickProfile() {
        return kind == UserKind.QUICK_PROFILE;
    }

    public UUID getHomeGroupId() {
        return homeGroupId;
    }

    public boolean isDeleted() {
        return deleted;
    }

    public Integer getDeletedNumber() {
        return deletedNumber;
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
