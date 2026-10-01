package io.github.gandalfthejunior.mtgcommanderstats.displaytext;

public class InvalidDisplayTextException extends IllegalArgumentException {
    public InvalidDisplayTextException() {
        super("Display text is required.");
    }
}
