package io.github.gandalfthejunior.mtgcommanderstats.user.application;

public class DuplicateUsernameException extends RuntimeException {
    public DuplicateUsernameException() {
        super("Username is already registered.");
    }
}
