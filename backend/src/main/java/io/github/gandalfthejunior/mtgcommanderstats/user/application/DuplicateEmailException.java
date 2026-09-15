package io.github.gandalfthejunior.mtgcommanderstats.user.application;

public class DuplicateEmailException extends RuntimeException {
    public DuplicateEmailException() {
        super("Email is already registered.");
    }
}
