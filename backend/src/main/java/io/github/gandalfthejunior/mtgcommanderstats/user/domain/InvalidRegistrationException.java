package io.github.gandalfthejunior.mtgcommanderstats.user.domain;

public class InvalidRegistrationException extends RuntimeException {
    public InvalidRegistrationException() {
        super("Username and password must satisfy the registration requirements.");
    }
}
