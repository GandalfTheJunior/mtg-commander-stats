package io.github.gandalfthejunior.mtgcommanderstats.user.domain;

import java.util.List;

public class InvalidRegistrationException extends RuntimeException {
    public enum Reason {
        INVALID_EMAIL, BLANK_USERNAME, INVALID_USERNAME, LONG_USERNAME, RESERVED_USERNAME, BLANK_PASSWORD,
        SHORT_PASSWORD
    }

    private final List<Reason> reasons;

    public InvalidRegistrationException(Reason reason) {
        this(List.of(reason));
    }

    public InvalidRegistrationException(List<Reason> reasons) {
        super("Username and password must satisfy the registration requirements.");
        this.reasons = List.copyOf(reasons);
    }

    public List<Reason> reasons() {
        return reasons;
    }
}
