package io.github.gandalfthejunior.mtgcommanderstats.user.application;

public class DuplicateQuickProfileNameException extends RuntimeException {
    public DuplicateQuickProfileNameException() {
        super("Another quick profile in this group already uses this name.");
    }
}
